/**
 * Org Finder — Ticket 2.2-BE-B.
 *
 * Direct port of `find_org` + `_maybe_upgrade_to_parent` +
 * `_search_org_by_name_validated` + `_enrich_org_by_domain` from the email
 * prospector's stages/s3_enrich.py (~lines 785-920, 1630-1842).
 *
 * Given a ResolvedCompany (output of Ticket 2.2-BE-A's resolveCompany), runs
 * the 5-strategy Apollo cascade to find the canonical Apollo org:
 *
 *   1. Domain enrich on corporate_domain (most reliable)
 *   2. Domain enrich on alternative_domains (with name-mismatch guard)
 *   3. Name search WITH domain validation
 *   4. Name search on each search_query WITH domain validation
 *   5. Parent company name search (no domain validation — different domain OK)
 *
 * After finding an org, `_maybe_upgrade_to_parent` checks whether the parent
 * company has more employees in Apollo and upgrades if so. Large companies
 * (SMBC Group, Grupo Dia) have most contacts indexed under the parent.
 *
 * Audit fixes (Godlike v2 — applied during 2.2-BE-A; same patterns reused):
 *   - sanitizeStr applied to all incoming strings before Apollo round-trip
 *   - All Apollo failures fall through to the next strategy (returns null
 *     on full exhaustion); never throws on Apollo HTTP errors
 *   - Name-mismatch guard on alt-domain results (Emma fintech vs Emma sleep)
 *   - Industry-divergence detection on multi-match name search (Astrum
 *     Games vs Astrum CRO) — returns null rather than guess
 */

import { apolloPost, sanitizeStr } from "./apolloProspector";
import type { ResolvedCompany } from "./companyResolver";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ApolloOrg {
  id: string;
  name: string;
  /** Best-known domain for this org. May be the corporate_domain we matched on,
   *  or Apollo's primary_domain if we found by name. */
  domain: string;
  industry: string;
  estimatedNumEmployees: number;
  country: string;
}

export interface FindOrgResult {
  org: ApolloOrg | null;
  /** Which strategy succeeded. Useful for diagnostics + UI display. */
  strategy:
    | "domain_enrich"
    | "alt_domain_enrich"
    | "name_validated"
    | "query_validated"
    | "parent_direct"
    | "none";
  /** Whether `_maybe_upgrade_to_parent` swapped us to the parent org. */
  upgradedToParent: boolean;
  /** Diagnostic log of strategies attempted and their outcomes. */
  attempts: Array<{
    strategy:
      | "domain_enrich"
      | "alt_domain_enrich"
      | "name_validated"
      | "query_validated"
      | "parent_direct";
    input: string;
    outcome:
      | "found"
      | "not_found"
      | "rejected_name_mismatch"
      | "rejected_zero_employees"
      | "ambiguous";
    detail?: string;
  }>;
}

// ─── Constants (verbatim port) ────────────────────────────────────────────

/** Signals that an alt-domain match landed on a different-industry company.
 *  Mirrors the Python list. */
const DIFFERENT_COMPANY_SIGNALS = [
  "sleep",
  "mattress",
  "bed",
  "furniture",
  "home",
  "email",
  "marketing",
  "automation",
  "campaign",
];

/** Words to ignore in name-similarity scoring. Mirrors Python noise set. */
const NAME_NOISE_WORDS = new Set([
  "inc",
  "inc.",
  "llc",
  "ltd",
  "ltd.",
  "co",
  "co.",
  "corp",
  "corp.",
  "the",
  "group",
  "company",
  "companies",
  "gmbh",
  "ag",
  "sa",
  "plc",
]);

// ─── Legal suffix stripping (port of LEGAL_SUFFIXES regex) ────────────────

const LEGAL_SUFFIXES = new RegExp(
  // Optional parenthetical location/branch markers
  String.raw`\s*(?:\([A-Z][A-Za-z]{0,4}\)\s*)?` +
    String.raw`\b(?:` +
    // Malaysia / SEA
    String.raw`Sdn\.?\s*Bhd\.?|SDN\.?\s*BHD\.?` +
    String.raw`|Bhd\.?|BHD\.?|Berhad|BERHAD` +
    String.raw`|Pte\.?\s*Ltd\.?|PTE\.?\s*LTD\.?` +
    String.raw`|PT\.?\s*Tbk\.?|PT\.?` +
    // Western
    String.raw`|GmbH|Gmbh|gmbh` +
    String.raw`|OÜ|Oü|oü` +
    String.raw`|Ltd\.?|LTD\.?|Limited|LIMITED` +
    String.raw`|Anonim\s+[Ss]irketi|ANONİM\s+ŞİRKETİ|A\.?[SŞ]\.?` +
    String.raw`|Inc\.?|INC\.?` +
    String.raw`|LLC|L\.L\.C\.?` +
    String.raw`|Corp\.?|Corporation` +
    String.raw`|S\.?A\.?|S\.?L\.?|S\.?R\.?L\.?` +
    String.raw`|B\.?V\.?|N\.?V\.?` +
    String.raw`|AG|KG|SE|PLC|Plc` +
    String.raw`|Pty\.?\s*Ltd\.?` +
    String.raw`|Co\.?|Company` +
    // Japan / Korea
    String.raw`|K\.?K\.?|Kabushiki\s+Kaisha|株式会社` +
    String.raw`|Co\.?,?\s*Ltd\.?` +
    // India
    String.raw`|Pvt\.?\s*Ltd\.?|PVT\.?\s*LTD\.?` +
    String.raw`|Private\s+Limited` +
    // ME/Africa
    String.raw`|DMCC|FZ-?LLC|FZCO|FZE` +
    // LatAm
    String.raw`|S\.?A\.?\s*de\s*C\.?V\.?` +
    String.raw`|Ltda\.?|LTDA\.?` +
    // Catch-all
    String.raw`|& Company|and Company` +
    String.raw`)\s*$`,
  "i",
);

const TRADEMARK_SYMBOLS = /[®™©℠]/g;
const TITLE_TAGLINE = /\s*[-–—:|·•]\s+(?!Inc|Ltd|GmbH|LLC|Corp).+$/;

export function stripLegalSuffix(name: string): string {
  if (!name) return name;
  const cleaned = name.replace(LEGAL_SUFFIXES, "").trim().replace(/,\s*$/, "").trim();
  return cleaned || name;
}

export function stripStoreTagline(name: string): string {
  if (!name) return name;
  let cleaned = name.replace(TRADEMARK_SYMBOLS, "").trim();
  cleaned = cleaned.replace(TITLE_TAGLINE, "").trim();
  return cleaned.length >= 2 ? cleaned : name;
}

// ─── Domain helpers (port of apollo_domain_match.py) ──────────────────────

/**
 * Best-effort registrable domain (eTLD+1) extraction. Without a TLD list lib
 * (Python uses tldextract), we use a pragmatic heuristic: take the last 2
 * labels for typical .com/.io/.co domains, last 3 for known compound TLDs
 * (.co.uk, .co.jp, .com.br, .com.au, .ne.jp, etc.).
 *
 * This matches Python's tldextract output for the domain shapes the email
 * prospector encounters in practice. Edge cases (e.g. .gov.uk) are rare in
 * the prospect domain space and degrade to the 2-label fallback.
 */
const COMPOUND_TLDS = new Set([
  "co.uk",
  "co.jp",
  "co.kr",
  "co.in",
  "co.id",
  "co.il",
  "co.za",
  "com.br",
  "com.au",
  "com.mx",
  "com.tr",
  "com.ar",
  "com.cn",
  "com.sg",
  "com.my",
  "com.tw",
  "com.hk",
  "com.ph",
  "com.vn",
  "com.eg",
  "ne.jp",
  "or.jp",
  "ac.uk",
  "ac.jp",
  "gov.uk",
  "org.uk",
  "net.au",
  "org.au",
]);

export function registrableDomain(val: string): string | null {
  if (!val) return null;
  // Strip protocol + path
  let s = val.toLowerCase().trim();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  if (!s) return null;
  const labels = s.split(".");
  if (labels.length < 2) return null;
  // Filter empty labels
  const clean = labels.filter((l) => l.length > 0);
  if (clean.length < 2) return null;
  // Check compound TLD
  if (clean.length >= 3) {
    const last2 = clean.slice(-2).join(".");
    if (COMPOUND_TLDS.has(last2)) {
      return clean.slice(-3).join(".");
    }
  }
  return clean.slice(-2).join(".");
}

function extractOrgDomains(org: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const field of ["primary_domain", "domain", "website_url", "linkedin_url"]) {
    const val = sanitizeStr(org[field]).toLowerCase();
    if (!val) continue;
    out.add(val);
    const reg = registrableDomain(val);
    if (reg) out.add(reg);
  }
  return out;
}

function organizationDomainMatchesQuery(
  org: Record<string, unknown>,
  expectedDomain: string,
): boolean {
  const expRaw = sanitizeStr(expectedDomain).toLowerCase();
  if (!expRaw) return true;
  const expReg = registrableDomain(expRaw);
  const orgDomains = extractOrgDomains(org);
  if (!expReg) {
    // Unparseable query — only accept exact raw hit
    for (const od of orgDomains) {
      if (od === expRaw) return true;
    }
    return false;
  }
  for (const od of orgDomains) {
    if (od === expRaw || od === expReg) return true;
    const odReg = registrableDomain(od);
    if (odReg && odReg === expReg) return true;
  }
  return false;
}

// ─── Mappers ──────────────────────────────────────────────────────────────

function orgFromDict(o: Record<string, unknown>, domainOverride?: string): ApolloOrg {
  const country = sanitizeStr(o.country) || (() => {
    const raw = sanitizeStr(o.raw_address) || sanitizeStr(o.location);
    if (!raw) return "";
    const parts = raw.split(",").map((p) => p.trim());
    return parts.length >= 2 ? parts[parts.length - 1] : "";
  })();
  const primaryDomain = sanitizeStr(o.primary_domain) || sanitizeStr(o.domain);
  return {
    id: sanitizeStr(o.id) || sanitizeStr(o.organization_id),
    name: sanitizeStr(o.name),
    domain: domainOverride || primaryDomain,
    industry: sanitizeStr(o.industry),
    estimatedNumEmployees:
      typeof o.estimated_num_employees === "number" ? o.estimated_num_employees : 0,
    country,
  };
}

// ─── Strategy implementations ─────────────────────────────────────────────

/** Strategy 1/2: enrich Apollo org by single domain. Falls back from
 *  /organizations/enrich to /mixed_companies/search if enrich returns nothing.
 *  Returns null if neither finds a domain-validated org. */
export async function enrichOrgByDomain(
  domain: string,
  signal?: AbortSignal,
): Promise<ApolloOrg | null> {
  const cleanDomain = sanitizeStr(domain);
  if (!cleanDomain) return null;

  let data = await apolloPost({
    path: "/organizations/enrich",
    body: { domain: cleanDomain },
    signal,
  });

  let orgRaw: Record<string, unknown> | null = null;
  if (data && data.organization && typeof data.organization === "object") {
    orgRaw = data.organization as Record<string, unknown>;
  } else {
    // Fallback to /mixed_companies/search
    data = await apolloPost({
      path: "/mixed_companies/search",
      body: {
        q_organization_domains: cleanDomain,
        page: 1,
        per_page: 5,
      },
      signal,
    });
    if (!data) return null;
    const orgs = (data.organizations as unknown[]) || (data.companies as unknown[]) || [];
    if (!Array.isArray(orgs) || orgs.length === 0) return null;
    orgRaw = orgs[0] as Record<string, unknown>;
  }

  if (!orgRaw) return null;

  if (!organizationDomainMatchesQuery(orgRaw, cleanDomain)) {
    return null;
  }
  return orgFromDict(orgRaw, cleanDomain);
}

/** Word-overlap similarity between two company names, ignoring noise words. */
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().split(/\s+/).filter((w) => w && !NAME_NOISE_WORDS.has(w)),
  );
  const wordsB = new Set(
    b.toLowerCase().split(/\s+/).filter((w) => w && !NAME_NOISE_WORDS.has(w)),
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/**
 * Strategy 3/4: Search Apollo orgs by name and validate domain match.
 * - If domain constraint provided: pick the largest-by-employees org whose
 *   domain matches. Returns null if any results but none match (don't fall
 *   through to name-only — defends against Emma fintech finding Emma sleep).
 * - If no domain constraint: name-similarity matching with industry-divergence
 *   guard (multiple matches in different industries → null, deferring to LLM
 *   disambiguation upstream).
 */
export async function searchOrgByNameValidated(
  name: string,
  expectedDomain: string,
  altDomains: string[],
  signal?: AbortSignal,
): Promise<ApolloOrg | null> {
  const cleanName = sanitizeStr(name);
  if (!cleanName) return null;

  const data = await apolloPost({
    path: "/mixed_companies/search",
    body: { q_organization_name: cleanName, page: 1, per_page: 10 },
    signal,
  });
  if (!data) return null;
  const orgs =
    (data.organizations as unknown[]) ||
    (data.companies as unknown[]) ||
    (data.accounts as unknown[]) ||
    [];
  if (!Array.isArray(orgs) || orgs.length === 0) return null;

  const acceptableDomains = new Set<string>();
  if (expectedDomain) acceptableDomains.add(sanitizeStr(expectedDomain).toLowerCase());
  for (const d of altDomains) {
    const sd = sanitizeStr(d).toLowerCase();
    if (sd) acceptableDomains.add(sd);
  }

  if (acceptableDomains.size > 0) {
    // First pass: collect orgs whose domain matches, pick largest by employees
    const matched: Array<{ org: Record<string, unknown>; domain: string }> = [];
    for (const o of orgs) {
      if (!o || typeof o !== "object") continue;
      const ot = o as Record<string, unknown>;
      for (const ad of acceptableDomains) {
        if (organizationDomainMatchesQuery(ot, ad)) {
          matched.push({ org: ot, domain: ad });
          break;
        }
      }
    }
    if (matched.length === 0) {
      // Domain constraint present but no match — DO NOT fall through. Returning
      // a name-only match here is the Emma fintech → Emma sleep failure mode.
      return null;
    }
    matched.sort(
      (a, b) =>
        ((b.org.estimated_num_employees as number) || 0) -
        ((a.org.estimated_num_employees as number) || 0),
    );
    return orgFromDict(matched[0].org, matched[0].domain);
  }

  // No domain constraint: name-similarity matching
  const nameLower = cleanName.toLowerCase();
  const nameWords = new Set(nameLower.split(/\s+/).filter(Boolean));
  const matchingOrgs: Record<string, unknown>[] = [];

  for (const o of orgs) {
    if (!o || typeof o !== "object") continue;
    const ot = o as Record<string, unknown>;
    const orgNameLower = sanitizeStr(ot.name).toLowerCase();
    let isMatch = false;
    if (nameLower === orgNameLower) {
      isMatch = true;
    } else {
      let isSubstring = nameLower.includes(orgNameLower) || orgNameLower.includes(nameLower);
      if (isSubstring && nameLower.length < 4) {
        const orgWords = orgNameLower.split(/\s+/);
        if (!orgWords.includes(nameLower)) isSubstring = false;
      }
      if (isSubstring) {
        const orgWords = new Set(orgNameLower.split(/\s+/));
        for (const w of nameWords) {
          if (orgWords.has(w)) {
            isMatch = true;
            break;
          }
        }
      } else {
        if (nameSimilarity(nameLower, orgNameLower) > 0.6) isMatch = true;
      }
    }
    if (isMatch) matchingOrgs.push(ot);
  }

  if (matchingOrgs.length === 0) return null;
  if (matchingOrgs.length === 1) return orgFromDict(matchingOrgs[0]);

  // Multiple name matches — check industry divergence
  const industries = new Set<string>();
  for (const o of matchingOrgs) {
    const ind = sanitizeStr(o.industry).toLowerCase();
    if (ind) industries.add(ind);
  }
  if (industries.size > 1) {
    // Ambiguous — defer rather than guess
    return null;
  }
  // Same industry — pick largest
  matchingOrgs.sort(
    (a, b) =>
      ((b.estimated_num_employees as number) || 0) -
      ((a.estimated_num_employees as number) || 0),
  );
  return orgFromDict(matchingOrgs[0]);
}

/** Search by name without domain validation. Used for parent company lookups
 *  where the parent legitimately has a different domain. Riskier than the
 *  validated variant — still does industry-divergence check. */
async function searchOrgByNameNoDomain(
  name: string,
  signal?: AbortSignal,
): Promise<ApolloOrg | null> {
  return searchOrgByNameValidated(name, "", [], signal);
}

// ─── _maybe_upgrade_to_parent ─────────────────────────────────────────────

async function maybeUpgradeToParent(
  childOrg: ApolloOrg,
  parentCompany: string,
  corporateDomain: string,
  altDomains: string[],
  signal?: AbortSignal,
): Promise<{ org: ApolloOrg; upgraded: boolean }> {
  const cleanParent = sanitizeStr(parentCompany);
  if (!cleanParent) return { org: childOrg, upgraded: false };

  const cleanedParentName = stripLegalSuffix(cleanParent);
  let parentOrg = await searchOrgByNameValidated(
    cleanedParentName,
    corporateDomain,
    altDomains,
    signal,
  );
  if (!parentOrg) {
    parentOrg = await searchOrgByNameNoDomain(cleanedParentName, signal);
  }
  if (!parentOrg || !parentOrg.id) return { org: childOrg, upgraded: false };
  if (parentOrg.id === childOrg.id) return { org: childOrg, upgraded: false };

  if (parentOrg.estimatedNumEmployees > childOrg.estimatedNumEmployees) {
    return { org: parentOrg, upgraded: true };
  }
  return { org: childOrg, upgraded: false };
}

// ─── Public: findOrg cascade ─────────────────────────────────────────────

/**
 * Run the 5-strategy cascade. Returns the first org found, or null if all
 * strategies exhaust.
 *
 * Each strategy's outcome is logged in `attempts` so the route layer can
 * write a diagnostic action_log without re-running the search.
 */
export async function findOrg(
  resolved: ResolvedCompany,
  signal?: AbortSignal,
): Promise<FindOrgResult> {
  const attempts: FindOrgResult["attempts"] = [];

  const companyName = sanitizeStr(resolved.companyName);
  const parentCompany = sanitizeStr(resolved.parentCompany);
  const corporateDomain = sanitizeStr(resolved.corporateDomain);
  // Audit fixes A-CYCLE5-1 + A-CYCLE5-2: dedup altDomains within itself AND
  // against corporateDomain. Strategy 1 already ran corporateDomain; running
  // it again in Strategy 2 wastes an Apollo call. Same domain twice in
  // altDomains likewise wastes a call.
  const _rawAlt = (resolved.alternativeDomains || []).map(sanitizeStr).filter(Boolean);
  const _seenDomains = new Set<string>();
  if (corporateDomain) _seenDomains.add(corporateDomain.toLowerCase());
  const altDomains: string[] = [];
  for (const d of _rawAlt) {
    const dLower = d.toLowerCase();
    if (_seenDomains.has(dLower)) continue;
    _seenDomains.add(dLower);
    altDomains.push(d);
  }
  const searchQueries = (resolved.searchQueries || [])
    .map(sanitizeStr)
    .filter(Boolean);

  // APO2: graceful abort before any Apollo call
  if (signal?.aborted) return { org: null, strategy: "none", upgradedToParent: false, attempts };

  // ── Strategy 1: corporate domain enrich ─────────────────────────────────
  if (corporateDomain) {
    const org = await enrichOrgByDomain(corporateDomain, signal);
    if (org && org.id && org.estimatedNumEmployees > 0) {
      attempts.push({ strategy: "domain_enrich", input: corporateDomain, outcome: "found", detail: org.name });
      const upgraded = await maybeUpgradeToParent(org, parentCompany, corporateDomain, altDomains, signal);
      return {
        org: upgraded.org,
        strategy: "domain_enrich",
        upgradedToParent: upgraded.upgraded,
        attempts,
      };
    }
    if (org && org.id) {
      attempts.push({ strategy: "domain_enrich", input: corporateDomain, outcome: "rejected_zero_employees", detail: org.name });
    } else {
      attempts.push({ strategy: "domain_enrich", input: corporateDomain, outcome: "not_found" });
    }
  }

  // ── Strategy 2: alternative domains, with name-mismatch guard ───────────
  const cleanCompanyForGuard = stripStoreTagline(stripLegalSuffix(companyName)).toLowerCase().trim();
  for (const altDomain of altDomains) {
    if (signal?.aborted) break; // APO2: graceful abort in alt-domain loop
    const org = await enrichOrgByDomain(altDomain, signal);
    if (!org || !org.id) {
      attempts.push({ strategy: "alt_domain_enrich", input: altDomain, outcome: "not_found" });
      continue;
    }
    if (org.estimatedNumEmployees === 0) {
      attempts.push({ strategy: "alt_domain_enrich", input: altDomain, outcome: "rejected_zero_employees", detail: org.name });
      continue;
    }
    const orgNameLower = org.name.toLowerCase();
    const hasMismatchSignal = DIFFERENT_COMPANY_SIGNALS.some((sig) => orgNameLower.includes(sig));
    if (cleanCompanyForGuard && cleanCompanyForGuard.length > 0) {
      if (orgNameLower.includes(cleanCompanyForGuard) && !hasMismatchSignal) {
        attempts.push({ strategy: "alt_domain_enrich", input: altDomain, outcome: "found", detail: org.name });
        const upgraded = await maybeUpgradeToParent(org, parentCompany, corporateDomain, altDomains, signal);
        return {
          org: upgraded.org,
          strategy: "alt_domain_enrich",
          upgradedToParent: upgraded.upgraded,
          attempts,
        };
      }
      attempts.push({ strategy: "alt_domain_enrich", input: altDomain, outcome: "rejected_name_mismatch", detail: org.name });
    } else {
      // No name to validate against — accept (matches Python behavior)
      attempts.push({ strategy: "alt_domain_enrich", input: altDomain, outcome: "found", detail: org.name });
      const upgraded = await maybeUpgradeToParent(org, parentCompany, corporateDomain, altDomains, signal);
      return {
        org: upgraded.org,
        strategy: "alt_domain_enrich",
        upgradedToParent: upgraded.upgraded,
        attempts,
      };
    }
  }

  // ── Strategy 3: name search with domain validation ─────────────────────
  if (companyName) {
    const cleanName = stripLegalSuffix(companyName);
    const org = await searchOrgByNameValidated(cleanName, corporateDomain, altDomains, signal);
    if (org) {
      attempts.push({ strategy: "name_validated", input: cleanName, outcome: "found", detail: org.name });
      const upgraded = await maybeUpgradeToParent(org, parentCompany, corporateDomain, altDomains, signal);
      return {
        org: upgraded.org,
        strategy: "name_validated",
        upgradedToParent: upgraded.upgraded,
        attempts,
      };
    }
    attempts.push({ strategy: "name_validated", input: cleanName, outcome: "not_found" });
  }

  // ── Strategy 4: each search query ───────────────────────────────────────
  for (const query of searchQueries) {
    if (signal?.aborted) break; // APO2: graceful abort in search-query loop
    if (!query || query === companyName) continue;
    const cleanQuery = stripLegalSuffix(query);
    const org = await searchOrgByNameValidated(cleanQuery, corporateDomain, altDomains, signal);
    if (org) {
      attempts.push({ strategy: "query_validated", input: cleanQuery, outcome: "found", detail: org.name });
      const upgraded = await maybeUpgradeToParent(org, parentCompany, corporateDomain, altDomains, signal);
      return {
        org: upgraded.org,
        strategy: "query_validated",
        upgradedToParent: upgraded.upgraded,
        attempts,
      };
    }
    attempts.push({ strategy: "query_validated", input: cleanQuery, outcome: "not_found" });
  }

  // ── Strategy 5: parent company direct (no domain validation) ────────────
  if (parentCompany && parentCompany !== companyName) {
    const cleanParent = stripLegalSuffix(parentCompany);
    let org = await searchOrgByNameValidated(cleanParent, corporateDomain, altDomains, signal);
    if (!org) {
      org = await searchOrgByNameNoDomain(cleanParent, signal);
    }
    if (org) {
      attempts.push({ strategy: "parent_direct", input: cleanParent, outcome: "found", detail: org.name });
      // No upgrade — parent IS the parent.
      return { org, strategy: "parent_direct", upgradedToParent: false, attempts };
    }
    attempts.push({ strategy: "parent_direct", input: cleanParent, outcome: "not_found" });
  }

  return { org: null, strategy: "none", upgradedToParent: false, attempts };
}

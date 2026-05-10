/**
 * Subsidiary Expander — Ticket 2.2-BE-C, Phase 3.
 *
 * Direct port of the Phase 3 block in `collect_contacts` from stages/s3_enrich.py
 * (~lines 1988-2098). When a holding company is found (SMBC Group, Grupo Dia,
 * VK, Tencent Holdings) but its standard-tier contact searches return too few
 * results, expand the search to subsidiaries / sister companies that share the
 * brand root (SMBC Nikko Securities, SMBC Consumer Finance, etc.).
 *
 * Why this exists:
 *   - Apollo indexes large groups as one entity but real contacts live under
 *     subsidiary org IDs. Searching only the parent misses 80% of the people.
 *   - Brand-root matching keeps the relationship constraint without requiring
 *     the orchestrator to know the corporate tree in advance.
 *   - The relaxed email-domain set (parent + alt domains + subsidiary domains)
 *     lets contacts at smbcnikko.com count toward a "SMBC Group" prospect.
 *
 * Strategy A: search Apollo orgs by brand root variants, filter by
 *             name-root containment, take orgs with ≥5 employees (Python
 *             threshold).
 * Strategy B: enrich orgs by `alternativeDomains` (separate Apollo entities
 *             for diacorporate.com, dia.es, etc.).
 *
 * After collecting up to N subsidiary orgs, run primary + exec title-tiered
 * people search across each, merging into the running contact list with the
 * relaxed email-domain whitelist.
 */

import { apolloPost, sanitizeStr } from "./apolloProspector";
import {
  PRIMARY_TITLES,
  EXEC_FALLBACK_TITLES,
  getApolloLocations,
  type ApolloContact,
} from "./contactCollector";
import { stripLegalSuffix } from "./orgFinder";
import type { ApolloOrg } from "./orgFinder";

// ─── Constants (verbatim port from Python) ────────────────────────────────

const SUB_NAME_VARIANTS_TO_SEARCH = 3;
const SUB_NAME_SEARCH_PER_PAGE = 10;
const SUB_NAME_MIN_EMPLOYEES = 5;
const SUB_ALT_DOMAINS_TO_ENRICH = 3;
const SUB_MAX_ORGS_TO_QUERY_PEOPLE = 8;

/** Generic prefix words that should NOT serve as the brand root.
 *  Mirrors Python: "grupo", "group", "the", "pt", "bank", "holdings". */
const GENERIC_PREFIX_WORDS = new Set([
  "grupo",
  "group",
  "the",
  "pt",
  "bank",
  "holdings",
]);

// ─── Types ────────────────────────────────────────────────────────────────

export interface SubsidiaryExpansionInput {
  /** The org we already found via the standard cascade. */
  parentOrg: ApolloOrg;
  /** Resolved company name from upstream resolveCompany. */
  companyName: string;
  /** Parent company name if separately identified by upstream/Opus. */
  parentCompany?: string;
  /** Alternative domains discovered upstream. */
  alternativeDomains?: string[];
  /** Multinational flag — if true and focusMarket set, geo-scope people search. */
  isMultinational?: boolean;
  /** Focus market for geo-scoping. */
  focusMarket?: string;
  /** Already-collected contacts (mutated in place by this expander). */
  collected: ApolloContact[];
  /** Already-seen Apollo person IDs (mutated in place). */
  seenIds: Set<string>;
  /** Target contact count (cascade stops at target). */
  target: number;
  /** Acceptable email domains from upstream cascade. The expander adds
   *  subsidiary-org domains to a *relaxed* copy for cross-org searches; the
   *  caller's set is not mutated. */
  acceptableEmailDomains: ReadonlySet<string>;
  /** Optional AbortSignal — passed through to apolloPost. */
  signal?: AbortSignal;
  /** Inject a custom processPeople function for tests; default is the
   *  contactCollector's processPeople (which applies title + domain checks). */
  processPeople: ProcessPeopleFn;
  /** Inject a custom apolloPeopleSearch fn for tests. */
  apolloPeopleSearch: ApolloPeopleSearchFn;
}

export interface SubsidiaryExpansionResult {
  /** Number of subsidiary orgs the expander discovered (Strategy A + B). */
  subsidiariesFound: number;
  /** Per-subsidiary diagnostic: what we searched and how many we collected. */
  subsidiaryAttempts: Array<{
    orgName: string;
    orgDomain: string;
    employees: number;
    contactsAdded: number;
  }>;
  /** Whether the expander ran (false = preconditions not met). */
  ran: boolean;
}

/** Function signature for the contactCollector's processPeople — keeps this
 *  module decoupled from contactCollector internals. The orchestrator wires
 *  the concrete implementation. */
export type ProcessPeopleFn = (
  people: Array<Record<string, unknown>>,
  collected: ApolloContact[],
  seenIds: Set<string>,
  orgDomain: string,
  tier: string,
  acceptableEmailDomains: Set<string>,
  rejected: { noEmail: number; domainMismatch: number; titleRejected: number; duplicate: number },
  target: number,
) => Promise<{ candidatesSeen: number; accepted: number }>;

/** Function signature for the contactCollector's apolloPeopleSearch wrapper. */
export type ApolloPeopleSearchFn = (args: {
  org: ApolloOrg;
  titles: ReadonlyArray<string> | null;
  page: number;
  locations?: string[];
  signal?: AbortSignal;
}) => Promise<Array<Record<string, unknown>>>;

// ─── Brand root extraction ────────────────────────────────────────────────

/**
 * Pick the brand root from a company name. Mirrors Python lines 2003-2019.
 * "SMBC Group" → "SMBC", "Grupo Dia" → "Dia", "Tencent Holdings" → "Tencent".
 */
function pickBrandRoot(companyName: string): string {
  const stripped = stripLegalSuffix(sanitizeStr(companyName));
  if (!stripped) return "";
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let root = words[0];
  if (GENERIC_PREFIX_WORDS.has(root.toLowerCase()) && words.length > 1) {
    root = words[1];
  }
  return root;
}

// ─── Org-from-dict mapper (local copy — avoids importing from orgFinder
//     since that would create a tight cycle through subsidiary discovery) ──

function orgFromApolloDict(o: Record<string, unknown>): ApolloOrg {
  const country =
    sanitizeStr(o.country) ||
    (() => {
      const raw = sanitizeStr(o.raw_address) || sanitizeStr(o.location);
      if (!raw) return "";
      const parts = raw.split(",").map((p) => p.trim());
      return parts.length >= 2 ? parts[parts.length - 1] : "";
    })();
  return {
    id: sanitizeStr(o.id) || sanitizeStr(o.organization_id),
    name: sanitizeStr(o.name),
    domain: sanitizeStr(o.primary_domain) || sanitizeStr(o.domain),
    industry: sanitizeStr(o.industry),
    estimatedNumEmployees:
      typeof o.estimated_num_employees === "number" ? o.estimated_num_employees : 0,
    country,
  };
}

// ─── Public: expandToSubsidiaries ─────────────────────────────────────────

/**
 * Run Phase 3 expansion. Mutates `input.collected` and `input.seenIds` in
 * place. Stops as soon as `input.collected.length >= input.target`.
 *
 * Returns a diagnostic summary; the orchestrator threads this into the
 * `/discover` response so callers can see what subsidiaries were searched.
 *
 * Preconditions for running:
 *   - collected.length < target
 *   - parentOrg has an id (we need it to dedup against the parent in subsidiary discovery)
 *   - companyName or parentCompany is non-empty
 */
export async function expandToSubsidiaries(
  input: SubsidiaryExpansionInput,
): Promise<SubsidiaryExpansionResult> {
  const result: SubsidiaryExpansionResult = {
    subsidiariesFound: 0,
    subsidiaryAttempts: [],
    ran: false,
  };

  if (input.collected.length >= input.target) return result;
  if (!input.parentOrg.id) return result;
  const companyName = sanitizeStr(input.companyName);
  const parentCompany = sanitizeStr(input.parentCompany);
  if (!companyName && !parentCompany) return result;

  result.ran = true;

  // ── Strategy A: name-variant search ──────────────────────────────────────
  const nameVariants = new Set<string>();
  let nameRoot = "";
  if (companyName) {
    nameRoot = pickBrandRoot(companyName);
    nameVariants.add(nameRoot);
    nameVariants.add(stripLegalSuffix(companyName));
  }
  if (parentCompany) {
    nameVariants.add(stripLegalSuffix(parentCompany));
  }
  if (!nameRoot && companyName) {
    const firstWord = companyName.split(/\s+/)[0];
    if (firstWord) nameRoot = firstWord;
  }

  const altDomains = (input.alternativeDomains || []).map(sanitizeStr).filter(Boolean);
  const searchedOrgIds = new Set<string>([input.parentOrg.id]);
  const subsidiaryOrgs: ApolloOrg[] = [];

  const variants = Array.from(nameVariants).filter(Boolean).slice(0, SUB_NAME_VARIANTS_TO_SEARCH);

  for (const variant of variants) {
    if (input.signal?.aborted) break;
    const data = await apolloPost({
      path: "/mixed_companies/search",
      body: {
        q_organization_name: variant,
        page: 1,
        per_page: SUB_NAME_SEARCH_PER_PAGE,
      },
      signal: input.signal,
    });
    if (!data) continue;
    const orgs =
      (data.organizations as unknown[]) ||
      (data.companies as unknown[]) ||
      (data.accounts as unknown[]) ||
      [];
    if (!Array.isArray(orgs)) continue;

    for (const o of orgs) {
      if (!o || typeof o !== "object") continue;
      const orec = o as Record<string, unknown>;
      const oid = sanitizeStr(orec.id);
      if (!oid || searchedOrgIds.has(oid)) continue;
      const emp =
        typeof orec.estimated_num_employees === "number" ? orec.estimated_num_employees : 0;
      const oname = sanitizeStr(orec.name).toLowerCase();
      // Only include orgs that share a name root and have ≥5 employees
      if (!nameRoot || !oname.includes(nameRoot.toLowerCase())) continue;
      if (emp < SUB_NAME_MIN_EMPLOYEES) continue;
      subsidiaryOrgs.push(orgFromApolloDict(orec));
      searchedOrgIds.add(oid);
    }
  }

  // ── Strategy B: alt-domain enrichment ────────────────────────────────────
  for (const altDomain of altDomains.slice(0, SUB_ALT_DOMAINS_TO_ENRICH)) {
    if (input.signal?.aborted) break;
    const data = await apolloPost({
      path: "/organizations/enrich",
      body: { domain: altDomain },
      signal: input.signal,
    });
    if (!data || !data.organization || typeof data.organization !== "object") continue;
    const orec = data.organization as Record<string, unknown>;
    const oid = sanitizeStr(orec.id);
    if (!oid || searchedOrgIds.has(oid)) continue;
    const subOrg = orgFromApolloDict(orec);
    if (!subOrg.id) continue;
    subsidiaryOrgs.push(subOrg);
    searchedOrgIds.add(oid);
  }

  result.subsidiariesFound = subsidiaryOrgs.length;
  if (subsidiaryOrgs.length === 0) return result;

  // ── Run people search across subsidiaries ────────────────────────────────
  const isMultinational = Boolean(input.isMultinational);
  const focusMarket = sanitizeStr(input.focusMarket);
  const locations =
    isMultinational && focusMarket ? getApolloLocations(focusMarket) : [];

  // Build relaxed email-domain set: parent's set + each subsidiary's domain.
  // We do NOT mutate the caller's set — they passed it as ReadonlySet for a reason.
  const relaxedDomains = new Set<string>(input.acceptableEmailDomains);
  for (const subOrg of subsidiaryOrgs) {
    if (subOrg.domain) relaxedDomains.add(subOrg.domain.toLowerCase());
  }

  // Local rejection counter — the orchestrator's outer counter is held by the
  // contactCollector; we don't need to thread it through Phase 3 since this is
  // diagnostic-only at the per-subsidiary level.
  const localRejected = { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 };

  for (const subOrg of subsidiaryOrgs.slice(0, SUB_MAX_ORGS_TO_QUERY_PEOPLE)) {
    if (input.collected.length >= input.target) break;
    if (input.signal?.aborted) break;
    const beforeCount = input.collected.length;

    for (const [tierName, tierTitles] of [
      ["primary", PRIMARY_TITLES],
      ["exec", EXEC_FALLBACK_TITLES],
    ] as const) {
      if (input.collected.length >= input.target) break;
      if (input.signal?.aborted) break;
      const people = await input.apolloPeopleSearch({
        org: subOrg,
        titles: tierTitles,
        page: 1,
        locations,
        signal: input.signal,
      });
      if (people.length === 0) continue;
      await input.processPeople(
        people,
        input.collected,
        input.seenIds,
        subOrg.domain || "",
        tierName,
        relaxedDomains,
        localRejected,
        input.target,
      );
    }

    result.subsidiaryAttempts.push({
      orgName: subOrg.name,
      orgDomain: subOrg.domain,
      employees: subOrg.estimatedNumEmployees,
      contactsAdded: input.collected.length - beforeCount,
    });
  }

  return result;
}

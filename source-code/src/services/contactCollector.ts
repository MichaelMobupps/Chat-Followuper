/**
 * Contact Collector — Ticket 2.2-BE-B.
 *
 * Direct port of `collect_contacts` + `_apollo_people_search` + `_process_people`
 * from the email prospector's stages/s3_enrich.py (~lines 1848-2330).
 *
 * Given an ApolloOrg + ResolvedCompany context, runs the people-search cascade:
 *
 *   Phase 1 — Title-tiered: PRIMARY → SECONDARY → EXEC titles, page 1-3 each
 *   Phase 2 — Broad (no title filter), page 1-2: catches regional companies
 *             with non-Western title patterns
 *   Phase 3 — Subsidiary expansion (deferred to 2.2-BE-C orchestrator; out of
 *             scope for stage B; would require the LLM-validated cross-org
 *             search which depends on opusRescue infrastructure)
 *
 * Phase 2b (micro-org permissive fallback) is INCLUDED here — it doesn't need
 * orchestrator support, just runs after phases 1 + 2 if the org is small.
 *
 * Domain validation: each contact's email must end in one of the acceptable
 * corporate domains. Prevents cross-company contamination (e.g. Goodroid
 * Romania contacts mixed in when searching Goodroid Japan).
 *
 * Title acceptance: ROLE_TARGET_PATTERNS accept-list, ROLE_REJECT_PATTERNS
 * deny-list (recruiting/HR), EXEC_ROLE_PATTERNS accept on exec/broad tiers.
 */

import { apolloPost, sanitizeStr } from "./apolloProspector";
import type { ApolloOrg } from "./orgFinder";
import type { ResolvedCompany } from "./companyResolver";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ApolloContact {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  seniority: string;
}

export interface CollectContactsOptions {
  /** Target number of contacts. Default 6. Cascade stops as soon as reached. */
  targetContacts?: number;
}

export interface CollectContactsResult {
  contacts: ApolloContact[];
  /** Diagnostic phase log so the route can audit what ran without re-running. */
  phasesRun: Array<{
    phase: "primary" | "secondary" | "exec" | "broad" | "broad_micro";
    pages: number;
    candidatesSeen: number;
    accepted: number;
  }>;
  /** Reasons contacts were rejected (counts only, no PII) for diagnostics. */
  rejected: {
    noEmail: number;
    domainMismatch: number;
    titleRejected: number;
    duplicate: number;
  };
}

// ─── Constants (verbatim port from Python) ────────────────────────────────

export const PRIMARY_TITLES: ReadonlyArray<string> = [
  "user acquisition",
  "ua",
  "growth",
  "performance marketing",
  "paid acquisition",
  "paid media",
  "digital marketing",
  "media buying",
  "customer acquisition",
  "marketing manager",
  "growth marketing",
];

export const SECONDARY_TITLES: ReadonlyArray<string> = [
  "business development",
  "partnerships",
  "strategic partnerships",
  "growth partnerships",
  "marketing director",
  "marketing lead",
];

export const EXEC_FALLBACK_TITLES: ReadonlyArray<string> = [
  "ceo",
  "chief executive",
  "founder",
  "co-founder",
  "cmo",
  "chief marketing",
  "vp marketing",
  "head of marketing",
  "director of marketing",
  "vp growth",
  "head of growth",
];

const ROLE_TARGET_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["marketing", /\bmarketing\b/],
  ["growth", /\bgrowth\b/],
  ["user acquisition", /\buser acquisition\b/],
  ["customer acquisition", /\bcustomer acquisition\b/],
  ["performance marketing", /\bperformance marketing\b/],
  ["paid media", /\bpaid media\b/],
  ["paid acquisition", /\bpaid acquisition\b/],
  ["media buying", /\bmedia buying\b/],
  ["business development", /\bbusiness development\b/],
  ["partnerships", /\bpartnerships?\b/],
  ["advertising", /\badvertising\b/],
  ["digital marketing", /\bdigital\s+marketing\b/],
  ["digital", /\bdigital\b.*\b(?:manager|director|lead|head|chief|vp)\b/],
  ["monetization", /\bmonetization\b/],
  ["ua manager", /\bua\s+manager\b/],
  ["ua lead", /\bua\s+lead\b/],
  ["ua director", /\bua\s+director\b/],
  ["acquisition manager", /\bacquisition\s+manager\b/],
  ["revenue", /\brevenue\b/],
  ["programmatic", /\bprogrammatic\b/],
  ["adops", /\bad\s*ops\b/],
  ["ad operations", /\bad\s+operations\b/],
  ["media planner", /\bmedia\s+planner\b/],
  ["affiliate", /\baffiliate\b/],
  ["marketing_es", /\bmarketing\b|\bpublicidad\b|\bcomercial\b|\bmercadotecnia\b/],
  ["marketing_pt", /\bmarketing\b|\bpublicidade\b/],
  ["marketing_fr", /\bmarketing\b|\bpublicité\b/],
  ["marketing_de", /\bmarketing\b|\bwerbung\b/],
  ["marketing_intl", /\bマーケティング\b|\b市场\b|\b마케팅\b/u],
];

const ROLE_REJECT_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["talent acquisition", /\btalent acquisition\b/],
  ["talent", /\btalent\b/],
  ["recruiter", /\brecruiter\b/],
  ["recruiting", /\brecruiting\b/],
  ["recruitment", /\brecruitment\b/],
  ["human resources", /\bhuman resources\b/],
  ["people ops", /\bpeople ops\b/],
  ["people operations", /\bpeople operations\b/],
  ["hr", /\bhr\b/],
  ["hiring", /\bhiring\b/],
];

const EXEC_ROLE_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["ceo", /\bceo\b/],
  ["chief executive", /\bchief executive\b/],
  ["founder", /\bfounder\b/],
  ["co-founder", /\bco[- ]founder\b/],
  ["cmo", /\bcmo\b/],
  ["chief marketing", /\bchief marketing\b/],
  ["vp marketing", /\bvp(?: of)? marketing\b/],
  ["head of marketing", /\bhead of marketing\b/],
  ["director of marketing", /\bdirector of marketing\b/],
  ["vp growth", /\bvp(?: of)? growth\b/],
  ["head of growth", /\bhead of growth\b/],
  ["managing director", /\bmanaging director\b/],
  ["general manager", /\bgeneral manager\b/],
  ["country manager", /\bcountry manager\b/],
  ["regional manager", /\bregional manager\b/],
  ["cro", /\bcro\b/],
  ["chief revenue", /\bchief revenue\b/],
  ["chief growth", /\bchief growth\b/],
  ["chief commercial", /\bchief commercial\b/],
  ["coo", /\bcoo\b/],
  ["chief operating", /\bchief operating\b/],
  ["head of business", /\bhead of business\b/],
  ["head of ua", /\bhead of ua\b/],
  ["head of user acquisition", /\bhead of user acquisition\b/],
  ["head of digital", /\bhead of digital\b/],
  ["head of advertising", /\bhead of advertising\b/],
  ["director marketing", /\bdirector\b.*\bmarketing\b/],
  ["director digital", /\bdirector\b.*\bdigital\b/],
  ["director advertising", /\bdirector\b.*\badvertising\b/],
  ["director commercial", /\bdirector\b.*\bcommercial\b/],
  ["vp advertising", /\bvp(?: of)? advertising\b/],
  ["vp digital", /\bvp(?: of)? digital\b/],
  ["vp business", /\bvp(?: of)? business\b/],
  ["director_es", /\bdirector(?:a)?\b/],
  ["gerente", /\bgerente\b/],
];

const APOLLO_LOCATION_MAP: Record<string, string[]> = {
  israel: ["Israel", "Tel Aviv", "Tel Aviv-Yafo"],
  "united states": ["United States", "New York", "San Francisco", "Los Angeles"],
  "united kingdom": ["United Kingdom", "London", "England"],
  germany: ["Germany", "Berlin", "Munich", "Hamburg"],
  france: ["France", "Paris"],
  india: ["India", "Bangalore", "Mumbai", "Delhi"],
  brazil: ["Brazil", "São Paulo", "Rio de Janeiro"],
  indonesia: ["Indonesia", "Jakarta"],
  japan: ["Japan", "Tokyo", "Osaka"],
  "south korea": ["South Korea", "Seoul"],
  mexico: ["Mexico", "Mexico City"],
  turkey: ["Turkey", "Istanbul", "Ankara"],
  nigeria: ["Nigeria", "Lagos"],
  singapore: ["Singapore"],
  malaysia: ["Malaysia", "Kuala Lumpur"],
  australia: ["Australia", "Sydney", "Melbourne"],
  canada: ["Canada", "Toronto", "Vancouver"],
  uae: ["United Arab Emirates", "Dubai", "Abu Dhabi"],
  "united arab emirates": ["United Arab Emirates", "Dubai", "Abu Dhabi"],
  russia: ["Russia", "Moscow", "Saint Petersburg"],
  ukraine: ["Ukraine", "Kyiv"],
  poland: ["Poland", "Warsaw"],
  netherlands: ["Netherlands", "Amsterdam"],
  sweden: ["Sweden", "Stockholm"],
  spain: ["Spain", "Madrid", "Barcelona"],
  italy: ["Italy", "Milan", "Rome"],
  thailand: ["Thailand", "Bangkok"],
  vietnam: ["Vietnam", "Ho Chi Minh City", "Hanoi"],
  philippines: ["Philippines", "Manila"],
  "south africa": ["South Africa", "Johannesburg", "Cape Town"],
  kenya: ["Kenya", "Nairobi"],
  egypt: ["Egypt", "Cairo"],
  argentina: ["Argentina", "Buenos Aires"],
  colombia: ["Colombia", "Bogotá"],
  chile: ["Chile", "Santiago"],
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: "united states",
  usa: "united states",
  uk: "united kingdom",
  gb: "united kingdom",
  "great britain": "united kingdom",
  uae: "united arab emirates",
  emirates: "united arab emirates",
  korea: "south korea",
  rok: "south korea",
  "russian federation": "russia",
  türkiye: "turkey",
  turkiye: "turkey",
  brasil: "brazil",
  deutschland: "germany",
  españa: "spain",
  espana: "spain",
  italia: "italy",
  nippon: "japan",
  sa: "south africa",
  rsa: "south africa",
  ksa: "saudi arabia",
};

export function getApolloLocations(country: string): string[] {
  if (!country) return [];
  let key = country.toLowerCase().trim();
  key = COUNTRY_ALIASES[key] ?? key;
  return APOLLO_LOCATION_MAP[key] ?? [country];
}

// ─── Title acceptance (port of _should_accept_contact_title) ──────────────

function titleDebugFlags(title: string): {
  normalized: string;
  hasTarget: boolean;
  hasReject: boolean;
  hasExec: boolean;
} {
  const normalized = (title || "").toLowerCase().replace(/\s+/g, " ").trim();
  let hasTarget = false;
  for (const [, p] of ROLE_TARGET_PATTERNS) {
    if (p.test(normalized)) {
      hasTarget = true;
      break;
    }
  }
  let hasReject = false;
  for (const [, p] of ROLE_REJECT_PATTERNS) {
    if (p.test(normalized)) {
      hasReject = true;
      break;
    }
  }
  let hasExec = false;
  for (const [, p] of EXEC_ROLE_PATTERNS) {
    if (p.test(normalized)) {
      hasExec = true;
      break;
    }
  }
  return { normalized, hasTarget, hasReject, hasExec };
}

const JUNIOR_MARKERS = ["intern", "assistant", "trainee", "student", "apprentice", "junior"];

function shouldAcceptContactTitle(
  title: string,
  tier: string,
): { accepted: boolean; reason: string } {
  const flags = titleDebugFlags(title);
  const t = (tier || "").trim().toLowerCase();

  if (flags.hasReject) return { accepted: false, reason: "recruiting_role" };
  if (flags.hasTarget) return { accepted: true, reason: "target_role" };
  if (flags.hasExec && (t === "exec" || t === "broad" || t === "broad_micro")) {
    return { accepted: true, reason: "exec_role" };
  }
  if (t === "broad_micro") {
    if (JUNIOR_MARKERS.some((j) => flags.normalized.includes(j))) {
      return { accepted: false, reason: "junior_role" };
    }
    return { accepted: true, reason: "micro_broad_fallback" };
  }
  return { accepted: false, reason: "irrelevant_role" };
}

// ─── Free-mail domains (audit fix C3.1, port from Python FREE_EMAIL_DOMAINS) ─

const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.ru",
  "qq.com",
  "mail.ru",
  "163.com",
  "126.com",
  "yeah.net",
]);

// ─── Apollo people search ─────────────────────────────────────────────────

interface ApolloPeopleSearchArgs {
  org: ApolloOrg;
  titles: ReadonlyArray<string> | null;
  page: number;
  locations?: string[];
}

async function apolloPeopleSearch(
  args: ApolloPeopleSearchArgs,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const { org, titles, page, locations } = args;

  const query: Record<string, string | number | boolean | string[] | undefined | null> = {
    page,
    per_page: 25,
  };
  if (titles && titles.length > 0) {
    query["person_titles[]"] = titles.slice();
  }
  if (locations && locations.length > 0) {
    query["person_locations[]"] = locations;
  }
  if (org.id) {
    query["organization_ids[]"] = [org.id];
  } else if (org.domain) {
    query["q_organization_domains"] = org.domain;
  } else if (org.name) {
    query["q_organization_name"] = org.name;
  }

  // Try query-string form first (Apollo docs)
  let data = await apolloPost({
    path: "/mixed_people/api_search",
    query,
    signal,
  });

  // Fallback: JSON body form (some Apollo accounts/endpoints prefer it)
  if (!data) {
    const body: Record<string, unknown> = { page, per_page: 25 };
    if (titles && titles.length > 0) {
      body.person_titles = titles.slice();
      body.q_person_title = titles.join(" OR ");
    }
    if (locations && locations.length > 0) body.person_locations = locations;
    if (org.id) body.organization_ids = [org.id];
    else if (org.domain) body.q_organization_domains = org.domain;
    else if (org.name) body.q_organization_name = org.name;

    data = await apolloPost({
      path: "/mixed_people/api_search",
      body,
      signal,
    });
  }

  if (!data) return [];
  const people = data.people;
  if (!Array.isArray(people)) return [];
  return people as Array<Record<string, unknown>>;
}

// ─── Person enrichment ────────────────────────────────────────────────────

async function enrichPerson(
  personId: string,
  firstName: string,
  lastName: string,
  orgDomain: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  // Strategy 1: bulk_match by ID
  let data = await apolloPost({
    path: "/people/bulk_match",
    body: {
      details: [{ id: personId }],
      reveal_personal_emails: false,
    },
    signal,
  });
  if (data) {
    const matches = data.matches;
    if (Array.isArray(matches) && matches.length > 0) {
      const m = matches[0] as Record<string, unknown>;
      if (sanitizeStr(m.email)) return m;
    }
  }

  // Strategy 2: people/match by ID
  data = await apolloPost({
    path: "/people/match",
    body: { id: personId, reveal_personal_emails: false },
    signal,
  });
  if (data) {
    const person = data.person;
    if (person && typeof person === "object") {
      const p = person as Record<string, unknown>;
      if (sanitizeStr(p.email)) return p;
    }
  }

  // Strategy 3: people/match by name + domain (discovers new emails)
  if (firstName && lastName && orgDomain) {
    data = await apolloPost({
      path: "/people/match",
      body: {
        first_name: firstName,
        last_name: lastName,
        domain: orgDomain,
        reveal_personal_emails: false,
      },
      signal,
    });
    if (data) {
      const person = data.person;
      if (person && typeof person === "object") {
        const p = person as Record<string, unknown>;
        if (sanitizeStr(p.email)) return p;
      }
    }
  }

  return null;
}

// ─── Process people batch ─────────────────────────────────────────────────

async function processPeople(
  people: Array<Record<string, unknown>>,
  collected: ApolloContact[],
  seenIds: Set<string>,
  orgDomain: string,
  tier: string,
  acceptableEmailDomains: Set<string>,
  rejected: CollectContactsResult["rejected"],
  target: number,
  signal?: AbortSignal,
): Promise<{ candidatesSeen: number; accepted: number }> {
  let candidatesSeen = 0;
  let accepted = 0;

  for (const person of people) {
    if (signal?.aborted) break; // APO2: graceful abort in people loop
    if (collected.length >= target) break;
    candidatesSeen++;

    const personId = sanitizeStr(person.id);
    if (!personId || seenIds.has(personId)) {
      rejected.duplicate++;
      continue;
    }
    seenIds.add(personId);

    let email = sanitizeStr(person.email).toLowerCase();
    let firstName = sanitizeStr(person.first_name);
    let lastName = sanitizeStr(person.last_name);
    let title = sanitizeStr(person.title);
    const seniority = sanitizeStr(person.seniority);

    // Enrich if email is missing or locked
    if (!email || email.includes("email_not_unlocked")) {
      const enriched = await enrichPerson(personId, firstName, lastName, orgDomain, signal);
      if (enriched) {
        email = sanitizeStr(enriched.email).toLowerCase();
        firstName = sanitizeStr(enriched.first_name) || firstName;
        lastName = sanitizeStr(enriched.last_name) || lastName;
        title = sanitizeStr(enriched.title) || title;
      }
    }

    if (!email || !email.includes("@") || email.includes("email_not_unlocked")) {
      rejected.noEmail++;
      continue;
    }

    // Audit fix C3.1: reject free-mail domains explicitly. The corporate-domain
    // check below would normally catch them, but if org.domain is corrupt or
    // missing, free-mail addresses could leak through.
    const emailDomainLower = (email.split("@")[1] || "").toLowerCase();
    if (FREE_EMAIL_DOMAINS.has(emailDomainLower)) {
      rejected.domainMismatch++;
      continue;
    }

    // Domain validation
    if (acceptableEmailDomains.size > 0) {
      const emailDomain = emailDomainLower;
      const domainOk = Array.from(acceptableEmailDomains).some(
        (d) => emailDomain === d || emailDomain.endsWith("." + d),
      );
      if (!domainOk) {
        rejected.domainMismatch++;
        continue;
      }
    }

    // Title acceptance
    const { accepted: titleOk } = shouldAcceptContactTitle(title, tier);
    if (!titleOk) {
      rejected.titleRejected++;
      continue;
    }

    collected.push({
      firstName,
      lastName,
      title,
      email,
      seniority,
    });
    accepted++;
  }

  return { candidatesSeen, accepted };
}

// ─── Public: collectContacts ──────────────────────────────────────────────

/**
 * Collect contacts for an Apollo org. Runs phases 1, 2, 2b in sequence.
 * Phase 3 (subsidiary expansion) is deferred to 2.2-BE-C orchestrator.
 *
 * Returns the collected contacts plus phase-by-phase diagnostics.
 */
export async function collectContacts(
  org: ApolloOrg,
  resolved: ResolvedCompany | null,
  opts: CollectContactsOptions = {},
  signal?: AbortSignal,
): Promise<CollectContactsResult> {
  const target = Math.max(opts.targetContacts ?? 6, 6);

  if (!org.id && !org.domain) {
    return {
      contacts: [],
      phasesRun: [],
      rejected: { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 },
    };
  }

  // APO2: graceful abort before any Apollo call
  if (signal?.aborted) {
    return {
      contacts: [],
      phasesRun: [],
      rejected: { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 },
    };
  }

  const isMultinational = Boolean(resolved?.isMultinational);
  const focusMarket = sanitizeStr(resolved?.focusMarket);
  const locations = isMultinational && focusMarket ? getApolloLocations(focusMarket) : [];

  const corporateDomain = sanitizeStr(resolved?.corporateDomain);
  const altDomains = (resolved?.alternativeDomains || []).map(sanitizeStr).filter(Boolean);

  const acceptableEmailDomains = new Set<string>();
  const contactDomain = corporateDomain || org.domain || "";
  if (contactDomain) acceptableEmailDomains.add(contactDomain.toLowerCase());
  for (const ad of altDomains) acceptableEmailDomains.add(ad.toLowerCase());
  if (org.domain && !acceptableEmailDomains.has(org.domain.toLowerCase())) {
    acceptableEmailDomains.add(org.domain.toLowerCase());
  }

  const collected: ApolloContact[] = [];
  const seenIds = new Set<string>();
  const phasesRun: CollectContactsResult["phasesRun"] = [];
  const rejected = { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 };

  // ── Phase 1: title-tiered ──────────────────────────────────────────────
  const tiers: Array<{ name: "primary" | "secondary" | "exec"; titles: ReadonlyArray<string> }> = [
    { name: "primary", titles: PRIMARY_TITLES },
    { name: "secondary", titles: SECONDARY_TITLES },
    { name: "exec", titles: EXEC_FALLBACK_TITLES },
  ];

  for (const { name: tierName, titles: tierTitles } of tiers) {
    if (collected.length >= target) break;
    let pagesRun = 0;
    let candSeen = 0;
    let acc = 0;
    for (let page = 1; page <= 3; page++) {
      if (collected.length >= target) break;
      const people = await apolloPeopleSearch({
        org,
        titles: tierTitles,
        page,
        locations,
      }, signal);
      pagesRun = page;
      if (people.length === 0) break;
      const r = await processPeople(
        people,
        collected,
        seenIds,
        contactDomain,
        tierName,
        acceptableEmailDomains,
        rejected,
        target,
        signal,
      );
      candSeen += r.candidatesSeen;
      acc += r.accepted;
    }
    phasesRun.push({ phase: tierName, pages: pagesRun, candidatesSeen: candSeen, accepted: acc });
  }

  // ── Phase 2: broad search ──────────────────────────────────────────────
  if (collected.length < target) {
    let pagesRun = 0;
    let candSeen = 0;
    let acc = 0;
    for (let page = 1; page <= 2; page++) {
      if (collected.length >= target) break;
      const people = await apolloPeopleSearch({ org, titles: null, page, locations }, signal);
      pagesRun = page;
      if (people.length === 0) break;
      const r = await processPeople(
        people,
        collected,
        seenIds,
        contactDomain,
        "broad",
        acceptableEmailDomains,
        rejected,
        target,
        signal,
      );
      candSeen += r.candidatesSeen;
      acc += r.accepted;
    }
    phasesRun.push({ phase: "broad", pages: pagesRun, candidatesSeen: candSeen, accepted: acc });
  }

  // ── Phase 2b: micro-org permissive fallback ────────────────────────────
  if (
    collected.length === 0 &&
    org.estimatedNumEmployees > 0 &&
    org.estimatedNumEmployees < 150
  ) {
    let pagesRun = 0;
    let candSeen = 0;
    let acc = 0;
    for (let page = 1; page <= 2; page++) {
      if (collected.length >= 2) break;
      const people = await apolloPeopleSearch({ org, titles: null, page, locations }, signal);
      pagesRun = page;
      if (people.length === 0) break;
      const r = await processPeople(
        people,
        collected,
        seenIds,
        contactDomain,
        "broad_micro",
        acceptableEmailDomains,
        rejected,
        Math.max(2, target),
        signal,
      );
      candSeen += r.candidatesSeen;
      acc += r.accepted;
    }
    phasesRun.push({ phase: "broad_micro", pages: pagesRun, candidatesSeen: candSeen, accepted: acc });
  }

  return { contacts: collected, phasesRun, rejected };
}

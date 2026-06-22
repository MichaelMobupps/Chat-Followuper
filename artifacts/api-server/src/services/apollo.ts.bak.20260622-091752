import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { isAllowedPhone, detectCountry } from "../lib/geoGate";
import { GeoGateBlockedError } from "./channels/whatsapp";

/**
 * Apollo API client. Operations the seeder UI needs:
 *
 *   - searchOrg(brand, country?) -> resolve a brand string to one or more
 *     Apollo organizations.
 *   - searchPeople(orgId, titles) -> list people inside an org filtered by
 *     SDR-relevant titles.
 *   - revealContact(personId) -> SYNCHRONOUS reveal of email + linkedin
 *     (and any phone Apollo surfaces incidentally — gated). Does NOT
 *     trigger Apollo's async phone-reveal flow.
 *   - requestPhoneReveal(personId, prospectId, userId) -> ASYNCHRONOUS
 *     phone reveal via Apollo's webhook callback. Persists a correlation
 *     token, increments the credit counter (Apollo charges on request
 *     acceptance, before the phone arrives), and POSTs to Apollo with
 *     reveal_phone_number=true and our webhook URL. Returns immediately
 *     with status="pending"; the webhook handler in routes/apolloWebhook
 *     stores the phone (or marks it blocked) when Apollo POSTs back.
 *   - processPhoneRevealCallback(payload) -> ingests one Apollo webhook
 *     delivery. Idempotent on correlationId; runs the geo gate at
 *     callback time; never persists a phone that the gate rejects.
 *
 * The client is a thin HTTP wrapper for the Apollo HTTP surface plus a
 * small amount of DB bookkeeping for the async-reveal lifecycle. Daily-
 * usage counter increments and action_log writes happen INSIDE this
 * module for the async flow (because the request and the webhook are
 * separated in time and there is no single route handler that can wrap
 * the whole thing). The synchronous revealContact path keeps the
 * old route-side bookkeeping pattern.
 *
 * Rate limiting: Apollo returns 429 when exhausted. On 429 we sleep 60s
 * and retry exactly once. A second 429 throws ApolloRateLimitError.
 *
 * Auth: every request sends the API key in BOTH the X-Api-Key header AND
 * the api_key query parameter. Some Apollo endpoints accept only one of
 * the two; sending both is the documented belt-and-braces pattern.
 *
 * People-search endpoint: uses /mixed_people/api_search. The older
 * /mixed_people/search returns 422 with a deprecation message for
 * API callers as of late 2024.
 */

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

// Reasonable default. Apollo plans typically allow tens of titles per query;
// we keep our own selection narrow so people-search returns relevant SDR
// targets rather than the whole org. The route layer can override.
export const DEFAULT_SDR_TITLES: ReadonlyArray<string> = [
  "CEO",
  "Founder",
  "Co-Founder",
  "CMO",
  "Chief Marketing Officer",
  "VP Marketing",
  "Head of Marketing",
  "Director of Marketing",
  "VP Growth",
  "Head of Growth",
  "Director of Growth",
  "Growth Manager",
  "Performance Marketing",
  "User Acquisition",
  "Head of UA",
  "Marketing Manager",
];

export class ApolloMissingApiKeyError extends Error {
  constructor() {
    super(
      "APOLLO_API_KEY is not set. Add it to Replit Secrets before calling Apollo.",
    );
    this.name = "ApolloMissingApiKeyError";
  }
}

export class ApolloRateLimitError extends Error {
  constructor() {
    super(
      "Apollo rate limit exceeded after one retry. Wait at least 60 seconds and try again.",
    );
    this.name = "ApolloRateLimitError";
  }
}

export class ApolloAuthError extends Error {
  public readonly status: number;
  constructor(status: number, body: string) {
    super(
      `Apollo auth failed (status ${status}). The API key may be invalid or the plan may not include this endpoint. Body: ${body.slice(0, 200)}`,
    );
    this.name = "ApolloAuthError";
    this.status = status;
  }
}

export class ApolloPersonNotFoundError extends Error {
  public readonly personId: string;
  constructor(personId: string) {
    super(`Apollo person not found: ${personId}`);
    this.name = "ApolloPersonNotFoundError";
    this.personId = personId;
  }
}

export class ApolloApiError extends Error {
  public readonly status: number;
  public readonly body: string;
  constructor(status: number, body: string) {
    super(
      `Apollo API error (status ${status}): ${body.slice(0, 300)}`,
    );
    this.name = "ApolloApiError";
    this.status = status;
    this.body = body;
  }
}

export class ApolloMissingWebhookUrlError extends Error {
  constructor() {
    super(
      "APOLLO_WEBHOOK_URL is not set. Required for async phone reveal — point Apollo at the deployed /api/apollo/webhook/phone-reveal endpoint.",
    );
    this.name = "ApolloMissingWebhookUrlError";
  }
}

export interface ApolloOrgSummary {
  id: string;
  name: string | null;
  websiteUrl: string | null;
  primaryDomain: string | null;
  industry: string | null;
  estimatedNumEmployees: number | null;
  country: string | null;
  city: string | null;
  linkedinUrl: string | null;
  shortDescription: string | null;
}

export interface ApolloPersonSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  organizationId: string | null;
  organizationName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedinUrl: string | null;
  /** 3-state direct phone availability indicator from Apollo's people
   *  search. Added in Ticket 2.3-BE-A.
   *  - "yes":   Apollo has a verified direct phone — sync revealContact
   *             returns it (1 credit).
   *  - "maybe": not cached; bulk_match may find it via the async
   *             requestPhoneReveal webhook flow (8 credits).
   *  - "no":    Apollo will not find a direct phone — skip (0 credits).
   *  Derived from raw.has_direct_phone in the search response. */
  directPhoneStatus: "yes" | "maybe" | "no";
  /** True if Apollo has a verified email cached for this person.
   *  Derived from raw.has_email. Added in Ticket 2.3-BE-A. */
  hasEmail: boolean;
  /** Obfuscated last name as returned by Apollo's people search
   *  (e.g. "Gi***l"). Full last_name only available after revealContact.
   *  Useful for the bulk multi-select grid (2.3-FE) to show enough
   *  identity for SDR recognition without bypassing the credit gate.
   *  Null when Apollo doesn't surface it. Added in Ticket 2.3-BE-A. */
  lastNameObfuscated: string | null;
  /** Phone number when Apollo has already revealed this contact in the
   *  calling account (= phone_numbers populated in the people-search
   *  response). When non-null, no reveal call is needed — the phone is
   *  already "your data" and can be used directly at zero credit cost.
   *  Caller should check this before calling revealContact or
   *  requestPhoneReveal. Added in Ticket bulk-already-revealed-free. */
  existingPhone: string | null;
  /** Prospect ID if a prospect with this Apollo person ID already
   *  exists for the requesting user. Set by routes/apollo.ts after
   *  searchPeople returns; mapPerson initializes to null. The FE
   *  bulk grid renders these candidates as not-selectable so the
   *  reveal call never fires (would burn 8c on a dupe). Added in
   *  Ticket search-time-annotation. */
  existingProspectId: string | null;
}

export interface ApolloRevealedContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  organizationId: string | null;
  organizationName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface PhoneRevealRequestResult {
  status: "pending";
  correlationId: string;
}

export type PhoneRevealCallbackOutcome =
  | { kind: "arrived"; prospectId: string; country: string | null }
  | { kind: "blocked"; prospectId: string; country: string | null }
  | { kind: "no_match"; prospectId: string }
  | { kind: "duplicate"; prospectId: string; previousStatus: string }
  | { kind: "unknown_correlation" };

interface FetchOptions {
  method: "GET" | "POST";
  body?: unknown;
}

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key || key.length === 0) {
    throw new ApolloMissingApiKeyError();
  }
  return key;
}

function getWebhookUrl(): string {
  const url = process.env.APOLLO_WEBHOOK_URL;
  if (!url || url.length === 0) {
    throw new ApolloMissingWebhookUrlError();
  }
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single low-level fetch helper. All public functions go through this.
 * Adds api_key to the URL, X-Api-Key header, JSON body when present.
 * Implements the 429-retry-once policy and maps non-2xx responses to
 * typed errors.
 *
 * `acceptStatuses`: optional list of additional 2xx-or-not statuses that
 * should be treated as success (e.g. 202 for async-accept). Default is
 * Express's `response.ok` (200-299).
 */
async function apolloFetch<T>(
  path: string,
  opts: FetchOptions,
  acceptStatuses?: number[],
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${APOLLO_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);

  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    Accept: "application/json",
    "Cache-Control": "no-cache",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  let response = await fetch(url, init);

  if (response.status === 429) {
    // Wait the documented full window then retry exactly once.
    await sleep(60_000);
    response = await fetch(url, init);
    if (response.status === 429) {
      throw new ApolloRateLimitError();
    }
  }

  if (response.status === 401 || response.status === 403) {
    const text = await response.text().catch(() => "");
    throw new ApolloAuthError(response.status, text);
  }

  const isAccepted =
    response.ok || (acceptStatuses?.includes(response.status) ?? false);
  if (!isAccepted) {
    const text = await response.text().catch(() => "");
    throw new ApolloApiError(response.status, text);
  }

  // Some async-accept responses are empty (204). Tolerate that by returning
  // a typed-empty object; callers that expect a body can still cast.
  const text = await response.text().catch(() => "");
  if (text.length === 0) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Apollo occasionally returns text/plain for accepted-async; we only
    // care about the status code in that case.
    return {} as T;
  }
}

interface RawApolloOrg {
  id?: string;
  name?: string;
  website_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  country?: string;
  city?: string;
  linkedin_url?: string;
  short_description?: string;
}

interface RawApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  phone_numbers?: Array<{
    raw_number?: string;
    sanitized_number?: string;
    type?: string;
    position?: number;
    status?: string;
  }>;
  linkedin_url?: string;
  organization_id?: string;
  organization?: { id?: string; name?: string };
  city?: string;
  state?: string;
  country?: string;
}

interface OrgSearchResponse {
  organizations?: RawApolloOrg[];
}

interface PeopleSearchResponse {
  people?: RawApolloPerson[];
}

interface PeopleMatchResponse {
  person?: RawApolloPerson;
  matched_people?: RawApolloPerson[];
}

function mapOrg(raw: RawApolloOrg): ApolloOrgSummary {
  return {
    id: raw.id ?? "",
    name: raw.name ?? null,
    websiteUrl: raw.website_url ?? null,
    primaryDomain: raw.primary_domain ?? null,
    industry: raw.industry ?? null,
    estimatedNumEmployees: raw.estimated_num_employees ?? null,
    country: normalizeCountryCode(raw.country),
    city: raw.city ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
    shortDescription: raw.short_description ?? null,
  };
}

/**
 * Map Apollo's free-form has_direct_phone string into our 3-state enum.
 * Observed values from /api/v1/mixed_people/api_search:
 *   - "Yes" — Apollo has a cached direct phone
 *             (revealContact returns it for 1 credit)
 *   - "Maybe: please request direct dial via people/bulk_match" —
 *             async only, 8 credits via requestPhoneReveal webhook
 *   - absent or anything else — treat as no phone (fail-closed)
 *
 * Defensive: any value we don't explicitly recognize maps to "no" so a
 * future Apollo wording change doesn't accidentally route SDRs to a paid
 * reveal endpoint that won't return a phone. Added in Ticket 2.3-BE-A.
 */
function mapDirectPhoneStatus(raw: string | undefined): "yes" | "maybe" | "no" {
  if (!raw) return "no";
  if (raw === "Yes") return "yes";
  if (raw.startsWith("Maybe")) return "maybe";
  return "no";
}

function mapPerson(raw: RawApolloPerson): ApolloPersonSummary {
  // Defensive cast for fields that only appear on
  // /mixed_people/api_search responses (not on /people/match enrich).
  // Avoids forcing every caller of RawApolloPerson to also be updated.
  const rawSearch = raw as RawApolloPerson & {
    last_name_obfuscated?: string;
    has_direct_phone?: string;
    has_email?: boolean;
  };
  return {
    id: raw.id ?? "",
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    name: raw.name ?? null,
    title: raw.title ?? null,
    organizationId: raw.organization_id ?? raw.organization?.id ?? null,
    organizationName: raw.organization?.name ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: normalizeCountryCode(raw.country),
    linkedinUrl: raw.linkedin_url ?? null,
    directPhoneStatus: mapDirectPhoneStatus(rawSearch.has_direct_phone),
    hasEmail: rawSearch.has_email === true,
    lastNameObfuscated:
      typeof rawSearch.last_name_obfuscated === "string"
        ? rawSearch.last_name_obfuscated
        : null,
    // pickPhone reads phone_numbers from the raw response. Apollo only
    // surfaces phone_numbers in people-search results for contacts the
    // calling account has already revealed (= already-spent credit).
    // For not-yet-revealed contacts, phone_numbers is empty/missing, so
    // this returns null and the regular reveal flow runs in processOne.
    existingPhone: pickPhone(raw),
    existingProspectId: null,
  };
}

/**
 * Pick the best phone number from Apollo's phone_numbers array. Apollo
 * orders "type" of mobile/work/home/other; we prefer mobile, then any
 * sanitized number, then null.
 */
function pickPhone(raw: RawApolloPerson): string | null {
  const numbers = raw.phone_numbers ?? [];
  if (numbers.length === 0) return null;
  const mobile = numbers.find((n) => (n.type ?? "").toLowerCase() === "mobile");
  if (mobile?.sanitized_number) return mobile.sanitized_number;
  const anySanitized = numbers.find((n) => n.sanitized_number);
  if (anySanitized?.sanitized_number) return anySanitized.sanitized_number;
  const anyRaw = numbers.find((n) => n.raw_number);
  return anyRaw?.raw_number ?? null;
}

/**
 * Apollo's people-search and org-search responses inconsistently return
 * country as either a full English name ("India", "United States") or
 * an ISO 3166-1 alpha-2 code ("IN", "US"). Downstream prospect schema
 * (routes/prospects.ts) strict-validates ISO-2 via /^[A-Z]{2}$/, so a
 * full-name response would 400 createProspect. Normalize at the BE
 * source so all consumers see a consistent shape.
 *
 * Coverage: ~55 entries covering top UA-prospecting countries. Edge
 * cases (typos, less-common countries, ISO-3 codes) fall through to
 * null — caller drops the country field rather than failing schema.
 *
 * Added in Ticket country-name-iso-mapping.
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  bangladesh: "BD",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  "czech republic": "CZ",
  czechia: "CZ",
  denmark: "DK",
  egypt: "EG",
  finland: "FI",
  france: "FR",
  germany: "DE",
  greece: "GR",
  "hong kong": "HK",
  hungary: "HU",
  india: "IN",
  indonesia: "ID",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  kenya: "KE",
  "korea, republic of": "KR",
  "south korea": "KR",
  malaysia: "MY",
  mexico: "MX",
  netherlands: "NL",
  "new zealand": "NZ",
  nigeria: "NG",
  norway: "NO",
  pakistan: "PK",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  romania: "RO",
  russia: "RU",
  "russian federation": "RU",
  "saudi arabia": "SA",
  singapore: "SG",
  "south africa": "ZA",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  taiwan: "TW",
  thailand: "TH",
  turkey: "TR",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "u.a.e.": "AE",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  "great britain": "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",
  vietnam: "VN",
};

function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Lookup first — catches "UK" → "GB", "USA" → "US", and full names.
  // Lowercase + collapse internal whitespace for keying.
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (key in COUNTRY_NAME_TO_ISO2) return COUNTRY_NAME_TO_ISO2[key];
  // Unknown 2-letter — pass through (uppercased). Best-effort for
  // ISO-2 codes not in the lookup table; valid codes survive intact.
  if (/^[a-zA-Z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/**
 * Search Apollo organizations by name. Optional `country` (ISO-2 code or
 * full English name) narrows the result set via Apollo's
 * organization_locations filter. Returns up to 10 organizations.
 */
export async function searchOrg(
  brand: string,
  country?: string,
): Promise<ApolloOrgSummary[]> {
  if (!brand || brand.trim().length === 0) {
    return [];
  }

  const body: Record<string, unknown> = {
    q_organization_name: brand.trim(),
    page: 1,
    per_page: 10,
  };
  if (country && country.trim().length > 0) {
    body.organization_locations = [country.trim()];
  }

  const response = await apolloFetch<OrgSearchResponse>(
    "/organizations/search",
    { method: "POST", body },
  );

  const orgs = response.organizations ?? [];
  return orgs.map(mapOrg).filter((o) => o.id.length > 0);
}

/**
 * Search Apollo people inside a specific organization, filtered by titles.
 *
 * Paginates Apollo's people-search endpoint with per_page=100 (Apollo's
 * max for single-page) and a hard 5-page (500-candidate) safety cap.
 * Stops early when Apollo returns fewer than per_page (= last page
 * reached). For typical companies this fetches all candidates in 1 call;
 * large orgs (>500 marketing/UA-titled people) hit the cap and SDR can
 * re-run with stricter title filters.
 *
 * Removed in Ticket bulk-unlimited-candidates: the prior fixed cap of
 * 25 was hiding most candidates from larger orgs.
 */
const SEARCH_PEOPLE_PER_PAGE = 100;
const SEARCH_PEOPLE_MAX_PAGES = 5;

export async function searchPeople(
  orgId: string,
  titles: string[],
): Promise<ApolloPersonSummary[]> {
  if (!orgId || orgId.trim().length === 0) {
    return [];
  }

  const titleList =
    titles.length > 0 ? titles : Array.from(DEFAULT_SDR_TITLES);

  const allPeople: ApolloPersonSummary[] = [];
  for (let page = 1; page <= SEARCH_PEOPLE_MAX_PAGES; page++) {
    const body = {
      organization_ids: [orgId],
      person_titles: titleList,
      page,
      per_page: SEARCH_PEOPLE_PER_PAGE,
    };

    const response = await apolloFetch<PeopleSearchResponse>(
      "/mixed_people/api_search",
      { method: "POST", body },
    );

    const pagePeople = (response.people ?? [])
      .map(mapPerson)
      .filter((p) => p.id.length > 0);
    allPeople.push(...pagePeople);

    // Stop when Apollo returns fewer than per_page (= last page reached)
    if (pagePeople.length < SEARCH_PEOPLE_PER_PAGE) {
      break;
    }
  }

  return allPeople;
}

/**
 * Reveal email and (when Apollo surfaces it incidentally) phone + linkedin
 * for one person — SYNCHRONOUS path. Does NOT pass reveal_phone_number=true,
 * so Apollo never triggers the async webhook flow from this call. The
 * separate `requestPhoneReveal` function is the entry point for the async
 * phone-reveal lifecycle.
 *
 * THIS IS A PAID CALL — each successful reveal consumes one Apollo credit.
 * Caller (the route handler) increments daily_usage.apollo_reveals_used.
 *
 * The geo gate fires only when phone is present AND outside the allowed
 * country list. Email-only reveals are not blocked.
 */
export async function revealContact(
  personId: string,
): Promise<ApolloRevealedContact> {
  if (!personId || personId.trim().length === 0) {
    throw new ApolloPersonNotFoundError(personId);
  }

  const body = {
    id: personId,
    reveal_personal_emails: true,
    // reveal_phone_number intentionally omitted — async phone reveal lives
    // in requestPhoneReveal.
  };

  let response: PeopleMatchResponse;
  try {
    response = await apolloFetch<PeopleMatchResponse>("/people/match", {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof ApolloApiError && err.status === 404) {
      throw new ApolloPersonNotFoundError(personId);
    }
    throw err;
  }

  const person = response.person ?? response.matched_people?.[0];
  if (!person || !person.id) {
    throw new ApolloPersonNotFoundError(personId);
  }

  const phone = pickPhone(person);

  const revealed: ApolloRevealedContact = {
    id: person.id,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    name: person.name ?? null,
    title: person.title ?? null,
    email: person.email ?? null,
    phone,
    linkedinUrl: person.linkedin_url ?? null,
    organizationId: person.organization_id ?? person.organization?.id ?? null,
    organizationName: person.organization?.name ?? null,
    city: person.city ?? null,
    state: person.state ?? null,
    country: person.country ?? null,
  };

  if (phone && !isAllowedPhone(phone)) {
    throw new GeoGateBlockedError(detectCountry(phone));
  }

  return revealed;
}

/**
 * Generate a fresh, unguessable correlation token. 32 bytes of CSPRNG
 * output, base64url-encoded (43 chars, URL-safe). Not the prospect id,
 * not the personId, not anything an attacker could derive — this is the
 * lookup key the webhook handler trusts.
 */
function generateCorrelationId(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Async phone-reveal request. Persists a correlation token on the
 * prospect, increments the credit counter (Apollo charges on request
 * acceptance), then POSTs to Apollo with reveal_phone_number=true and
 * our webhook URL. Returns immediately — the webhook handler will
 * complete the lifecycle when Apollo POSTs back.
 *
 * Idempotency at request time: if the prospect already has
 * phone_reveal_status='pending' or 'arrived', we DO NOT re-issue the
 * request. 'pending' means a previous request is in flight and we'd
 * double-charge; 'arrived' means the phone is already stored. The
 * caller can re-trigger by setting status back to 'none' explicitly
 * (e.g. an admin "retry" action), which is intentionally out of band.
 *
 * The DB writes (correlationId persist, daily_usage increment, action
 * log) happen BEFORE the Apollo POST. Failure modes:
 *
 *   - DB write fails: throws, no Apollo call, no credit consumed.
 *   - DB writes succeed but Apollo POST fails: prospect has
 *     status=pending, the webhook will never arrive, and a stale
 *     pending row sits in the DB. Recovery is a manual reset (out of
 *     scope here) but the credit is intentionally counted as spent —
 *     Apollo MAY have charged depending on which side of the request
 *     the failure lived.
 *   - Apollo accepts: 202 (or 200 — Apollo's accepted-async status is
 *     not documented consistently), webhook arrives later, handler
 *     completes the lifecycle.
 */
export async function requestPhoneReveal(
  personId: string,
  prospectId: string,
  userId: string,
): Promise<PhoneRevealRequestResult> {
  if (!personId || personId.trim().length === 0) {
    throw new ApolloPersonNotFoundError(personId);
  }

  // Pre-flight env: fail fast before mutating anything if the webhook
  // URL isn't configured. The Apollo POST without a webhook_url would
  // either be rejected outright or — worse — accepted but never
  // delivered, leaving a phantom pending row.
  const webhookUrl = getWebhookUrl();
  // Pre-flight API key too so we surface a clean error before DB writes.
  getApiKey();

  const correlationId = generateCorrelationId();
  const today = new Date().toISOString().slice(0, 10);
  const start = Date.now();

  // Persist correlation + status BEFORE the Apollo call. If the Apollo
  // call later fails, the prospect's status stays 'pending' and the
  // operator sees the stuck record; we accept that over the alternative
  // (Apollo accepts the async request, the webhook arrives, but we
  // have no correlationId on file to match it to).
  await db.transaction(async (tx) => {
    // Idempotency guard: re-requesting against an already-pending or
    // already-arrived prospect is a programmer error in the caller.
    // We surface it as a thrown error rather than silently no-op so
    // the SDR sees a clear "already requested" message.
    const rows = await tx
      .select({
        userId: prospectsTable.userId,
        phoneRevealStatus: prospectsTable.phoneRevealStatus,
      })
      .from(prospectsTable)
      .where(eq(prospectsTable.id, prospectId))
      .for("update")
      .limit(1);

    const prospect = rows[0];
    if (!prospect) {
      throw new Error(`Prospect not found: ${prospectId}`);
    }
    if (prospect.userId !== userId) {
      throw new Error(
        `Prospect ${prospectId} does not belong to user ${userId}`,
      );
    }
    if (
      prospect.phoneRevealStatus === "pending" ||
      prospect.phoneRevealStatus === "arrived"
    ) {
      throw new Error(
        `Phone reveal already in state '${prospect.phoneRevealStatus}' for prospect ${prospectId}`,
      );
    }

    await tx
      .update(prospectsTable)
      .set({
        apolloPersonId: personId,
        phoneRevealStatus: "pending",
        phoneRevealRequestedAt: new Date(),
        phoneRevealCompletedAt: null,
        phoneRevealCorrelationId: correlationId,
        phoneNumber: null,
      })
      .where(eq(prospectsTable.id, prospectId));

    await tx
      .insert(dailyUsageTable)
      .values({
        userId,
        date: today,
        apolloRevealsUsed: 1,
      })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: {
          apolloRevealsUsed: sql`${dailyUsageTable.apolloRevealsUsed} + 1`,
        },
      });

    await tx.insert(actionLogsTable).values({
      userId,
      prospectId,
      actionType: ACTION_TYPES.apolloPhoneRevealRequested,
      actionStatus: "success",
      durationMs: Date.now() - start,
      metadata: {
        personId,
        correlationIdLen: correlationId.length,
        // The correlationId itself is intentionally NOT logged. It is a
        // capability token; logging it grants log-readers the ability to
        // forge or replay webhook callbacks. The length is logged as a
        // sanity check.
      },
    });
  });

  // Apollo call — outside the transaction so a slow Apollo response
  // doesn't hold the DB lock. Body shape: /people/match with
  // reveal_phone_number=true plus webhook_url plus our metadata token.
  const body = {
    id: personId,
    reveal_phone_number: true,
    webhook_url: webhookUrl,
    metadata: {
      // Apollo's metadata mechanism is not documented consistently across
      // plan tiers. We send the correlationId under a few likely keys; on
      // the callback side we tolerate any of them.
      correlation_id: correlationId,
      correlationId,
      cf_correlation_id: correlationId,
    },
  };

  // Apollo's documented status for accepted-async is not consistent —
  // we accept 200, 202, and 204. Anything else is mapped to ApolloApiError.
  await apolloFetch<unknown>(
    "/people/match",
    { method: "POST", body },
    [200, 202, 204],
  );

  return { status: "pending", correlationId };
}

/**
 * Webhook payload shape — best-effort permissive parse. Apollo's
 * payload structure varies; we extract the fields we need and
 * tolerate everything else. Required fields: a correlation token
 * (one of several keys) and a phone number (one of several keys).
 *
 * Status field tolerance: Apollo MAY include a top-level status the
 * webhook payload exposes, e.g. "no_match" when the person was looked
 * up but had no phone on file. If the field is "no_match" or similar
 * we transition the prospect to phone_reveal_status='no_match'.
 */
function extractCorrelationId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  const direct =
    (typeof p.correlation_id === "string" && p.correlation_id) ||
    (typeof p.correlationId === "string" && p.correlationId) ||
    (typeof p.cf_correlation_id === "string" && p.cf_correlation_id);
  if (direct) return direct;

  // Nested: payload.metadata.correlation_id (and friends)
  const md = p.metadata;
  if (typeof md === "object" && md !== null) {
    const m = md as Record<string, unknown>;
    const fromMeta =
      (typeof m.correlation_id === "string" && m.correlation_id) ||
      (typeof m.correlationId === "string" && m.correlationId) ||
      (typeof m.cf_correlation_id === "string" && m.cf_correlation_id);
    if (fromMeta) return fromMeta;
  }

  // Nested: payload.data.metadata.correlation_id
  const data = p.data;
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.correlation_id === "string") return d.correlation_id;
    if (typeof d.correlationId === "string") return d.correlationId;
    const dm = d.metadata;
    if (typeof dm === "object" && dm !== null) {
      const m = dm as Record<string, unknown>;
      if (typeof m.correlation_id === "string") return m.correlation_id;
      if (typeof m.correlationId === "string") return m.correlationId;
    }
  }

  return null;
}

function extractPhone(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // Top-level direct fields
  if (typeof p.phone === "string" && p.phone.length > 0) return p.phone;
  if (typeof p.phone_number === "string" && p.phone_number.length > 0) {
    return p.phone_number;
  }
  if (typeof p.sanitized_number === "string" && p.sanitized_number.length > 0) {
    return p.sanitized_number;
  }

  // Apollo person-shape: phone_numbers array
  const personLike =
    (p.person as Record<string, unknown> | undefined) ??
    (p.contact as Record<string, unknown> | undefined) ??
    p;
  if (typeof personLike === "object" && personLike !== null) {
    const numbers = personLike.phone_numbers;
    if (Array.isArray(numbers) && numbers.length > 0) {
      const picked = pickPhone({ phone_numbers: numbers as RawApolloPerson["phone_numbers"] });
      if (picked) return picked;
    }
    const direct = personLike.phone;
    if (typeof direct === "string" && direct.length > 0) return direct;
  }

  return null;
}

function extractStatus(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.status === "string") return p.status;
  const data = p.data;
  if (typeof data === "object" && data !== null) {
    const s = (data as Record<string, unknown>).status;
    if (typeof s === "string") return s;
  }
  return null;
}

/**
 * Process one Apollo webhook callback. Called by the route handler
 * AFTER HMAC verification has passed and the body has been JSON-parsed.
 * Returns a typed outcome describing what happened so the route can
 * shape the HTTP response (always 200 to Apollo to suppress retries,
 * but logged differently per outcome).
 *
 * Idempotency strategy: SELECT ... FOR UPDATE on the prospect row keyed
 * by correlationId. If the row's status is anything other than 'pending'
 * the webhook has already been processed — return a 'duplicate' outcome
 * without mutating. Concurrent webhook deliveries serialise on the row
 * lock; the second blocks until the first commits, then sees status !=
 * pending and no-ops.
 *
 * Geo gate: runs INSIDE the transaction. On block, the phone is never
 * persisted. action_logs records the country code only — never the phone
 * number, even on the success path, because the phone is sensitive.
 */
export async function processPhoneRevealCallback(
  payload: unknown,
): Promise<PhoneRevealCallbackOutcome> {
  const correlationId = extractCorrelationId(payload);
  if (!correlationId) {
    return { kind: "unknown_correlation" };
  }

  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: prospectsTable.id,
        userId: prospectsTable.userId,
        // Ticket 2.3-BE-B: fetch existing phone so the arrived branch
        // can COALESCE (promote phoneNumber → phone only when phone is
        // currently null, i.e. pending-reveal bulk-flow prospects).
        phone: prospectsTable.phone,
        phoneRevealStatus: prospectsTable.phoneRevealStatus,
      })
      .from(prospectsTable)
      .where(eq(prospectsTable.phoneRevealCorrelationId, correlationId))
      .for("update")
      .limit(1);

    const prospect = rows[0];
    if (!prospect) {
      return { kind: "unknown_correlation" } as const;
    }

    if (prospect.phoneRevealStatus !== "pending") {
      // Apollo retried; we've already processed this delivery. No-op.
      return {
        kind: "duplicate" as const,
        prospectId: prospect.id,
        previousStatus: prospect.phoneRevealStatus,
      };
    }

    // No-match / not-found terminal: Apollo couldn't supply a phone for
    // this person. Mark terminal so the SDR doesn't keep waiting.
    const status = extractStatus(payload);
    const phone = extractPhone(payload);

    if (
      !phone ||
      status === "no_match" ||
      status === "not_found" ||
      status === "failed"
    ) {
      await tx
        .update(prospectsTable)
        .set({
          phoneRevealStatus: "no_match",
          phoneRevealCompletedAt: new Date(),
        })
        .where(eq(prospectsTable.id, prospect.id));

      // Log under the 'blocked' action type (closest fit) with a status of
      // 'skipped' so the audit trail distinguishes it from geo-blocks.
      // Reuse the existing action types — adding an apolloPhoneRevealNoMatch
      // type is overkill for what is effectively the same operator-facing
      // outcome ("no phone for this lead").
      await tx.insert(actionLogsTable).values({
        userId: prospect.userId,
        prospectId: prospect.id,
        actionType: ACTION_TYPES.apolloPhoneRevealBlocked,
        actionStatus: "skipped",
        metadata: {
          reason: "no_match",
          apolloStatus: status ?? null,
        },
      });

      return { kind: "no_match" as const, prospectId: prospect.id };
    }

    // Geo gate. The whole reason this is a callback-time check rather
    // than a request-time check is that we don't have the phone until
    // Apollo delivers it. On block, the phone is dropped on the floor
    // — never persisted, not even briefly.
    const country = detectCountry(phone);
    if (!isAllowedPhone(phone)) {
      await tx
        .update(prospectsTable)
        .set({
          phoneRevealStatus: "blocked",
          phoneRevealCompletedAt: new Date(),
          phoneNumber: null,
        })
        .where(eq(prospectsTable.id, prospect.id));

      await tx.insert(actionLogsTable).values({
        userId: prospect.userId,
        prospectId: prospect.id,
        actionType: ACTION_TYPES.apolloPhoneRevealBlocked,
        actionStatus: "blocked",
        errorDetail: `geo_blocked country=${country ?? "unknown"}`,
        metadata: {
          country,
          // Phone NEVER goes in metadata, not even on the blocked path.
        },
      });

      return {
        kind: "blocked" as const,
        prospectId: prospect.id,
        country,
      };
    }

    // Allowed. Store the phone, transition to arrived.
    //
    // Ticket 2.3-BE-B: promote phoneNumber → phone if and only if the
    // prospect has no phone yet. Seeder-flow prospects (single-prospect
    // picker) have phone set at creation, so prospect.phone is non-null
    // and the COALESCE is a no-op. Bulk-flow pending prospects (Apollo
    // "Maybe" path) have phone=null at creation; the COALESCE here is
    // what makes them contactable via wa.me. phoneNumber is the audit/
    // diagnostic field (always set to the raw webhook value); phone is
    // the contactable field that generateLink + whatsappLink read from.
    const promotedPhone = prospect.phone ?? phone;
    await tx
      .update(prospectsTable)
      .set({
        phoneRevealStatus: "arrived",
        phoneRevealCompletedAt: new Date(),
        phoneNumber: phone,
        phone: promotedPhone,
      })
      .where(eq(prospectsTable.id, prospect.id));

    await tx.insert(actionLogsTable).values({
      userId: prospect.userId,
      prospectId: prospect.id,
      actionType: ACTION_TYPES.apolloPhoneRevealArrived,
      actionStatus: "success",
      metadata: {
        country,
        // Again: no phone in metadata. The phone is in prospects.phone_number;
        // logging it here would create a second copy in a less-privileged
        // table.
      },
    });

    return {
      kind: "arrived" as const,
      prospectId: prospect.id,
      country,
    };
  });
}
import { isAllowedPhone, detectCountry } from "../lib/geoGate";
import { GeoGateBlockedError } from "./channels/whatsapp";

/**
 * Apollo API client. Three operations the seeder UI needs:
 *
 *   - searchOrg(brand, country?) -> resolve a brand string to one or more
 *     Apollo organizations.
 *   - searchPeople(orgId, titles) -> list people inside an org filtered by
 *     SDR-relevant titles.
 *   - revealContact(personId) -> reveal email/linkedin (and any phone Apollo
 *     surfaces incidentally) for one person. Phone-reveal-via-webhook is
 *     intentionally out of scope for v1; see revealContact for details.
 *     The phone, when present, is run through the geo gate before
 *     returning; a blocked phone throws GeoGateBlockedError so the UI can
 *     surface a useful "we don't address this market" error.
 *
 * The client is a pure HTTP wrapper. Daily-usage counter increments and
 * action_log writes happen in the route handler, mirroring the split used
 * by the WhatsApp service (services/channels/whatsapp.ts vs.
 * routes/whatsappLink.ts).
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single low-level fetch helper. All public functions go through this.
 * Adds api_key to the URL, X-Api-Key header, JSON body when present.
 * Implements the 429-retry-once policy and maps non-2xx responses to
 * typed errors.
 */
async function apolloFetch<T>(
  path: string,
  opts: FetchOptions,
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

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApolloApiError(response.status, text);
  }

  const json = (await response.json()) as T;
  return json;
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
  // Apollo /mixed_people/api_search also returns "contacts"; we ignore it
  // for now — SDR seeding starts from the org-level employee directory.
}

interface PeopleMatchResponse {
  person?: RawApolloPerson;
  // Some Apollo plans return a top-level person; others nest under
  // matched_people. We accept either shape.
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
    country: raw.country ?? null,
    city: raw.city ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
    shortDescription: raw.short_description ?? null,
  };
}

function mapPerson(raw: RawApolloPerson): ApolloPersonSummary {
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
    country: raw.country ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
  };
}

/**
 * Pick the best phone number from Apollo's phone_numbers array. Apollo
 * orders "type" of mobile/work/home/other; we prefer mobile, then any
 * sanitized number, then null. Returns the sanitized E.164-ish form so
 * the geo gate sees a consistent shape.
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
 * Search Apollo organizations by name. Optional `country` (ISO-2 code or
 * full English name) narrows the result set via Apollo's
 * organization_locations filter. Returns up to 10 organizations.
 *
 * Note: Apollo's organization-name search is fuzzy. The first hit is
 * usually the right one for well-known brands, but the UI is expected to
 * let the SDR pick from the list rather than autoselecting.
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
 * Returns up to 25 people. An empty `titles` array uses the
 * DEFAULT_SDR_TITLES list. The result objects have id/name/title only;
 * email and phone are not included until revealContact is called.
 */
export async function searchPeople(
  orgId: string,
  titles: string[],
): Promise<ApolloPersonSummary[]> {
  if (!orgId || orgId.trim().length === 0) {
    return [];
  }

  const titleList =
    titles.length > 0 ? titles : Array.from(DEFAULT_SDR_TITLES);

  const body = {
    organization_ids: [orgId],
    person_titles: titleList,
    page: 1,
    per_page: 25,
  };

  const response = await apolloFetch<PeopleSearchResponse>(
    "/mixed_people/api_search",
    { method: "POST", body },
  );

  const people = response.people ?? [];
  return people.map(mapPerson).filter((p) => p.id.length > 0);
}

/**
 * Reveal email and (when Apollo surfaces it incidentally) phone + linkedin
 * for one person. THIS IS A PAID CALL — each successful reveal consumes
 * one Apollo credit. Caller increments daily_usage.apollo_reveals_used in
 * the same transaction as the action_log write.
 *
 * Phone-reveal scope (v1): we DO NOT pass reveal_phone_number=true. That
 * flag forces Apollo's async phone-reveal flow which requires a registered
 * webhook_url, signed callback handling, and a separate "phone arrived
 * later" UX in the seeder. Out of scope for the initial Apollo client
 * ticket; if a phone is needed and not present in the basic-match response,
 * the SDR can fall back to manual entry. When Apollo does include a phone
 * (cached on a previously-revealed contact, or on certain plan tiers), we
 * still run it through the geo gate before returning.
 *
 * The geo gate fires only when phone is present AND outside the allowed
 * country list. Email-only reveals are not blocked — the SDR may still
 * want the email even for a country we don't address with WhatsApp.
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
    // reveal_phone_number intentionally omitted — see function-level comment.
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
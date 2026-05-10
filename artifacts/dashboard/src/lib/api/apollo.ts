import { apiFetch } from "../api";

/**
 * Mirrors src/services/apollo.ts ApolloOrgSummary.
 * All fields except id are nullable on the server side.
 */
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

/**
 * Mirrors src/services/apollo.ts ApolloPersonSummary.
 *
 * Updated in Ticket 2.3-BE-A: extended with directPhoneStatus, hasEmail,
 * and lastNameObfuscated to support the bulk multi-select grid in
 * Ticket 2.3-FE. The bulk grid uses these fields to:
 *   - filter people who have direct phone numbers without spending credits
 *   - estimate per-person reveal cost (1 vs 8 credits) before fan-out
 *   - show enough identity (first name + obfuscated last name) for
 *     SDR recognition pre-reveal, then full last_name post-reveal.
 */
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
  /** 3-state direct phone availability:
   *  - "yes":   verified direct phone, sync reveal returns it (1 credit)
   *  - "maybe": not cached, bulk_match may find it (8 credits, async)
   *  - "no":    Apollo will not find a direct phone — skip (0 credits) */
  directPhoneStatus: "yes" | "maybe" | "no";
  /** True if Apollo has a verified email cached for this person. */
  hasEmail: boolean;
  /** Obfuscated last name from Apollo's people search (e.g. "Gi***l").
   *  Null when Apollo doesn't surface it. */
  lastNameObfuscated: string | null;
}

/**
 * Mirrors src/services/apollo.ts ApolloRevealedContact.
 * `phone` is null when Apollo doesn't have a confirmed phone for this person.
 * `email` is the post-reveal value (may also be null).
 */
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

export interface SearchOrgInput {
  brand: string;
  country?: string;
}

export interface SearchPeopleInput {
  orgId: string;
  titles?: string[];
}

export function searchOrg(
  input: SearchOrgInput,
): Promise<{ orgs: ApolloOrgSummary[] }> {
  return apiFetch("/api/apollo/search-org", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function searchPeople(
  input: SearchPeopleInput,
): Promise<{ people: ApolloPersonSummary[] }> {
  return apiFetch("/api/apollo/search-people", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revealContact(
  personId: string,
): Promise<{ contact: ApolloRevealedContact; bookkeepingWarning?: string }> {
  return apiFetch("/api/apollo/reveal", {
    method: "POST",
    body: JSON.stringify({ personId }),
  });
}

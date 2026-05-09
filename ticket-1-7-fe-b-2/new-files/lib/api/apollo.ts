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

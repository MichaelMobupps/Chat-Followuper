import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  searchOrg,
  searchPeople,
  revealContact,
  requestPhoneReveal,
  type ApolloOrgSummary,
  type ApolloPersonSummary,
  type ApolloRevealedContact,
  type SearchOrgInput,
  type SearchPeopleInput,
  type RequestPhoneRevealInput,
  type RequestPhoneRevealResponse,
} from "@/lib/api/apollo";

/**
 * All Apollo endpoints are POST mutations (per the api-server's apollo.ts route file)
 * and have side-effects (action_logs, daily_usage increments). Treat them all as
 * mutations rather than queries so react-query doesn't auto-refetch on focus.
 */

export function useSearchOrg() {
  return useMutation<
    { orgs: ApolloOrgSummary[] },
    ApiError,
    SearchOrgInput
  >({
    mutationFn: searchOrg,
  });
}

export function useSearchPeople() {
  return useMutation<
    { people: ApolloPersonSummary[] },
    ApiError,
    SearchPeopleInput
  >({
    mutationFn: searchPeople,
  });
}

export function useRevealContact() {
  return useMutation<
    { contact: ApolloRevealedContact; bookkeepingWarning?: string },
    ApiError,
    string
  >({
    mutationFn: revealContact,
  });
}

/**
 * Ticket 2.3-FE: async phone-reveal hook for the bulk WhatsApp flow.
 * Treat as mutation (POST with side-effects); never auto-refetch.
 */
export function useRequestPhoneReveal() {
  return useMutation<
    RequestPhoneRevealResponse,
    ApiError,
    RequestPhoneRevealInput
  >({
    mutationFn: requestPhoneReveal,
  });
}

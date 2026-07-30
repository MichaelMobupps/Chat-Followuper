import { apiFetch } from "../api";
import { apiPath } from "../config";

/**
 * Mirrors src/services/urlResolver.ts ResolvedUrl + the response shape
 * of POST /api/prospector/resolve-urls (Ticket 2.1-BE).
 *
 * Defensive: the server's exact field set is read tolerantly. Optional
 * fields are nullable so missing values don't crash the FE.
 */
export interface ResolvedUrl {
  url: string;
  type?: "play_store" | "app_store" | "website" | "unknown" | string;
  brand?: string | null;
  domain?: string | null;
  appName?: string | null;
  country?: string | null;
  error?: string | null;
}

export interface ResolveUrlsInput {
  urls: string[];
}

export interface ResolveUrlsResponse {
  resolved: ResolvedUrl[];
}

export function resolveUrls(
  input: ResolveUrlsInput,
): Promise<ResolveUrlsResponse> {
  return apiFetch<ResolveUrlsResponse>(apiPath("/prospector/resolve-urls"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

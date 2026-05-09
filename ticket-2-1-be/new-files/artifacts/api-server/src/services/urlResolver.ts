/**
 * URL resolver — Ticket 2.1-BE.
 *
 * Takes a heterogeneous list of URLs (Play Store, App Store, plain website)
 * and returns a uniform {url, type, brand, appName, domain, country, error}
 * shape per URL. Used upstream by 2.2-BE (discovery endpoint) to feed
 * Apollo's q_organization_domains_list filter.
 *
 * Network access is via an injected `Fetcher` so unit tests can run with
 * fixtures and no real HTTP. Production callers pass plain `fetch`.
 *
 * Per-URL timeout: 8s. Failure isolation: one URL's error never breaks
 * the batch. Concurrency is enforced by the route handler, not here.
 */

export type ResolvedUrlType =
  | "play_store"
  | "app_store"
  | "website"
  | "unknown";

export interface ResolvedUrl {
  url: string;
  type: ResolvedUrlType;
  brand: string | null;
  appName: string | null;
  domain: string | null;
  country: string | null;
  error: string | null;
}

export type Fetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export const URL_RESOLVER_TIMEOUT_MS = 8000;

const PLAY_STORE_HOSTS = new Set(["play.google.com"]);
const APP_STORE_HOSTS = new Set(["apps.apple.com", "itunes.apple.com"]);

export async function resolveUrl(
  rawUrl: string,
  fetcher: Fetcher = fetch,
): Promise<ResolvedUrl> {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return makeError(rawUrl ?? "", "unknown", "Empty URL");
  }

  let urlString = rawUrl.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = "https://" + urlString;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return makeError(rawUrl, "unknown", "Invalid URL");
  }

  const host = parsed.hostname.toLowerCase();

  if (PLAY_STORE_HOSTS.has(host)) {
    return resolvePlayStore(rawUrl, parsed, fetcher);
  }
  if (APP_STORE_HOSTS.has(host)) {
    return resolveAppStore(rawUrl, parsed, fetcher);
  }
  return resolveWebsite(rawUrl, parsed);
}

async function resolveAppStore(
  rawUrl: string,
  parsed: URL,
  fetcher: Fetcher,
): Promise<ResolvedUrl> {
  const idMatch = parsed.pathname.match(/\/id(\d+)/);
  const queryId = parsed.searchParams.get("id");
  const appId = idMatch ? idMatch[1] : queryId;
  if (!appId) {
    return makeError(rawUrl, "app_store", "Could not extract app ID from URL");
  }

  const pathCountryMatch = parsed.pathname.match(/^\/([a-z]{2})\//);
  const queryCountry = parsed.searchParams.get("country");
  const country =
    (pathCountryMatch?.[1] ?? queryCountry ?? "").toUpperCase() || null;

  const lookupUrl =
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}` +
    (country ? `&country=${country.toLowerCase()}` : "");

  let json: ItunesLookupResponse;
  try {
    const res = await fetcher(lookupUrl, {
      signal: AbortSignal.timeout(URL_RESOLVER_TIMEOUT_MS),
    });
    if (!res.ok) {
      return makeError(
        rawUrl,
        "app_store",
        `iTunes API returned ${res.status}`,
      );
    }
    json = (await res.json()) as ItunesLookupResponse;
  } catch (err) {
    return makeError(
      rawUrl,
      "app_store",
      err instanceof Error ? err.message : "fetch failed",
    );
  }

  if (
    !json ||
    !Number.isInteger(json.resultCount) ||
    !Array.isArray(json.results) ||
    json.results.length === 0
  ) {
    return makeError(rawUrl, "app_store", "No app found for this ID");
  }

  const r = json.results[0];
  return {
    url: rawUrl,
    type: "app_store",
    brand: pickFirstString(r.sellerName, r.artistName),
    appName: pickFirstString(r.trackName),
    domain: extractDomain(r.sellerUrl),
    country,
    error: null,
  };
}

interface ItunesLookupResponse {
  resultCount?: number;
  results?: Array<{
    trackName?: string;
    artistName?: string;
    sellerName?: string;
    sellerUrl?: string;
    bundleId?: string;
  }>;
}

async function resolvePlayStore(
  rawUrl: string,
  parsed: URL,
  fetcher: Fetcher,
): Promise<ResolvedUrl> {
  const packageId = parsed.searchParams.get("id");
  if (!packageId) {
    return makeError(rawUrl, "play_store", "URL missing ?id= parameter");
  }

  const fetchUrl =
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}` +
    `&hl=en`;

  let html: string;
  try {
    const res = await fetcher(fetchUrl, {
      signal: AbortSignal.timeout(URL_RESOLVER_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; doctrine-followuper/2.1; +https://anthropic.com)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      return makeError(
        rawUrl,
        "play_store",
        `Play Store returned ${res.status}`,
      );
    }
    html = await res.text();
  } catch (err) {
    return makeError(
      rawUrl,
      "play_store",
      err instanceof Error ? err.message : "fetch failed",
    );
  }

  let appName: string | null = null;
  let brand: string | null = null;
  const ldMatch = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld && typeof ld === "object") {
        if (typeof ld.name === "string") appName = ld.name;
        if (
          ld.author &&
          typeof ld.author === "object" &&
          typeof ld.author.name === "string"
        ) {
          brand = ld.author.name;
        }
      }
    } catch {
      // fall through
    }
  }

  if (!appName) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {
      appName =
        titleMatch[1].replace(/\s*-\s*Apps on Google Play\s*$/i, "").trim() ||
        null;
    }
  }

  const gl = parsed.searchParams.get("gl");
  const country = gl && /^[a-z]{2}$/i.test(gl) ? gl.toUpperCase() : null;

  return {
    url: rawUrl,
    type: "play_store",
    brand,
    appName,
    domain: null,
    country,
    error: null,
  };
}

function resolveWebsite(rawUrl: string, parsed: URL): ResolvedUrl {
  const domain = canonicalizeHost(parsed.hostname);
  if (!domain) {
    return makeError(rawUrl, "website", "Could not extract domain");
  }

  const firstSeg = domain.split(".")[0];
  const brand =
    firstSeg.length > 0
      ? firstSeg[0].toUpperCase() + firstSeg.slice(1)
      : null;

  return {
    url: rawUrl,
    type: "website",
    brand,
    appName: null,
    domain,
    country: null,
    error: null,
  };
}

function canonicalizeHost(host: string): string | null {
  if (!host) return null;
  let h = host.toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h === "localhost") return null;
  return h.length > 0 ? h : null;
}

function extractDomain(maybeUrl: string | null | undefined): string | null {
  if (!maybeUrl || typeof maybeUrl !== "string") return null;
  let s = maybeUrl.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return canonicalizeHost(u.hostname);
  } catch {
    return null;
  }
}

function pickFirstString(...values: Array<string | undefined | null>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function makeError(
  url: string,
  type: ResolvedUrlType,
  error: string,
): ResolvedUrl {
  return {
    url,
    type,
    brand: null,
    appName: null,
    domain: null,
    country: null,
    error,
  };
}

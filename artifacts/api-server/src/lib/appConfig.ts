/**
 * Single source of truth for this app's own public address and its rooted
 * paths (Bundle 1 — URL centralization; Bundle 2 — made switchable).
 *
 * Everything the server emits that points back at itself — redirect targets,
 * cookie scope, the `/api` mount points, the SPA mount, the OAuth redirect
 * URI, and the links embedded in outgoing digest emails — resolves through
 * this module instead of hardcoding a path or reading an address env var
 * directly.
 *
 * Two knobs, both env-driven, both defaulting to exactly today's values so
 * that with no env vars set the resolved strings are byte-for-byte identical
 * to the hardcoded ones they replaced:
 *
 *   BASE_PATH   default "/"  — the path prefix this app is served under.
 *   PUBLIC_URL  default ""   — this app's absolute public address.
 *
 * `PUBLIC_URL` falls back to the pre-existing `APP_PUBLIC_URL` when unset, so
 * deployments that already set `APP_PUBLIC_URL` keep working untouched.
 * When neither is set the value is the empty string, which is what
 * `(process.env.APP_PUBLIC_URL ?? "")` produced before this module existed.
 *
 * This module holds no path arithmetic of its own. It reads env and delegates
 * to `basePath.ts`, whose copy in the dashboard is byte-identical and whose
 * behavior is pinned by `basePath.test.ts` in both artifacts.
 */
import { createPathResolvers } from "./basePath";

const resolvers = createPathResolvers(process.env["BASE_PATH"] ?? "/");

/** The path prefix this app is served under. Default "/". */
export const BASE_PATH: string = resolvers.BASE_PATH;

/**
 * True when this app is served under a prefix. Every Bundle 2 behavior change
 * is gated on this, so with BASE_PATH unset the app stays exactly as it was.
 */
export const IS_PREFIXED: boolean = resolvers.PREFIX !== "";

/** Mount point of the API router. "/api" at the default base. */
export const API_BASE_PATH: string = resolvers.API_BASE_PATH;

/**
 * The API mount the *platform* probes, which is not affected by BASE_PATH.
 *
 * `artifacts/api-server/.replit-artifact/artifact.toml` declares
 * `[services.production.health.startup] path = "/api/healthz"` — a literal, in
 * a file the artifact tooling owns and that cannot read an env var. So the
 * startup health check asks for `/api/healthz` whatever BASE_PATH says, while
 * API_BASE_PATH moves to `/chat/api` the moment BASE_PATH is set. Without a
 * mount here a prefixed deployment would fail its own startup probe.
 *
 * This constant is deliberately not built from `appPath()`: its whole job is
 * to be the address in that TOML file, unmoved by configuration. If the health
 * path in artifact.toml ever changes, change this with it.
 */
export const PLATFORM_API_BASE_PATH: string = "/api";

/** Path scope for this app's cookies. "/" at the default base. */
export const COOKIE_PATH: string = resolvers.COOKIE_PATH;

/**
 * Build a rooted app path under BASE_PATH.
 * At the default base: appPath("/login") === "/login", appPath("/") === "/".
 */
export const appPath: (path: string) => string = resolvers.appPath;

/**
 * Build a rooted API path under BASE_PATH.
 * At the default base: apiPath("/auth/me") === "/api/auth/me".
 */
export const apiPath: (path: string) => string = resolvers.apiPath;

/** This app's absolute public address, no trailing slash. Default "". */
export const PUBLIC_URL: string = (
  process.env["PUBLIC_URL"] ??
  process.env["APP_PUBLIC_URL"] ??
  ""
).replace(/\/+$/, "");

/**
 * The origin half of PUBLIC_URL — the part to which a rooted path built by
 * appPath()/apiPath() is appended.
 *
 * At cutover PUBLIC_URL is `https://tools.mobupps.net/chat`, i.e. it already
 * carries the prefix, while appPath() adds the prefix too. Concatenating both
 * would emit `https://tools.mobupps.net/chat/chat/api/...` into digest emails
 * that cannot be recalled. Stripping a trailing prefix here means both
 * spellings of PUBLIC_URL — with the prefix and without it — resolve to the
 * same correct link. With BASE_PATH unset there is no prefix to strip and
 * this is exactly PUBLIC_URL.
 */
export const PUBLIC_ORIGIN: string = resolvers.stripPrefix(PUBLIC_URL);

/**
 * PUBLIC_URL for call sites that cannot produce a usable link without it.
 * Throws the same message the follow-up digest threw before centralization,
 * so an unconfigured deployment fails in exactly the same place and way.
 */
export function requirePublicUrl(): string {
  if (PUBLIC_URL === "") {
    throw new Error(
      "APP_PUBLIC_URL is not set; required to build follow-up open links.",
    );
  }
  return PUBLIC_URL;
}

/**
 * Absolute URL for a rooted app path, built on the non-throwing PUBLIC_ORIGIN.
 * At the default base with no address configured this yields the bare rooted
 * path, which is what the follow-up fallback redirect produced before.
 */
export function absoluteAppUrl(path: string): string {
  return `${PUBLIC_ORIGIN}${appPath(path)}`;
}

/**
 * Absolute URL for a rooted API path. Used for links that leave this process
 * — digest emails and the Google OAuth redirect URI.
 */
export function absoluteApiUrl(path: string): string {
  return `${PUBLIC_ORIGIN}${apiPath(path)}`;
}

/**
 * The redirect URI handed to Google, both on the authorization request and on
 * the token exchange. The two must be byte-identical to each other and to the
 * value registered in the Google Cloud Console.
 *
 * `GOOGLE_OAUTH_REDIRECT_URI` still wins whenever it is set, which is the
 * case in every environment today — so this is dark by construction and the
 * registered value is never second-guessed. It is only when that variable is
 * absent that the URI is derived from PUBLIC_URL, which is what lets a
 * base-path move follow PUBLIC_URL without a code change. The throw when
 * neither is available reproduces the previous `getEnv` message exactly.
 */
export function googleOAuthRedirectUri(): string {
  const explicit = process.env["GOOGLE_OAUTH_REDIRECT_URI"];
  if (explicit) return explicit;
  if (PUBLIC_ORIGIN === "") {
    throw new Error(
      "Missing required environment variable: GOOGLE_OAUTH_REDIRECT_URI",
    );
  }
  return absoluteApiUrl("/auth/google/callback");
}

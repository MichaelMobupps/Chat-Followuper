/**
 * Single source of truth for this app's own public address and its rooted
 * paths (Bundle 1 — URL centralization).
 *
 * Everything the server emits that points back at itself — redirect targets,
 * cookie scope, the `/api` mount points, and the links embedded in outgoing
 * digest emails — resolves through this module instead of hardcoding a path
 * or reading an address env var directly.
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
 * Bundle 1 only routes the call sites through here. Making the values
 * genuinely switchable (per-app cookie name, prefix-aware SPA catch-all) is
 * Bundle 2.
 */

/**
 * Normalize a configured base path to a leading slash with no trailing slash,
 * except for the root, which stays "/". "" and "/" both mean "no prefix".
 *
 * Repeated slashes are collapsed. That is not cosmetic: without it a
 * misconfigured BASE_PATH of "//host" would make appPath() return
 * "//host/login", a protocol-relative URL, which would turn the login
 * redirects into an open redirect off this origin.
 */
function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  const withoutTrailing = collapsed.replace(/\/+$/, "");
  return withoutTrailing === "" ? "/" : withoutTrailing;
}

/** The path prefix this app is served under. Default "/". */
export const BASE_PATH: string = normalizeBasePath(
  process.env["BASE_PATH"] ?? "/",
);

/**
 * BASE_PATH in joinable form: "" at the root, otherwise "/prefix". Kept
 * private so callers go through appPath/apiPath and cannot mis-join.
 */
const PREFIX: string = BASE_PATH === "/" ? "" : BASE_PATH;

/** This app's absolute public address, no trailing slash. Default "". */
export const PUBLIC_URL: string = (
  process.env["PUBLIC_URL"] ??
  process.env["APP_PUBLIC_URL"] ??
  ""
).replace(/\/+$/, "");

/**
 * Build a rooted app path under BASE_PATH.
 * At the default base: appPath("/login") === "/login", appPath("/") === "/".
 */
export function appPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const joined = `${PREFIX}${suffix}`;
  const trimmed = joined.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Mount point of the API router. "/api" at the default base. */
export const API_BASE_PATH: string = appPath("/api");

/**
 * Build a rooted API path under BASE_PATH.
 * At the default base: apiPath("/auth/me") === "/api/auth/me".
 */
export function apiPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_PATH}${suffix}`;
}

/** Path scope for this app's cookies. "/" at the default base. */
export const COOKIE_PATH: string = appPath("/");

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
 * Absolute URL for a rooted app path, built on the non-throwing PUBLIC_URL.
 * At the default base with no address configured this yields the bare rooted
 * path, which is what the follow-up fallback redirect produced before.
 */
export function absoluteAppUrl(path: string): string {
  return `${PUBLIC_URL}${appPath(path)}`;
}

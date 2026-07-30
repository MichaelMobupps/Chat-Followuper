/**
 * Single source of truth for this app's own public address and its rooted
 * paths, dashboard side (Bundle 1 — URL centralization).
 *
 * Mirrors `artifacts/api-server/src/lib/appConfig.ts`. The two artifacts are
 * separate builds, so each carries its own copy of this surface rather than a
 * shared package (a shared package would be a dependency addition).
 *
 * Two knobs, both env-driven, both defaulting to exactly today's values so
 * that with no env vars set the resolved strings are byte-for-byte identical
 * to the hardcoded ones they replaced:
 *
 *   BASE_PATH   default "/"  — the path prefix this app is served under.
 *                              Comes from Vite's `base`, which vite.config.ts
 *                              already drives off the BASE_PATH env var.
 *   PUBLIC_URL  default ""   — this app's absolute public address. The
 *                              dashboard uses only relative paths today, so
 *                              the default is empty and nothing consumes it
 *                              yet; it exists so the two config modules stay
 *                              symmetrical.
 *
 * Bundle 1 only routes the call sites through here. Making the values
 * genuinely switchable is Bundle 2.
 */

/**
 * Normalize a configured base path to a leading slash with no trailing slash,
 * except for the root, which stays "/". "" and "/" both mean "no prefix".
 *
 * Repeated slashes are collapsed, matching the server module: without it a
 * misconfigured base of "//host" would make appPath() return a
 * protocol-relative URL pointing off this origin.
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
  import.meta.env.BASE_URL ?? "/",
);

/**
 * BASE_PATH in joinable form: "" at the root, otherwise "/prefix". This is
 * also exactly what wouter's <Router base> expects.
 */
export const ROUTER_BASE: string = BASE_PATH === "/" ? "" : BASE_PATH;

/** This app's absolute public address, no trailing slash. Default "". */
export const PUBLIC_URL: string = (
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

/**
 * Build a rooted app path under BASE_PATH.
 * At the default base: appPath("/login") === "/login", appPath("/") === "/".
 */
export function appPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const joined = `${ROUTER_BASE}${suffix}`;
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

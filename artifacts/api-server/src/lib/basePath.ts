/**
 * Pure base-path arithmetic (Bundle 2 — switchable base path).
 *
 * This file is intentionally byte-identical between
 * `artifacts/api-server/src/lib/basePath.ts` and
 * `artifacts/dashboard/src/lib/basePath.ts`. The two artifacts are separate
 * builds and cannot share a package without adding a workspace dependency, so
 * they share a copy instead — and a unit test in each artifact runs the same
 * assertions, so the copies cannot silently drift.
 *
 * Deliberately free of `process.env`, `import.meta` and every other ambient
 * input: everything here is a function of its arguments. That is what makes
 * it unit-testable under a plain `node --test` run with no test framework and
 * no new dependency.
 *
 * The env-reading adapters live in `appConfig.ts` (server) and `config.ts`
 * (dashboard). Neither adds logic; both only supply `rawBase`.
 */

/**
 * Normalize a configured base path to a leading slash with no trailing slash,
 * except for the root, which stays "/". "" and "/" both mean "no prefix".
 *
 * Repeated slashes are collapsed. That is not cosmetic: without it a
 * misconfigured base of "//host" would make appPath() return "//host/login",
 * a protocol-relative URL, which would turn the login redirects into an open
 * redirect off this origin. (Bundle 1, audit round 1.)
 */
export function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  const withoutTrailing = collapsed.replace(/\/+$/, "");
  return withoutTrailing === "" ? "/" : withoutTrailing;
}

export interface PathResolvers {
  /** The normalized prefix this app is served under. "/" at the default. */
  readonly BASE_PATH: string;
  /** BASE_PATH in joinable form: "" at the root, otherwise "/prefix". */
  readonly PREFIX: string;
  /** Mount point of the API router. "/api" at the default base. */
  readonly API_BASE_PATH: string;
  /** Path scope for this app's cookies. "/" at the default base. */
  readonly COOKIE_PATH: string;
  /** Build a rooted app path under the base. */
  appPath(path: string): string;
  /** Build a rooted API path under the base. */
  apiPath(path: string): string;
  /**
   * Strip the prefix from an absolute address that already carries it, so a
   * public URL of "https://host/chat" and an appPath() of "/chat/login" do
   * not compose into "https://host/chat/chat/login".
   */
  stripPrefix(absoluteUrl: string): string;
}

/**
 * Build the full resolver set for one configured base. Every consumer in both
 * artifacts goes through this, so the two can never drift apart.
 */
export function createPathResolvers(rawBase: string): PathResolvers {
  const BASE_PATH = normalizeBasePath(rawBase);
  const PREFIX = BASE_PATH === "/" ? "" : BASE_PATH;

  function appPath(path: string): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const joined = `${PREFIX}${suffix}`;
    const trimmed = joined.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
  }

  const API_BASE_PATH = appPath("/api");

  function apiPath(path: string): string {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_PATH}${suffix}`;
  }

  function stripPrefix(absoluteUrl: string): string {
    if (PREFIX === "") return absoluteUrl;
    const withoutTrailing = absoluteUrl.replace(/\/+$/, "");
    return withoutTrailing.endsWith(PREFIX)
      ? withoutTrailing.slice(0, withoutTrailing.length - PREFIX.length)
      : withoutTrailing;
  }

  return {
    BASE_PATH,
    PREFIX,
    API_BASE_PATH,
    COOKIE_PATH: appPath("/"),
    appPath,
    apiPath,
    stripPrefix,
  };
}

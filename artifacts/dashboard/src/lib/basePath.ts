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
 * One path segment that is safe to appear in a base path. Deliberately an
 * allowlist: a base path is a piece of deployment configuration naming a route
 * prefix, so it never legitimately needs a colon, a query, a fragment, an
 * escape, whitespace or a control character.
 */
const SAFE_BASE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Values that must never reach a URL, whether as a redirect target on the
 * server or stamped into an asset URL at build time (CP1, finding 3).
 *
 * Collapsing repeated slashes — which is all this module used to do — defends
 * one spelling of one attack. It does not defend these:
 *
 *   "//evil.example/"      protocol-relative; the browser reads the first
 *                          segment as a hostname and leaves this origin
 *   "///evil.example/"     the same, past a naive startsWith("//") check
 *   "/\evil.example/"      browsers and the URL spec fold "\" into "/", so
 *                          this *is* "//evil.example/" by the time it is
 *                          resolved — and nothing here collapses backslashes
 *   "https://evil.example/" an absolute URL: prefixing "/" only produces
 *                          "/https:/evil.example", but the scheme has no
 *                          business in a path prefix either way
 *   "javascript:x"         a scheme that executes rather than navigates
 *
 * Stamped into `<script src>` in a built index.html, the first three load and
 * run an attacker's JavaScript in every user's browser on every page. On the
 * server the same values turn every `res.redirect(appPath(...))` into an open
 * redirect. Both are configuration-reachable, not request-reachable, so this
 * is a guard against a hostile or fat-fingered deployment value rather than
 * against a request — which is exactly why it must fail closed and silently
 * to the safe value rather than propagate.
 */
function isUnsafeBasePath(trimmed: string): boolean {
  // Any scheme at all: "javascript:x", "https://evil.example/", "data:…".
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return true;
  // Protocol-relative, at any number of leading slashes.
  if (trimmed.startsWith("//")) return true;
  // Backslash anywhere — it is a "/" to a browser, so it can reconstruct the
  // leading "//" that the check above rejects.
  if (trimmed.includes("\\")) return true;
  // Everything else must be plain rooted path segments. This is what rejects
  // queries, fragments, credentials, percent-escapes, whitespace, control
  // characters and dot-segment traversal.
  const segments = trimmed.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return true;
  return segments.some(
    (segment) =>
      segment === "." ||
      segment === ".." ||
      !SAFE_BASE_SEGMENT.test(segment),
  );
}

/**
 * Normalize a configured base path to a leading slash with no trailing slash,
 * except for the root, which stays "/". "" and "/" both mean "no prefix".
 *
 * Repeated slashes are collapsed. That is not cosmetic: without it a
 * misconfigured base of "//host" would make appPath() return "//host/login",
 * a protocol-relative URL, which would turn the login redirects into an open
 * redirect off this origin. (Bundle 1, audit round 1.)
 *
 * Anything `isUnsafeBasePath` rejects resolves to "/" — the app serves at the
 * root, exactly as it does with BASE_PATH unset, rather than carrying a
 * hostile value into a redirect or an asset URL. (CP1, finding 3.) Every
 * legitimate spelling is unaffected: unset, "/", "/chat", "chat", "/chat/",
 * "/tools/chat" and "/__mockup" all resolve exactly as they did before.
 */
export function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return "/";
  if (isUnsafeBasePath(trimmed)) return "/";
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

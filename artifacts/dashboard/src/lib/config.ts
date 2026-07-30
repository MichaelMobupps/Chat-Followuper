/**
 * Single source of truth for this app's own public address and its rooted
 * paths, dashboard side (Bundle 1 — URL centralization; Bundle 2 — made
 * switchable).
 *
 * Mirrors `artifacts/api-server/src/lib/appConfig.ts`. The two artifacts are
 * separate builds, so each carries its own copy of this surface rather than a
 * shared package (a shared package would be a dependency addition). The path
 * arithmetic itself is not copied twice by hand: both sides delegate to
 * `basePath.ts`, which is byte-identical in the two artifacts and pinned by
 * the same unit-test suite in each.
 *
 * Two knobs, both env-driven, both defaulting to exactly today's values so
 * that with no env vars set the resolved strings are byte-for-byte identical
 * to the hardcoded ones they replaced:
 *
 *   BASE_PATH   default "/"  — the path prefix this app is served under.
 *                              Comes from Vite's `base`, which vite.config.ts
 *                              already drives off the BASE_PATH env var, and
 *                              which Vite exposes as import.meta.env.BASE_URL
 *                              (always with a trailing slash — normalized
 *                              away here).
 *   PUBLIC_URL  default ""   — this app's absolute public address. The
 *                              dashboard uses only relative paths today, so
 *                              the default is empty and nothing consumes it
 *                              yet; it exists so the two config modules stay
 *                              symmetrical.
 */
import { createPathResolvers } from "./basePath";

const resolvers = createPathResolvers(import.meta.env.BASE_URL ?? "/");

/** The path prefix this app is served under. Default "/". */
export const BASE_PATH: string = resolvers.BASE_PATH;

/**
 * BASE_PATH in joinable form: "" at the root, otherwise "/prefix". This is
 * also exactly what wouter's <Router base> expects, and exactly what the
 * generated API client's setBaseUrl() expects — empty means "leave every
 * request path untouched".
 */
export const ROUTER_BASE: string = resolvers.PREFIX;

/** Mount point of the API router. "/api" at the default base. */
export const API_BASE_PATH: string = resolvers.API_BASE_PATH;

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
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

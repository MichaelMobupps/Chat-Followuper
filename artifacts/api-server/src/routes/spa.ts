/**
 * Serving the dashboard from the api-server process, under a base path
 * (Bundle 2, scope item 3).
 *
 * WHY THIS EXISTS. In this workspace the dashboard is not served by any
 * application code: `artifacts/dashboard/.replit-artifact/artifact.toml`
 * declares `serve = "static"` with a `publicDir` and a `/*` → `/index.html`
 * rewrite, and the artifact router hands it every path under `/`. That router
 * forwards the full path without stripping it — the sibling `mockup-sandbox`
 * artifact proves it, running at `paths = ["/__mockup"]` with a Vite server
 * whose own `base` is `/__mockup`. So under a prefix the browser asks this
 * origin for `/chat/`, `/chat/login` and `/chat/assets/*`, and something has
 * to answer with index.html and the built files. Decision (Michael, before
 * any edit): this process answers.
 *
 * THE DARKNESS RULE. Nothing here mounts unless BASE_PATH is set to something
 * other than "/". At the default base `mountSpa` returns immediately and the
 * app has exactly the middleware stack it has today.
 *
 * Ordering matters and is enforced by the caller: this mounts *after* the API
 * router, and the catch-all explicitly refuses anything under the API prefix.
 * Without that refusal an unmatched `/chat/api/...` would fall through to the
 * catch-all and answer `200 text/html`, so every API miss would hand the
 * client an HTML page to parse as JSON instead of a JSON 404.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { API_BASE_PATH, BASE_PATH, IS_PREFIXED } from "../lib/appConfig";
import { logger } from "../lib/logger";

/**
 * Where the built dashboard lives. `DASHBOARD_DIST_DIR` overrides it; the
 * default resolves from this bundle's own location, which is
 * `artifacts/api-server/dist/index.mjs` in both dev and production (see
 * build.mjs), so `../../dashboard/dist/public` lands on the Vite `outDir`
 * configured in `artifacts/dashboard/vite.config.ts`.
 */
export function resolveDashboardDir(): string {
  const override = process.env["DASHBOARD_DIST_DIR"];
  if (override) return path.resolve(override);
  return path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "dashboard",
    "dist",
    "public",
  );
}

/**
 * True when `requestPath` is inside the API mount, which the SPA must never
 * answer for. Matches the API prefix itself and anything below it, and
 * nothing that merely starts with the same characters ("/chat/apiary").
 *
 * Compared case-insensitively on purpose: Express runs with `caseSensitive`
 * off by default, so `/chat/API/auth/me` reaches the API router just like
 * `/chat/api/auth/me` does. A case-sensitive guard here would therefore let a
 * *missed* `/chat/API/...` fall through to the SPA and answer 200 text/html
 * where `/chat/api/...` answers a 404 — the same path served two different
 * ways depending on capitalization. Caught in audit round 1.
 */
export function isApiPath(requestPath: string): boolean {
  const p = requestPath.toLowerCase();
  const api = API_BASE_PATH.toLowerCase();
  return p === api || p.startsWith(`${api}/`);
}

/**
 * Mount the prefixed SPA surface. No-op at the default base.
 *
 * Must be called after the API routes are mounted.
 */
export function mountSpa(app: Express): void {
  if (!IS_PREFIXED) return;

  const dir = resolveDashboardDir();
  const indexHtml = path.join(dir, "index.html");

  if (!existsSync(indexHtml)) {
    // Loud, but not fatal: the API must still come up. A missing build is an
    // operator error (dashboard not built, or DASHBOARD_DIST_DIR wrong), and
    // failing to boot the API over it would turn a broken page into an
    // outage.
    logger.error(
      { dir, basePath: BASE_PATH },
      "BASE_PATH is set but the built dashboard was not found; " +
        "serving the API only. Build the dashboard or set DASHBOARD_DIST_DIR.",
    );
    return;
  }

  // A request for the bare prefix has no trailing slash, so the browser would
  // resolve every relative URL in index.html against the parent directory.
  // Redirect it once.
  //
  // This is a middleware with an exact `req.path` comparison, deliberately not
  // `app.get(BASE_PATH, …)`. Express runs with `strict routing` off by
  // default, so a path-matched route for "/chat" also matches "/chat/" — and
  // that route would then redirect "/chat/" to "/chat/", an infinite redirect
  // loop on the main page. Caught by the first LIT smoke run.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path !== BASE_PATH) return next();
    // Carry the query string across. The post-login redirect targets
    // appPath("/"), which is the bare prefix, and the login page reads
    // ?error= off window.location — dropping the query here would silently
    // swallow those codes and show a blank login form. Caught in audit
    // round 1.
    const q = req.originalUrl.indexOf("?");
    const query = q >= 0 ? req.originalUrl.slice(q) : "";
    res.redirect(302, `${BASE_PATH}/${query}`);
  });

  // Built assets. `index: "index.html"` is what answers `/chat/` itself.
  // fallthrough stays on (the default) so a miss reaches the catch-all below.
  app.use(BASE_PATH, express.static(dir, { index: "index.html" }));

  // Deep links: /chat/login, /chat/prospects/42, … hard-load into index.html
  // and wouter takes over client-side. Everything outside the prefix, and
  // everything under the API mount, is left to the rest of the stack.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();
    if (req.path !== BASE_PATH && !req.path.startsWith(`${BASE_PATH}/`)) {
      return next();
    }
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });

  logger.info({ dir, basePath: BASE_PATH }, "Serving dashboard under base path");
}

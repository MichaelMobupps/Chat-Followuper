import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { normalizeBasePath } from "./src/lib/basePath";

export default defineConfig(async ({ command }) => {
  // PORT only matters for the dev server / preview (the `server`/`preview`
  // blocks below). `vite build` never reads PORT, so requiring it at load time
  // broke a bare `pnpm run build` (CI / workspace root) even though production
  // deploys always inject it via the artifact's [services.env]. Enforce it
  // only when serving; `base` still defaults to the same "/" production sets,
  // so build output is unchanged. (CF-R1: July's serving-time BASE_PATH
  // requirement is deliberately NOT restored — CP1 made BASE_PATH optional,
  // defaulting to "/", after removing the artifact.toml pin that used to
  // supply it; requiring it at serve time would break the dev server the
  // moment nothing pins it.)
  const serving = command === "serve";

  const rawPort = process.env.PORT;
  let port: number | undefined;
  if (serving) {
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    port = Number(rawPort);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  /**
   * The base path this build is served under (CP1, findings 2 and 3).
   *
   * Two things changed here, and both are load-bearing at cutover.
   *
   * 1. BASE_PATH is optional, defaulting to "/". It used to be required, which
   *    only worked because `artifact.toml` pinned `BASE_PATH = "/"` in an
   *    unscoped `[services.env]`. That pin is what made the switch unusable: a
   *    value pinned in the artifact file always wins over the deployment
   *    environment, so setting BASE_PATH on the deployment could never reach
   *    the build. The pin is gone, so the value now flows from the environment
   *    — and the default here is what keeps an unset environment identical to
   *    the pinned "/" it replaces.
   *
   * 2. The value is resolved through the *application's own* `normalizeBasePath`
   *    rather than being stamped into `base` verbatim. Vite writes `base` into
   *    every asset URL in the emitted index.html, so a hostile value goes
   *    straight into `<script src>` — "//evil.example/" and its spellings load
   *    and execute an attacker's JavaScript in every user's browser, on every
   *    page, from a static file. Importing the app's validator rather than
   *    copying it is deliberate: a private copy here could drift from the one
   *    the server routes and redirects with, and then the build and the server
   *    would disagree about what the base actually is.
   *
   * `normalizeBasePath` returns "/" for anything it rejects, so a hostile
   * value produces a build byte-identical to the unset one.
   */
  const rawBasePath = process.env.BASE_PATH ?? "/";
  const trimmedBasePath = rawBasePath.trim();
  const normalizedBasePath = normalizeBasePath(rawBasePath);

  if (
    trimmedBasePath !== "" &&
    trimmedBasePath !== "/" &&
    normalizedBasePath === "/"
  ) {
    // Not fatal — falling back to the root is the safe outcome and failing the
    // build would turn a bad env var into an outage — but it must not be
    // silent, or a rejected prefix looks exactly like a successful root build.
    console.warn(
      `[vite.config] BASE_PATH ${JSON.stringify(rawBasePath)} is not a usable ` +
        `path prefix and was ignored; building for "/" instead.`,
    );
  }

  // Vite's own form of `base` carries a trailing slash, and that is what it
  // exposes to the app as import.meta.env.BASE_URL.
  const basePath = normalizedBasePath === "/" ? "/" : `${normalizedBasePath}/`;

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});

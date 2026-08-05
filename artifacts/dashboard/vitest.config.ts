/// <reference types="vitest" />
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Dashboard unit tests.
 *
 * The dashboard had NO test infrastructure until 2026-07-14: every FE claim in
 * the audit ledger rested on typecheck + review, which is how a hook bug
 * (usePrepareProgress believing a stale terminal progress entry) survived a
 * first fix that was itself wrong. These tests exist to make the progress /
 * preview state machines assertable instead of arguable.
 *
 * Mirrors lib/db's vitest setup (same vitest major, `test: "vitest run"`), with
 * jsdom + the `@/` alias from vite.config.ts.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // CF-R1: basePath.test.ts is Bundle 2's suite, byte-identical with the
    // api-server copy and written for Node's built-in runner (node:test +
    // .ts-extension imports). It is run by the package's test script via
    // `node --test`, not by vitest — excluding it here keeps both
    // infrastructures as gates without rewriting the shared file.
    exclude: [...configDefaults.exclude, "src/lib/basePath.test.ts"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    testTimeout: 15000,
  },
});

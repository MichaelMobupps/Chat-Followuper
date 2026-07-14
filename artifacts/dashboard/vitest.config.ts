/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";
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
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    testTimeout: 15000,
  },
});

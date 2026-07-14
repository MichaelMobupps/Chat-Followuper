import { defineConfig, devices } from "@playwright/test";

/**
 * Browser resolution on Replit/Nix.
 *
 * `npx playwright install chromium` DOWNLOADS a generic Linux build that cannot
 * run here — it dies with `libglib-2.0.so.0: cannot open shared object file`,
 * and `playwright install-deps` is apt-based, so it can't fix a Nix box either.
 * Nix already ships a chromium patchelf'd against this environment's libs; use
 * that instead. It pins the pairing: `playwright-browsers-1.55.0` carries
 * chromium-1187, so **@playwright/test is held at 1.55.0** — bumping it will
 * break the launch until a matching nix browsers path exists.
 *
 * The store path only provides `chromium-1187` (the full build), NOT
 * `chromium_headless_shell-1187`, which is what playwright reaches for by
 * default in headless mode — hence `channel: "chromium"` below.
 */
const NIX_BROWSERS =
  "/nix/store/71577rskzyhch3axhdqx7faygc2xyn4v-playwright-browsers-1.55.0-with-cjk";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= NIX_BROWSERS;

/**
 * Browser E2E for the Contacts generate → preview → confirm flow.
 *
 * SCOPE — read this before extending:
 *   - Serves the REAL production build (`dist/public`) over `vite preview` on
 *     127.0.0.1. Everything under /api is stubbed per-test with `page.route`.
 *   - **Nothing here ever leaves localhost.** No DB, no api-server, no LLM
 *     calls, no spend. In particular the tests STUB `window.open`, so the
 *     LinkedIn deep link (a real linkedin.com profile URL) is asserted as a
 *     string and never navigated to. This app performs no LinkedIn automation
 *     by design — LinkedIn delivery is the SDR clicking, in their own browser,
 *     as themselves — and these tests must not become the exception.
 *   - Any new test that would issue a request to a third-party host does not
 *     belong in this suite.
 *
 * Why stub the network rather than run the stack: driving a real generate would
 * cost real LLM money per run, and a cached-message prospect can't reach the
 * Generate button at all (it needs status "draft"). Stubbing lets us drive the
 * REAL React tree, real CSS and a real browser, deterministically — including
 * the stale-progress race that jsdom can only approximate.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // `channel: "chromium"` = the full build the nix store actually carries
      // (see the note above); without it playwright looks for the headless
      // shell, which isn't there.
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    // `vite preview` serves the built app; PORT/BASE_PATH are required by
    // vite.config.ts whenever it is serving rather than building.
    command: "pnpm run build && PORT=4173 BASE_PATH=/ pnpm run serve",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

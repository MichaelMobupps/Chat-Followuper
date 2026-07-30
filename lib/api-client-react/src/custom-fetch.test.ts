/**
 * Unit tests for the base-URL behavior of customFetch (Bundle 2).
 *
 * This is the pin under TODO.md open item 1 — the cutover blocker. The
 * generated client bakes "/api/..." into every request URL at codegen time
 * (orval `baseUrl: "/api"`), and the dashboard makes those resolve under a
 * prefix by calling setBaseUrl() at boot instead of regenerating. The exact
 * literals asserted below are the ones orval emits today, taken verbatim from
 * generated/api.ts, so this test fails loudly if either side moves.
 *
 *   node --test src/custom-fetch.test.ts
 *
 * Excluded from tsconfig (this project emits declarations; the test is run,
 * not built). No test framework, no new dependency.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { customFetch, setBaseUrl } from "./custom-fetch.ts";

// The literals in lib/api-client-react/src/generated/api.ts today.
const GENERATED_URLS = ["/api/healthz", "/api/auth/me", "/api/auth/logout"];

const realFetch = globalThis.fetch;
let seen: string[] = [];

beforeEach(() => {
  seen = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(typeof input === "string" ? input : String(input));
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setBaseUrl(null);
});

test("DARK: an empty base leaves every generated URL byte-for-byte alone", async () => {
  // "" is what the dashboard passes when BASE_PATH is unset.
  setBaseUrl("");
  for (const url of GENERATED_URLS) await customFetch(url);
  assert.deepEqual(seen, GENERATED_URLS);
});

test("DARK: never calling setBaseUrl is identical to calling it with \"\"", async () => {
  for (const url of GENERATED_URLS) await customFetch(url);
  assert.deepEqual(seen, GENERATED_URLS);
});

test("LIT: a base prefixes every generated URL exactly once", async () => {
  setBaseUrl("/chat");
  for (const url of GENERATED_URLS) await customFetch(url);
  assert.deepEqual(seen, [
    "/chat/api/healthz",
    "/chat/api/auth/me",
    "/chat/api/auth/logout",
  ]);
});

test("LIT: a trailing slash on the base does not double up", async () => {
  setBaseUrl("/chat/");
  await customFetch("/api/auth/me");
  assert.deepEqual(seen, ["/chat/api/auth/me"]);
});

test("absolute URLs are never rewritten, with or without a base", async () => {
  setBaseUrl("/chat");
  await customFetch("https://example.test/api/auth/me");
  assert.deepEqual(seen, ["https://example.test/api/auth/me"]);
});

test("setBaseUrl(null) restores the dark behavior", async () => {
  setBaseUrl("/chat");
  await customFetch("/api/auth/me");
  setBaseUrl(null);
  await customFetch("/api/auth/me");
  assert.deepEqual(seen, ["/chat/api/auth/me", "/api/auth/me"]);
});

test("query strings survive the prefixing", async () => {
  setBaseUrl("/chat");
  await customFetch("/api/prospects?status=ready&page=2");
  assert.deepEqual(seen, ["/chat/api/prospects?status=ready&page=2"]);
});

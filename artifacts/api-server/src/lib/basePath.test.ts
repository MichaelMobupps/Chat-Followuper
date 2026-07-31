/**
 * Unit tests for the pure base-path arithmetic (Bundle 2).
 *
 * Byte-identical between the two artifacts, exactly like `basePath.ts`, so
 * the server copy and the dashboard copy are pinned to the same behavior.
 * Runs on Node's built-in test runner with native TypeScript stripping:
 *
 *   node --test src/lib/basePath.test.ts
 *
 * No test framework, no new dependency. The point of these tests is the
 * darkness rule: the "/" column below must hold byte-for-byte forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPathResolvers, normalizeBasePath } from "./basePath.ts";

test("normalizeBasePath: the root spellings all collapse to /", () => {
  for (const raw of ["", "/", "  ", " / ", "//", "///"]) {
    assert.equal(normalizeBasePath(raw), "/", `input ${JSON.stringify(raw)}`);
  }
});

test("normalizeBasePath: a prefix gets one leading slash and no trailing one", () => {
  for (const raw of ["/chat", "chat", "/chat/", "chat/", " /chat/ "]) {
    assert.equal(normalizeBasePath(raw), "/chat", `input ${JSON.stringify(raw)}`);
  }
});

test("normalizeBasePath: nested prefixes keep their inner slash", () => {
  assert.equal(normalizeBasePath("/tools/chat/"), "/tools/chat");
  assert.equal(normalizeBasePath("tools//chat"), "/tools/chat");
  // The mockup-sandbox artifact's own base, so the allowlist must pass "_".
  assert.equal(normalizeBasePath("/__mockup"), "/__mockup");
});

test("normalizeBasePath: repeated slashes cannot produce a protocol-relative URL", () => {
  // The Bundle 1 audit finding. "//evil.example" must not survive as a
  // leading "//", or appPath() would emit "//evil.example/login" and every
  // login redirect would leave this origin.
  //
  // CP1 strengthened the answer: it no longer merely collapses to
  // "/evil.example" but resolves to the root, so the attacker-chosen string
  // does not appear in a redirect target or an asset URL at all. The
  // assertions Bundle 1 wrote still hold and are kept.
  const hostile = createPathResolvers("//evil.example");
  assert.equal(hostile.BASE_PATH, "/");
  assert.equal(hostile.appPath("/login"), "/login");
  assert.ok(!hostile.appPath("/login").startsWith("//"));
  assert.ok(!hostile.apiPath("/auth/me").startsWith("//"));
  assert.ok(!hostile.COOKIE_PATH.startsWith("//"));
});

test("CP1: a hostile base resolves to the root, never into a URL", () => {
  // The five values the CP1 order names, plus the neighbours that make each
  // of them reachable by another spelling. Every one must be indistinguishable
  // from an unset BASE_PATH — that is what makes a hostile build byte-identical
  // to the dark build.
  const hostile = [
    "//evil.example/",
    "///evil.example/",
    "/\\evil.example/",
    "https://evil.example/",
    "javascript:x",
    // Same classes, other spellings.
    "//evil.example",
    "\\\\evil.example",
    "/chat\\..\\..",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://evil.example",
    "//evil.example/#",
    "/chat?x=1",
    "/chat#frag",
    "/../etc",
    "/chat/../..",
    "/ev il",
    "/%2e%2e%2f",
    "/chat\u0000",
    "/chat\nSet-Cookie: a=b",
  ];
  for (const raw of hostile) {
    const r = createPathResolvers(raw);
    const where = `input ${JSON.stringify(raw)}`;
    assert.equal(r.BASE_PATH, "/", where);
    assert.equal(r.PREFIX, "", where);
    assert.equal(r.API_BASE_PATH, "/api", where);
    assert.equal(r.COOKIE_PATH, "/", where);
    assert.equal(r.appPath("/login"), "/login", where);
    assert.equal(r.apiPath("/auth/me"), "/api/auth/me", where);
  }
});

test("CP1: the hardening never rejects a legitimate base", () => {
  // The darkness rule's other half. If this list ever shrinks, a cutover
  // stamps "/assets/…" into an index.html served under a prefix and every
  // asset 404s.
  const legitimate: Array<[string, string]> = [
    ["", "/"],
    ["/", "/"],
    ["/chat", "/chat"],
    ["chat", "/chat"],
    ["/chat/", "/chat"],
    [" /chat/ ", "/chat"],
    ["/tools/chat", "/tools/chat"],
    ["/__mockup", "/__mockup"],
    ["/v1.0", "/v1.0"],
    ["/chat-followupper", "/chat-followupper"],
    ["/a_b~c.d-e", "/a_b~c.d-e"],
  ];
  for (const [raw, expected] of legitimate) {
    assert.equal(normalizeBasePath(raw), expected, `input ${JSON.stringify(raw)}`);
  }
});

test("DARK: with no base configured every resolved value is today's literal", () => {
  for (const raw of ["", "/"]) {
    const r = createPathResolvers(raw);
    assert.equal(r.BASE_PATH, "/");
    assert.equal(r.PREFIX, "");
    assert.equal(r.API_BASE_PATH, "/api");
    assert.equal(r.COOKIE_PATH, "/");
    assert.equal(r.appPath("/"), "/");
    assert.equal(r.appPath("/login"), "/login");
    assert.equal(r.appPath("/followup/whatsapp"), "/followup/whatsapp");
    assert.equal(r.appPath("/prospects"), "/prospects");
    assert.equal(r.apiPath("/auth/me"), "/api/auth/me");
    assert.equal(r.apiPath("/auth/logout"), "/api/auth/logout");
    assert.equal(r.apiPath("/healthz"), "/api/healthz");
    assert.equal(r.apiPath("/auth/google/start"), "/api/auth/google/start");
    assert.equal(r.apiPath("/auth/google/callback"), "/api/auth/google/callback");
    assert.equal(r.apiPath("/followups/open/7"), "/api/followups/open/7");
  }
});

test("LIT: under /chat every resolved value carries the prefix exactly once", () => {
  const r = createPathResolvers("/chat/");
  assert.equal(r.BASE_PATH, "/chat");
  assert.equal(r.PREFIX, "/chat");
  assert.equal(r.API_BASE_PATH, "/chat/api");
  assert.equal(r.appPath("/"), "/chat");
  assert.equal(r.appPath("/login"), "/chat/login");
  assert.equal(r.appPath("/followup/whatsapp"), "/chat/followup/whatsapp");
  assert.equal(r.appPath("/prospects"), "/chat/prospects");
  assert.equal(r.apiPath("/auth/me"), "/chat/api/auth/me");
  assert.equal(r.apiPath("/auth/logout"), "/chat/api/auth/logout");
  assert.equal(r.apiPath("/auth/google/callback"), "/chat/api/auth/google/callback");
  assert.equal(r.apiPath("/followups/open/7"), "/chat/api/followups/open/7");
});

test("the cookie scope is exactly the base, never wider", () => {
  assert.equal(createPathResolvers("/").COOKIE_PATH, "/");
  assert.equal(createPathResolvers("/chat").COOKIE_PATH, "/chat");
  assert.equal(createPathResolvers("/chat/").COOKIE_PATH, "/chat");
  assert.equal(createPathResolvers("/tools/chat").COOKIE_PATH, "/tools/chat");
  // A cookie at "/chat" is sent to /chat and /chat/* and nothing else — RFC
  // 6265 path-match requires the next character to be "/". A trailing-slash
  // scope ("/chat/") would instead miss the bare "/chat" request.
  assert.ok(!createPathResolvers("/chat").COOKIE_PATH.endsWith("/"));
});

test("paths without a leading slash are joined, not concatenated", () => {
  const root = createPathResolvers("/");
  assert.equal(root.appPath("login"), "/login");
  assert.equal(root.apiPath("auth/me"), "/api/auth/me");
  const lit = createPathResolvers("/chat");
  assert.equal(lit.appPath("login"), "/chat/login");
  assert.equal(lit.apiPath("auth/me"), "/chat/api/auth/me");
});

test("no resolved path ever contains a doubled slash", () => {
  for (const base of ["", "/", "/chat", "chat/", "//chat//", "/tools/chat/"]) {
    const r = createPathResolvers(base);
    for (const p of ["/", "/login", "login", "/a/b/c", "/api"]) {
      assert.ok(!r.appPath(p).includes("//"), `appPath(${p}) @ ${base}`);
      assert.ok(!r.apiPath(p).includes("//"), `apiPath(${p}) @ ${base}`);
    }
    assert.ok(!r.API_BASE_PATH.includes("//"));
    assert.ok(!r.COOKIE_PATH.includes("//"));
  }
});

test("stripPrefix: a public URL that already carries the prefix is not doubled", () => {
  const lit = createPathResolvers("/chat");
  // The exact shape Bundle 2's cutover uses.
  assert.equal(
    lit.stripPrefix("https://tools.mobupps.net/chat"),
    "https://tools.mobupps.net",
  );
  assert.equal(
    lit.stripPrefix("https://tools.mobupps.net/chat/"),
    "https://tools.mobupps.net",
  );
  // An origin-only public URL is left alone, so both spellings work.
  assert.equal(
    lit.stripPrefix("https://tools.mobupps.net"),
    "https://tools.mobupps.net",
  );
  // Composition is what actually matters: exactly one prefix, either way.
  for (const configured of [
    "https://tools.mobupps.net/chat",
    "https://tools.mobupps.net",
  ]) {
    const origin = lit.stripPrefix(configured);
    assert.equal(
      `${origin}${lit.apiPath("/followups/open/7")}`,
      "https://tools.mobupps.net/chat/api/followups/open/7",
    );
    assert.equal(
      `${origin}${lit.appPath("/followup/whatsapp")}`,
      "https://tools.mobupps.net/chat/followup/whatsapp",
    );
  }
});

test("DARK: stripPrefix is the identity, so today's digest links are untouched", () => {
  const root = createPathResolvers("/");
  const url = "https://chat-followuper.replit.app";
  assert.equal(root.stripPrefix(url), url);
  assert.equal(
    `${root.stripPrefix(url)}${root.apiPath("/followups/open/7")}`,
    "https://chat-followuper.replit.app/api/followups/open/7",
  );
  assert.equal(
    `${root.stripPrefix(url)}${root.appPath("/followup/whatsapp")}`,
    "https://chat-followuper.replit.app/followup/whatsapp",
  );
  // A trailing slash on the configured URL must not be eaten at the root
  // base, because Bundle 1 already normalizes that upstream and this
  // function must stay a no-op when there is no prefix.
  assert.equal(root.stripPrefix("https://x.test/"), "https://x.test/");
});

test("stripPrefix only strips a genuine path segment, not a lookalike suffix", () => {
  const lit = createPathResolvers("/chat");
  // "…/livechat" ends with "chat" but not with the "/chat" segment.
  assert.equal(lit.stripPrefix("https://x.test/livechat"), "https://x.test/livechat");
});

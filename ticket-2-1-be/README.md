# Ticket 2.1-BE — URL resolver service

First backend ticket of Phase 2. Adds `POST /api/prospector/resolve-urls` — the entry point for the new Prospect flow. Takes a heterogeneous list of URLs (Play Store / App Store / website), returns a uniform brand-domain shape per URL, ready to feed Apollo's `q_organization_domains_list` filter in 2.2-BE.

## Scope

**One endpoint**: `POST /api/prospector/resolve-urls`

| Detail | Value |
|---|---|
| Body | `{ urls: string[] }` (1-50, each ≤ 2000 chars) |
| Response | `{ resolved: ResolvedUrl[] }` — same length and order as input |
| Auth | Required (session cookie) |
| Cost | $0 (no Apollo, no Anthropic — just iTunes API + Play Store HTML) |
| Concurrency | 5 simultaneous URLs per batch |
| Per-URL timeout | 8 seconds |

**ResolvedUrl shape**:

```ts
{
  url: string;          // unmodified input
  type: "play_store" | "app_store" | "website" | "unknown";
  brand: string | null;       // best-effort brand/developer name
  appName: string | null;     // app stores only
  domain: string | null;      // canonical (lowercase, www-stripped)
  country: string | null;     // ISO 2-letter if detectable
  error: string | null;       // null on success
}
```

## How each URL type resolves

**App Store**: extracts numeric app ID from URL path, calls iTunes Lookup API (`itunes.apple.com/lookup?id=...`). Free, no auth, JSON, 15+ years of API stability. Fields: `trackName` → appName, `sellerName` (or `artistName`) → brand, `sellerUrl` → domain, country from URL path.

**Play Store**: scrapes the HTML details page, extracts JSON-LD structured data (`<script type="application/ld+json">`). Falls back to `<title>` parsing. Domain is left null because Play Store's developer-website link is unreliable to extract — 2.2-BE looks up domain via Apollo org-search-by-name when Play Store entries appear.

**Website**: pure URL parsing, no network. Strips www, lowercases, rejects IPs and localhost. Brand is the capitalized first segment (heuristic; user can edit before discovery).

**Unknown**: invalid URL or unparseable input. Surfaces as `{type: "unknown", error: "..."}` in the response — the batch never fails because of one bad input.

## Files

```
ticket-2-1-be/
├── apply.sh                                    # 6-step orchestrator
├── README.md
├── new-files/
│   ├── artifacts/api-server/src/
│   │   ├── services/urlResolver.ts             # pure functions, fetcher injectable
│   │   └── routes/prospector.ts                # route handler + concurrency + audit log
│   └── tests/
│       ├── README.md                           # how to run the integration test
│       └── integration-2-1-be-resolve-urls.mjs # ~22 assertions across 6 groups
├── patches/
│   ├── patch-action-types.mjs                  # adds prospectorUrlsResolved
│   └── patch-routes-index.mjs                  # mounts /api/prospector/* router
└── docs/
    └── manual-test-2-1-be.md                   # network-dependent paths against real URLs
```

## Audit (Option A v1.1, 1 round, 7 passes)

| Pass | Status | Notes |
|---|---|---|
| 1a. Patch code structure | NONE | Both .mjs patches: pre-check, fail-loud, atomic write, evidence-counted, idempotent. Node `--check` syntax pass. |
| 1b. Anchor validity vs live file | NONE | Both patches dry-run applied to mirror copies of the live files (`/tmp/dryrun/...`). `patch-action-types.mjs` lands `prospectorUrlsResolved` between `apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",` (mirror line 76) and `} as const;` (line 78) ✓. **`patch-routes-index.mjs` was re-anchored from `prospectsRouter` (BE-2) to `apolloRouter` during this audit.** Reason: the source mirror does not contain a `prospectsRouter` import — anchoring on `apolloRouter` removes the patch's dependency on BE-2 mirror sync state and makes it verifiable against any consistent snapshot of the file. `apolloRouter` import is at mirror line 6, mount at line 14, both verified verbatim. After re-anchoring, dry-run apply + idempotent re-run both pass with `[APPLY] / [APPLY] / [DONE]` then `[SKIP] / [SKIP] / [NOOP]`. Mount order ends up apollo → prospector; `router.use` order does not affect routing because each router carries a unique URL prefix. |
| 2. Type safety + braces | NONE | Both .ts files balanced (52/52, 30/30). Test .mjs balanced (78/78). No `any`. One `as ItunesLookupResponse` narrowing of `unknown` from `res.json()` (interface defined inline) — acceptable. |
| 3. Cross-tenant safety | NONE | `requireAuth` middleware. `req.user!.id` used for action_log userId. No user-scoped DB queries other than the audit log insert (which always carries userId). No cross-user data exposure path. |
| 4. Defect-log adherence | LOW | Defect #8 (test session-cookie should `import` from `lib/session.ts`, not free-hand HMAC) — deferred. The free-hand HMAC matches `lib/session.ts` exactly: cookie name `cf_session`, payload `{userId, email, exp}` with `exp` in UNIX SECONDS. Documented in test header. Migrating to import depends on shipping a tests workspace package, out of scope here. |
| 5. Migration safety | NONE | New endpoint at distinct path prefix (no overlap with `/api/prospects`, `/api/apollo`). ACTION_TYPES enum addition is additive (backwards compatible). No schema changes. No breaking changes to existing endpoints. |
| 6. Naming + path consistency | NONE | Route file `prospector.ts` mirrors `prospects.ts` / `apollo.ts`. Endpoint kebab-case (`/resolve-urls`) matches `/search-org`. Action type `prospector.urls_resolved` (snake_case after dot) matches `seeder.org_search`. Service `urlResolver.ts` (camelCase) matches existing services. |
| 7. Documentation | NONE | README has scope, file inventory, audit, defect status. `tests/README.md` documents env vars and pass bar. `docs/manual-test-2-1-be.md` covers App Store + Play Store + website + mixed batch + performance + audit log + failure paths against real URLs. apply.sh prints clear next steps. |

**Verdict**: 0 HIGH, 0 MEDIUM, 1 LOW. **Ships.**

The one LOW item is documented and accepted:
- Pass 4: free-hand HMAC matches lib/session.ts exactly; migrating to `import` is a future tests-package ticket (defect #8).

## Defect-log status

| # | Defect | Status |
|---|---|---|
| 1 | BASE_URL default localhost:80 | ✅ Test uses this default |
| 2 | Use pg from @workspace/db | ✅ Test imports `Client` from `pg` |
| 3 | Test fixtures phone-unique | N/A (no phones in this test) |
| 4 | Tests/README.md env vars | ✅ tests/README.md documents `DATABASE_URL`, `SESSION_SECRET`, `BASE_URL` |
| 5 | Test fixtures match server | ✅ Validated against `lib/session.ts` actual shape (`cf_session`, `{userId, email, exp}` with `exp` in UNIX seconds) |
| 6 | pnpm add -D -w for tests | ✅ pg already added in BE-2 |
| 7 | Backend bundle workflow restart | ✅ apply.sh output explicitly notes Replit Stop+Run on api-server workflow |
| 8 | Test session-cookie import vs free-hand | ⚠️ Free-hand (LOW per audit) — deferred |
| 9 | Drizzle wraps driver errors | N/A (action_logs insert can't conflict; failure is swallowed by try/catch) |
| 10 | PATCH /api/prospects firstMessageBody | N/A (different endpoint) |

No new defects introduced.

## Next

After 2.1-BE goes green:

- **2.2-BE — Discovery endpoint**. Takes the resolved URLs (or just brand+domain pairs) plus user-supplied filters (titles, seniorities), runs Apollo `mixed_people/api_search` per company filtered to `has_direct_phone === "Yes"`, returns a flat candidate list. This is where the real user value of 2.1 + 2.2 lands.

- **2.3-FE — Prospect: WhatsApp page**. Wires the placeholder shipped in 2.0-FE to both 2.1 and 2.2. URL input → resolve → discover → multi-select grid → bulk action.

2.2-BE can ship in parallel with manual-test work on 2.1; 2.3-FE waits on both.

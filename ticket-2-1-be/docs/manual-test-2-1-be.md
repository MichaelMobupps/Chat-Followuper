# Manual test — Ticket 2.1-BE (URL resolver)

The integration test (auto) covers auth, validation, website resolver (URL parsing only), invalid-URL handling, order preservation, and action_log writing. This doc covers the **network-dependent paths** (App Store via iTunes Lookup API, Play Store via HTML scrape) against real URLs.

No spend. No Apollo. Just HTTP fetches against public app-store endpoints.

## Pre-flight

- [ ] `apply.sh` exited 0.
- [ ] api-server workflow restarted (Replit UI: Stop then Run on the api-server workflow).
- [ ] Integration test passed: `node /tmp/integration-2-1-be-resolve-urls.mjs` → `[PASS]`.
- [ ] You're signed in. Copy your session cookie from browser DevTools (Application → Cookies → `cf_session`).

## Setup

```bash
export BASE_URL="${BASE_URL:-http://localhost:80}"
export COOKIE='cf_session=<paste-your-session-cookie-here>'
```

## Response shape (what to expect)

Every `resolved[]` entry has the same shape regardless of input type:

```ts
{
  url: string,                                              // unmodified input
  type: "play_store" | "app_store" | "website" | "unknown", // host classification
  brand: string | null,                                     // best-effort brand/developer name
  appName: string | null,                                   // app stores only
  domain: string | null,                                    // canonical (lowercase, www-stripped)
  country: string | null,                                   // ISO 2-letter when detectable
  error: string | null,                                     // null on success
}
```

## App Store (iTunes Lookup API)

Probo iOS:

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["https://apps.apple.com/in/app/probo-opinion-trading/id1564443524"]}' \
  | python3 -m json.tool
```

Expected:

- `resolved[0].type === "app_store"`
- `resolved[0].brand` non-null (e.g. `"Probo Media Technologies Pvt. Ltd."` from `sellerName`)
- `resolved[0].appName` contains `"Probo"`
- `resolved[0].domain === "probo.in"` (canonicalized from `sellerUrl`)
- `resolved[0].country === "IN"` (extracted from `/in/` in URL path)
- `resolved[0].error === null`

Edge — non-existent app ID:

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["https://apps.apple.com/us/app/foo/id99999999999999"]}' \
  | python3 -m json.tool
```

Expected: `resolved[0].error` is a string like `"No app found for this ID"`.

## Play Store (HTML scrape)

Probo Android:

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["https://play.google.com/store/apps/details?id=com.probo.opinion"]}' \
  | python3 -m json.tool
```

Expected:

- `resolved[0].type === "play_store"`
- `resolved[0].brand` non-null (developer name from JSON-LD `author.name` or fallback)
- `resolved[0].appName` contains `"Probo"`
- `resolved[0].domain === null` (Play Store doesn't reliably expose developer URL — the 2.2-BE discovery endpoint resolves Play Store entries to a domain via Apollo org-search-by-name)
- `resolved[0].country === null` (no `gl=` in URL; if you add `&gl=IN`, country becomes `"IN"`)

Edge — non-existent package:

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["https://play.google.com/store/apps/details?id=com.nonexistent.zzz12345"]}' \
  | python3 -m json.tool
```

Expected: graceful failure — either `error: "Play Store returned 404"` or `type: "play_store"` with null `brand` and `appName`. No 5xx from our api-server.

## Website (URL parsing only)

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["https://www.probo.in/some/page"]}' \
  | python3 -m json.tool
```

Expected:

- `resolved[0].type === "website"`
- `resolved[0].domain === "probo.in"` (www stripped)
- `resolved[0].brand === "Probo"` (capitalized first segment of domain — heuristic; user can edit)
- No `appName`, no `country`, no `error`.

## Mixed batch (the realistic case)

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{
    "urls": [
      "https://apps.apple.com/in/app/probo-opinion-trading/id1564443524",
      "https://play.google.com/store/apps/details?id=com.probo.opinion",
      "https://probo.in",
      "not-a-url",
      "https://example.com"
    ]
  }' \
  | python3 -m json.tool
```

Expected:

- 5 entries in `resolved`, **same order as input**.
- entry 0: `type: "app_store"`, brand ≈ "Probo Media...", domain "probo.in", country "IN".
- entry 1: `type: "play_store"`, brand ≈ "Probo Media...", domain null, country null.
- entry 2: `type: "website"`, domain "probo.in", brand "Probo".
- entry 3: `type: "unknown"` with `error` set (or `type: "website"` with normalized form — either is acceptable for "not-a-url").
- entry 4: `type: "website"`, domain "example.com", brand "Example".

## Performance

A 25-URL batch:

```bash
curl -s -w "\n[time] %{time_total}s\n" "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": [...25 real competitor URLs...]}' \
  > /tmp/resolve_25.json
```

Expected: total under 15s (5 concurrent workers, 8s per-URL timeout). All 25 entries returned. No 5xx.

## Audit log

After running any successful batch:

```bash
psql "$DATABASE_URL" -c "
  SELECT action_type, action_status, duration_ms, metadata
  FROM action_logs
  WHERE action_type = 'prospector.urls_resolved'
  ORDER BY executed_at DESC LIMIT 5;
"
```

Expected: one row per batch with `metadata.batch_size`, `metadata.success_count`, `metadata.failure_count`, `metadata.type_counts`. Per-URL detail (the URLs themselves) is NOT logged — those may be sensitive prospect signals.

## Failure handling

Network timeout simulation — point at a blackholed IP (TEST-NET-1):

```bash
curl -s "$BASE_URL/api/prospector/resolve-urls" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"urls": ["http://10.255.255.1"]}' \
  | python3 -m json.tool
```

Expected: `resolved[0]` with `error` set (because canonicalizeHost rejects IP addresses for the website path; if you used `http://blackhole.invalid` instead, it'd reach the per-URL 8s timeout). Either way the request returns 200 in under 9s; the batch is not killed.

---

## If anything fails

Paste:
1. Which test (App Store / Play Store / website / mixed / performance / audit log / failure)
2. The curl request (with cookie redacted)
3. The full curl response body
4. Relevant rows from `action_logs`
5. Any 5xx output from the api-server workflow logs

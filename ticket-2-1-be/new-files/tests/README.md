# Tests for Ticket 2.1-BE

## Required environment variables

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection. Test creates and tears down its own users under email pattern `__t21_resolver_%@test.local`. | yes |
| `SESSION_SECRET` | Same value the api-server uses (≥16 chars). Test mints session cookies via HMAC matching `lib/session.ts`. | yes |
| `BASE_URL` | Override target. Defaults to `http://localhost:80`. | no |

## Run

```bash
# In Replit shell, with workspace env loaded:
cp ticket-2-1-be/new-files/tests/integration-2-1-be-resolve-urls.mjs /tmp/
node /tmp/integration-2-1-be-resolve-urls.mjs
```

## Pass bar

Exit code 0, final line `[PASS] all <N> assertions passed`. Wall clock 1-3 seconds.

## Coverage

6 test groups, ~22 assertions:

1. **Auth gating** — 401 without cookie, 401 with malformed cookie.
2. **Body validation** — empty array, >50 URLs, unknown top-level field (`zod .strict`), non-array `urls`, URL > 2000 chars, missing `urls` field.
3. **Website resolution** — single URL with brand/domain/null appName/null country/null error; www stripping; missing-scheme auto-prepend.
4. **Invalid URL handling** — unparseable URL surfaces as `type: "unknown"` with error string set; IP-address URL gets domain rejected. Batch never fails.
5. **Order preservation** — 3-URL batch returns results in input order with matching `url` field.
6. **Action log** — one row per batch, `action_type = 'prospector.urls_resolved'`, metadata has `batch_size`, `success_count`, `failure_count`, `type_counts`.

## What this test does NOT cover

- **Play Store / App Store parsers** — both fetch live HTTP from Google/Apple. Validated in `docs/manual-test-2-1-be.md` against real URLs. The integration test stays network-free for app-store hosts so it can run in any sandbox.
- **Real network timeouts** — the per-URL 8s `AbortSignal.timeout` is exercised in the manual test by pointing at a blackholed IP.

## Test users

Email pattern: `__t21_resolver_<label>_<timestamp>_<random>@test.local`. Cleanup runs at start and end of the suite (idempotent, multi-run safe).

## Notes

The session-cookie minting is free-hand HMAC matching `lib/session.ts` exactly (cookie name `cf_session`, payload `{userId, email, exp}` with `exp` in UNIX seconds). Defect log #8 calls for migrating to `import` from `lib/session.ts` once a tests workspace package exists.

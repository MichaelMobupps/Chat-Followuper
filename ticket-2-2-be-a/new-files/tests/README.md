# Tests for Ticket 2.2-BE-A

## Required environment variables

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection. Test creates and tears down its own users under email pattern `__t22a_resolver_%@test.local`. | yes |
| `SESSION_SECRET` | Same value the api-server uses (≥16 chars). Test mints session cookies via HMAC matching `lib/session.ts`. | yes |
| `BASE_URL` | Override target. Defaults to `http://localhost:80`. | no |
| `SKIP_LLM_TESTS` | Set to `"1"` to skip tests 3 and 4 (which call the real Sonnet API). Auth + validation + cross-tenant still run. Use this for repeated CI runs to avoid LLM cost. | no |

The api-server itself also needs `ANTHROPIC_API_KEY` set in its environment for the `/resolve-company` endpoint to work. Without it, test 3 returns 502 and test 4 captures a failure row in action_logs.

## Run

```bash
# In Replit shell, with workspace env loaded:
cp ticket-2-2-be-a/new-files/tests/integration-2-2-be-a-resolve-company.mjs /tmp/
node /tmp/integration-2-2-be-a-resolve-company.mjs

# To skip LLM-cost tests:
SKIP_LLM_TESTS=1 node /tmp/integration-2-2-be-a-resolve-company.mjs
```

## Cost

A full run costs roughly $0.005-0.01 in Anthropic Sonnet credits (one disambiguation call against the Probo brand). Designed to be cheap enough that you can run it after every deploy without thinking about it.

For repeated CI / dev iteration, set `SKIP_LLM_TESTS=1`. That covers everything except the actual LLM behavior.

## Pass bar

Exit code 0, final line `[PASS] all <N> assertions passed`.
- Full run (LLM tests on): ~22 assertions, wall clock 5-12 seconds.
- Skipped run (LLM tests off): ~13 assertions, wall clock 1-2 seconds.

## Coverage

5 test groups:

1. **Auth gating** — 401 without cookie, 401 with malformed cookie.
2. **Body validation** — empty body, all-null trio, all-empty trio, unknown field (zod .strict), oversized description, wrong type. Verifies the zod `.refine()` block on the trio brand+appName+domain.
3. **Happy-path Sonnet** — real LLM call against Probo input. Verifies response shape (all fields present, correct types) and soft content checks (companyName mentions probo). [skipped if `SKIP_LLM_TESTS=1`]
4. **Action log shape** — after happy path, the action_logs row carries the right metadata: brand, resolved_company, llm_latency_ms, search_query_count, has_description=false. [skipped if `SKIP_LLM_TESTS=1`]
5. **Cross-tenant** — User A's request never logs under User B's user_id, even on validation failure.

## What this test does NOT cover

- Disambiguation correctness for tricky cases (Cash App→Block, Astrum→VK parent, Emma fintech vs mattress, etc.) — those are in `docs/manual-test-2-2-be-a.md` because asserting LLM content beyond "mentions probo" is fragile.
- LLM timeout (504) — hard to trigger reliably in a test. Manual eyeballing if a long Sonnet call triggers the 90s timeout.
- LLM failure (502) — same. Set `ANTHROPIC_API_KEY` to a bogus value temporarily to verify the 502 path manually.
- Non-Latin name post-processing — covered in manual test case 6.

## Test users

Email pattern: `__t22a_resolver_<label>_<timestamp>_<random>@test.local`. Cleanup at start and end of suite (idempotent, multi-run safe). Uses test prefix distinct from 2.1-BE (`__t21_resolver_`) so the two test suites don't step on each other.

## Notes

The session-cookie minting is free-hand HMAC matching `lib/session.ts` exactly (cookie name `cf_session`, payload `{userId, email, exp}` with `exp` in UNIX seconds). Defect log #8 calls for migrating to `import` from `lib/session.ts` once a tests workspace package exists.

The integration test uses Probo as the happy-path test case because:
1. It's a real Indian opinion-trading platform with stable Apollo/web presence (Sonnet has it in training).
2. We already verified Probo end-to-end in 2.1-BE manual test, so it's a known-good baseline.
3. Indian fintech + opinion-trading is distinctive enough that Sonnet won't confuse it with another Probo (e.g. there's no major Probo mattress company).

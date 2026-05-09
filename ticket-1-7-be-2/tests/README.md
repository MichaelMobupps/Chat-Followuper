# Tests for Ticket 1.7-BE-2

## Required environment variables

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string. The test creates and tears down its own users, prospects, campaigns, and followups under a dedicated email pattern (`__t172_prospects_%@test.local`), so cleanup is automatic. | yes |
| `SESSION_SECRET` | The same value the api-server uses. Must be at least 16 chars. The test mints session cookies via HMAC-SHA256 against this secret, matching `src/lib/session.ts`. | yes |
| `BASE_URL` | Override the test target. Defaults to `http://localhost:80` (the workspace proxy convention, not the api-server's direct PORT). | no |

## Run

```bash
# In the Replit shell, with workspace env loaded (DATABASE_URL, SESSION_SECRET):
node /tmp/integration-1-7-be-2-prospects.mjs
```

Or, if `/tmp/` was wiped by a Republish, re-stage from the bundle dir first:

```bash
cp ticket-1-7-be-2/tests/integration-1-7-be-2-prospects.mjs /tmp/
node /tmp/integration-1-7-be-2-prospects.mjs
```

## Pass bar

Exit code 0, final line `[PASS] all <N> assertions passed`. Wall clock 2-5 seconds. No live LLM or Apollo calls — all paths use either DB-only operations or HTTP requests against the local api-server.

## Coverage

10 step-groups across all 4 endpoints:
- Auth gating on every method
- POST happy path (minimal + full + with campaign)
- POST validation: missing phone, non-E.164 phone, invalid sourceMode, unknown system field, slackUserId rejection (Slack dropped per master plan), non-ISO country/language
- POST cross-user campaignId rejection
- POST duplicate phone (unique constraint)
- GET own + cross-user (404, no existence leak) + non-existent + malformed UUID
- PATCH name + notes, researchBrief set, researchBrief clear via null, phone immutable, cross-user, no-op (empty body), cross-user campaignId
- DELETE cascades to followups, cross-user 404, non-existent 404, action_log written

## Fixtures

The test inserts users with email pattern `__t172_prospects_<label>_<timestamp>@test.local`. The cleanup query at start and end deletes any user matching that pattern, which cascades to all owned data. Multi-run safe.

Phones use the `+91990000_2XX` block to avoid collision with the 1.7-backend test fixtures (`+91990000_1XX`) if both run against the same DB without cleanup.

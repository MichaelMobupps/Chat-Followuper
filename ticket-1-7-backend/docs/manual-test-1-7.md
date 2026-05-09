# Ticket 1.7 — Manual Test Walkthrough

This is the operator's post-deploy verification script. The dashboard frontend
is deferred to a follow-up session, so the manual walkthrough here covers the
**backend endpoints only**, exercised via `curl` against the deployed URL.

For the full end-to-end seeder UI walkthrough (steps 1–10 in the master plan),
re-run this checklist after the dashboard half of 1.7 ships.

---

## Pre-flight

- Confirm Replit deployment is live: `curl https://<your-repl-url>/api/health`
  returns 200.
- Confirm `SESSION_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APOLLO_API_KEY`
  are set in Replit Secrets.
- Authenticate via the existing Google OAuth flow in the dashboard so a session
  cookie is set in the browser. Copy the `cf_session` cookie value from
  DevTools → Application → Cookies.

Set environment variables for the rest of the walkthrough:

```bash
export REPL_URL="https://<your-repl-url>"
export COOKIE="cf_session=<paste-from-devtools>"
```

---

## Test 1 — Create a campaign

```bash
curl -sS -X POST "$REPL_URL/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{
    "name": "EMEA Fintech Pilot",
    "description": "Q3 outreach to European fintechs",
    "defaultChannel": "whatsapp",
    "defaultLanguage": "en",
    "defaultCountry": "GB"
  }' | jq .
```

**Expected:** 201, `campaign.id` returned, `defaultChannel = "whatsapp"`.

Save the returned id:

```bash
export CAMPAIGN_ID="<paste-id-from-response>"
```

---

## Test 2 — List campaigns

```bash
curl -sS "$REPL_URL/api/campaigns" -H "Cookie: $COOKIE" | jq .
```

**Expected:** 200, `campaigns` array contains the just-created one.

---

## Test 3 — Detail with prospect count

```bash
curl -sS "$REPL_URL/api/campaigns/$CAMPAIGN_ID" -H "Cookie: $COOKIE" | jq .
```

**Expected:** 200, `prospectCount: 0`.

---

## Test 4 — Update fields

```bash
curl -sS -X PATCH "$REPL_URL/api/campaigns/$CAMPAIGN_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{ "name": "EMEA Fintech Pilot (renamed)", "defaultLanguage": "fr" }' | jq .
```

**Expected:** 200, name updated, language is `fr`, other fields preserved.

---

## Test 5 — Archive / unarchive

```bash
curl -sS -X POST "$REPL_URL/api/campaigns/$CAMPAIGN_ID/archive" \
  -H "Cookie: $COOKIE" | jq .
```

**Expected:** 200, `archivedAt` populated.

```bash
curl -sS "$REPL_URL/api/campaigns" -H "Cookie: $COOKIE" | jq '.campaigns | length'
curl -sS "$REPL_URL/api/campaigns?includeArchived=true" -H "Cookie: $COOKIE" | jq '.campaigns | length'
```

**Expected:** the count without `includeArchived` is 1 lower than with it.

```bash
curl -sS -X POST "$REPL_URL/api/campaigns/$CAMPAIGN_ID/unarchive" \
  -H "Cookie: $COOKIE" | jq .
```

**Expected:** 200, `archivedAt: null`.

---

## Test 6 — Validation rejects bad input

```bash
curl -sS -X POST "$REPL_URL/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{ "name": "", "defaultLanguage": "english" }' -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 400, response includes `issues` array.

```bash
curl -sS -X POST "$REPL_URL/api/campaigns" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{ "name": "test", "defaultChannel": "slack" }' -w "\nHTTP %{http_code}\n"
```

**Expected:** HTTP 400 (Slack is rejected per master plan decision log #5).

---

## Test 7 — Generate first message (paid)

This call costs roughly **$0.10–0.20** in Anthropic spend. Skip if you've
already verified via the integration test with `RUN_LIVE_ANTHROPIC=1`.

You need a prospect with a populated `researchBrief`. The seeder UI doesn't
exist yet, so either:

- Use a prospect that was researched via an earlier session, or
- Insert a fixture directly via the Replit DB shell (see `tests/integration-1-7-message.mjs`
  for the fixture shape).

```bash
export PROSPECT_ID="<id-of-prospect-with-researchBrief>"

curl -sS -X POST "$REPL_URL/api/prospects/$PROSPECT_ID/generate-message" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" -d '{}' | jq .
```

**Expected:** 200, response contains `subject`, `message` (non-empty), `costUsd > 0`,
`iterations` (1–3), `finalOverallScore`.

Verify the prospect now has `firstMessageBody`:

```bash
psql "$DATABASE_URL" -c "SELECT first_message_body, campaign_id FROM prospects WHERE id = '$PROSPECT_ID';"
```

**Expected:** `first_message_body` matches the response, `campaign_id` preserved.

---

## Test 8 — Delete cascades campaignId on prospects to NULL

If you've created prospects under `$CAMPAIGN_ID`, delete the campaign and
verify the prospects survived but lost the association:

```bash
curl -sS -X DELETE "$REPL_URL/api/campaigns/$CAMPAIGN_ID" -H "Cookie: $COOKIE" | jq .
```

```bash
psql "$DATABASE_URL" -c "SELECT id, campaign_id FROM prospects WHERE campaign_id = '$CAMPAIGN_ID';"
```

**Expected:** the second query returns zero rows (campaignId is NULL on those
prospects, not the campaign id). The prospects themselves still exist; check
with `SELECT count(*) FROM prospects WHERE user_id = ...`.

---

## Acceptance

All eight tests pass with the expected status codes and response shapes. The
backend half of Ticket 1.7 is then DONE; frontend half is the next session.

# Manual smoke tests — Ticket 1.7-BE-2

The integration test (`tests/integration-1-7-be-2-prospects.mjs`) covers all 50+ assertions automatically. This doc is for ad-hoc curl-based verification against the deployed Replit URL. You only need this if the integration test fails and you're debugging, or if you want to spot-check the live deployment with your real session cookie.

## Setup

```bash
# Get a fresh session cookie. Sign in via the dashboard at /login,
# then in DevTools → Application → Cookies → copy the `session` cookie.
SESSION="session=<paste-cookie-value-here>"
BASE="https://<your-replit-domain>"
```

## Tests

### Create (minimal)

```bash
curl -s -X POST "$BASE/api/prospects" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{"phone": "+919900099001", "sourceMode": "manual"}' | jq .
```
Expect: 201, returned object with `id`, `userId`, `phone`, `sourceMode: "manual"`, defaults populated.

### Create (full)

```bash
curl -s -X POST "$BASE/api/prospects" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{
    "phone": "+919900099002",
    "sourceMode": "apollo",
    "prospectName": "Manual Test Prospect",
    "company": "Test Co",
    "country": "IN",
    "language": "en",
    "researchBrief": { "primaryEvent": "first_loan" }
  }' | jq .
```
Expect: 201, all fields persisted.

### Read

```bash
PROSPECT_ID="<paste-id-from-above>"
curl -s "$BASE/api/prospects/$PROSPECT_ID" -H "Cookie: $SESSION" | jq .
```
Expect: 200, full row.

### Update

```bash
curl -s -X PATCH "$BASE/api/prospects/$PROSPECT_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{"prospectName": "Updated", "contextNotes": "Met at AdWorld"}' | jq .
```
Expect: 200, fields reflect updates, `phone` unchanged.

### Update — try to change phone (should fail)

```bash
curl -si -X PATCH "$BASE/api/prospects/$PROSPECT_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{"phone": "+12345678901"}'
```
Expect: 400 with Zod issues showing `phone` as unrecognized key.

### Update — clear a field via null

```bash
curl -s -X PATCH "$BASE/api/prospects/$PROSPECT_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{"researchBrief": null}' | jq .researchBrief
```
Expect: `null`.

### Cross-user 404

```bash
# With a different user's cookie or a random UUID:
curl -si "$BASE/api/prospects/00000000-0000-0000-0000-000000000000" \
  -H "Cookie: $SESSION"
```
Expect: 404.

### Duplicate phone

```bash
# Re-POST the same phone as the first create:
curl -si -X POST "$BASE/api/prospects" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{"phone": "+919900099001", "sourceMode": "manual"}'
```
Expect: 409, error code `duplicate_phone`.

### Delete

```bash
curl -s -X DELETE "$BASE/api/prospects/$PROSPECT_ID" -H "Cookie: $SESSION" | jq .
```
Expect: 200, body `{ "ok": true }`.

```bash
# Verify it's gone
curl -si "$BASE/api/prospects/$PROSPECT_ID" -H "Cookie: $SESSION"
```
Expect: 404.

## If anything fails

Paste back:
1. Full curl command (redact session cookie)
2. Status code + response body
3. Anything from the api-server logs in the Replit console

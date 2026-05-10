# Manual test — Ticket 2.3-BE-B

## 1. Smoke test the schema migration

After running `pnpm --filter @workspace/db push`:

```bash
psql "$DATABASE_URL" -c "\d prospects" | grep -E "phone\s+\|"
```

Expected: `phone | text |` (no `not null` after the type).

## 2. Smoke test the create-with-null-phone path

After restarting the api-server workflow:

```bash
# Need a valid cf_session cookie; easiest: log into the workspace
# dashboard in a browser, copy the cf_session value from devtools.

COOKIE='cf_session=<paste-here>'

curl -i -X POST "http://localhost:80/api/prospects" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{
    "sourceMode": "apollo",
    "apolloPersonId": "test_smoke_001",
    "prospectName": "Smoke Test",
    "country": "US",
    "language": "en"
  }'
```

Expected: `HTTP/1.1 201 Created` and a body with `"phone": null`.

## 3. Smoke test the rejection of orphan prospects

```bash
curl -i -X POST "http://localhost:80/api/prospects" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{
    "sourceMode": "manual",
    "prospectName": "Orphan Test"
  }'
```

Expected: `HTTP/1.1 400 Bad Request` with body containing
`"error": "invalid_body"` and an issue with `"path": "phone"` and a
message mentioning `apolloPersonId`.

## 4. Smoke test the whatsapp-link 409 path

After creating the smoke test prospect from step 2, save its id:

```bash
PROSPECT_ID='<the id from step 2 response>'

# First, give it a message body (direct DB write to skip the full
# generate-message flow):
psql "$DATABASE_URL" -c "
  UPDATE prospects
     SET first_message_body = 'test',
         first_message_channel = 'whatsapp'
   WHERE id = '$PROSPECT_ID';"

# Now hit whatsapp-link:
curl -i "http://localhost:80/api/prospects/$PROSPECT_ID/whatsapp-link" \
  -H "Cookie: $COOKIE"
```

Expected: `HTTP/1.1 409 Conflict` with body `{"error":"phone_reveal_pending"}`.

## 5. Smoke test webhook arrival promotion

```bash
# Simulate the webhook arrival (this is what the patch-3 code does in
# the production flow when Apollo POSTs back):
psql "$DATABASE_URL" -c "
  UPDATE prospects
     SET phone = COALESCE(phone, '+12025550100'),
         phone_number = '+12025550100',
         phone_reveal_status = 'arrived',
         phone_reveal_completed_at = now()
   WHERE id = '$PROSPECT_ID';"

# Verify both phone and phoneNumber are now set:
psql "$DATABASE_URL" -c "
  SELECT phone, phone_number, phone_reveal_status
    FROM prospects
   WHERE id = '$PROSPECT_ID';"

# Now hit whatsapp-link again:
curl -i "http://localhost:80/api/prospects/$PROSPECT_ID/whatsapp-link" \
  -H "Cookie: $COOKIE"
```

Expected:
- `psql` shows `phone = +12025550100`, `phone_number = +12025550100`,
  `phone_reveal_status = arrived`
- `curl` returns `HTTP/1.1 200 OK` with a `"url": "https://wa.me/12025550100?text=test"`
  (or `HTTP/1.1 422` with `geo_blocked` if US is in the geo-gate
  blocked list — environment-dependent).

## 6. Cleanup

Delete the smoke-test prospect:

```bash
curl -i -X DELETE "http://localhost:80/api/prospects/$PROSPECT_ID" \
  -H "Cookie: $COOKIE"
```

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Step 2 returns 500 with "null value in column phone violates not-null constraint" | Schema migration not applied | Run `pnpm --filter @workspace/db push` |
| Step 2 returns 201 but `phone` field is missing or `""` | Patch 2 (route) didn't apply correctly | Re-run apply.sh, verify evidence lines |
| Step 4 returns 200 instead of 409 | Patch 4 (whatsappLink) didn't apply | Re-run apply.sh; check the new dist is loaded (workflow restart) |
| Step 5 returns 409 still after psql UPDATE | Workflow didn't restart, OR existing route logic doesn't read the latest phone column | Restart the api-server workflow; re-test |
| Test T2 fails with "unrecognized_keys" on apolloPersonId | Patch 5 (FE types) and the route schema may have drifted | Confirm body keys match `baseProspectFields` in routes/prospects.ts |

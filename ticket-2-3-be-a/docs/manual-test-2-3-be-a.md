# Manual test — Ticket 2.3-BE-A

After `apply.sh` reports DONE and the Replit deployment has republished,
run this verification once.

## 1. Local test (against localhost dev server)

If running an api-server locally:

```bash
cd /home/runner/workspace
BASE_URL=http://localhost:80 \
  node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs
```

Expected: `Results: 14 pass / 0 fail` and exit code 0.

## 2. Production test (against deployed Replit URL)

```bash
cd /home/runner/workspace
BASE_URL=https://chat-followuper.replit.app \
  node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs
```

The test creates two throwaway test users via direct DB writes (using
`DATABASE_URL` from env), authenticates via `cf_session` HMAC cookies
(using `SESSION_SECRET` from env), fires real Apollo calls (using
`APOLLO_API_KEY` from env), then deletes its own users and action_logs
on cleanup.

## 3. Live curl probe (one-off, no test framework)

If you want to eyeball the response without running the test:

```bash
# Step 1: get a valid cf_session cookie. Easiest path: log into
# https://chat-followuper.replit.app in a browser, copy the cf_session
# cookie value from devtools.

COOKIE='cf_session=<paste-here>'

# Step 2: search for an org
curl -s -X POST "https://chat-followuper.replit.app/api/apollo/search-org" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"brand":"Probo"}' | jq '.orgs[0] | {id, name}'

# Step 3: search for people in that org and inspect new fields
ORG_ID='<paste-id-from-step-2>'
curl -s -X POST "https://chat-followuper.replit.app/api/apollo/search-people" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d "{\"orgId\":\"$ORG_ID\",\"titles\":[\"Marketing Manager\",\"Sales Manager\",\"Sales Rep\"]}" \
  | jq '.people[0:3] | map({id, firstName, lastNameObfuscated, title, directPhoneStatus, hasEmail})'
```

Expected output shape (example values):

```json
[
  {
    "id": "66f17eeb17af8400011a6169",
    "firstName": "Lindsay",
    "lastNameObfuscated": "Gi***l",
    "title": "Head of Growth & Marketing Director",
    "directPhoneStatus": "yes",
    "hasEmail": true
  },
  {
    "id": "...",
    "firstName": "Tiffany",
    "lastNameObfuscated": "St***k",
    "title": "Sales Rep and Marketing Manager",
    "directPhoneStatus": "maybe",
    "hasEmail": false
  }
]
```

Pass criteria:

- Every person has `directPhoneStatus` set to one of `"yes"`, `"maybe"`,
  `"no"`
- Every person has `hasEmail` as a boolean (`true` or `false`)
- Every person has `lastNameObfuscated` as a string-or-null
- At least one person has `directPhoneStatus === "yes"` (sanity check
  for orgs with active sales staff)

## 4. Failure modes and what to do

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `directPhoneStatus` is undefined on response | Patch did not apply, or build wasn't republished | Re-run `apply.sh`; verify Replit republish completed |
| All persons have `directPhoneStatus: "no"` | Apollo changed wording away from "Yes"/"Maybe" | Probe raw Apollo with `curl` (see "stranger probe" below); update `mapDirectPhoneStatus` |
| Test fails T1 (auth gate) | `SESSION_SECRET` env var doesn't match deployed value | Pull current secret from Replit Secrets; export locally |
| Test fails T3 (org search returns 0) | Apollo rate-limited, key missing, or test brand renamed | Try with a different brand: `curl ... -d '{"brand":"Stripe"}'` |
| Test fails T5 (no action_log row) | api-server failed to write audit row before responding | Check Replit logs for the request id; investigate before retrying |

## 5. Stranger probe (when in doubt about Apollo's wording)

If you suspect Apollo changed their `has_direct_phone` wording (e.g.,
all results coming back as `"no"` after a known-working state), run
this one-off probe to see the raw API response:

```bash
curl -s -X POST "https://api.apollo.io/api/v1/mixed_people/api_search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{"person_titles":["Marketing Manager","Sales Manager"],"page":1,"per_page":25}' \
  | jq '[.people[] | {first_name, has_direct_phone, has_email}]'
```

If the values look like `"Yes"` / `"Maybe: ..."` / absent — current
mapper handles them. If they look like something new (e.g., `true` /
`"available"` / `"AVAILABLE"`), update `mapDirectPhoneStatus` in
`artifacts/api-server/src/services/apollo.ts` to match.

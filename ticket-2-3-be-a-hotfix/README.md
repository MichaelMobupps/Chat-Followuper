# Ticket 2.3-BE-A HOTFIX — corrected mintSessionCookie

## What this fixes

The original 2.3-BE-A bundle's source-code patches applied cleanly and
production runtime is correct. However the integration test shipped
with the bundle had a stale `signSession` helper from the
pre-commit-0b308c9 convention:

| Stale convention (broken) | Current convention (correct) |
| --- | --- |
| `payload = userId` (raw string) | `payload = base64url(JSON.stringify({userId, email, exp}))` |
| `sig = HMAC(payload).digest("hex")` | `sig = base64url(HMAC(payloadB64).digest())` |
| 1 field required | 3 fields required (all type-checked) |

Result: every authenticated request in the test returned 401 because
the deployed `verifySession` rejected the malformed cookie. Test 1
passed (it asserts 401 without a cookie), tests 2-onwards failed.

## What this hotfix does

Single change: replace
`artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs`
with a corrected version that mirrors the deployed verifier exactly,
matching the convention used in the working 2.2-BE-C test that passed
prod 43/0.

## What this hotfix does NOT do

- **No source code changes.** `apollo.ts` (BE service) and
  `dashboard/src/lib/api/apollo.ts` (FE type mirror) are unchanged
  from the original 2.3-BE-A apply.sh and remain correct.
- **No typecheck / build / sync.** Test files are not part of the
  deployed runtime bundle.
- **No republish needed.** Production code is identical.

## Files in this bundle

```
ticket-2-3-be-a-hotfix/
├── apply.sh                                       # 2-step replace + syntax check
├── README.md                                      # this file
└── tests/
    └── integration-2-3-be-a-people-flags.mjs     # corrected test
```

## How to ship

```bash
# In the repo root, after unzipping the hotfix bundle:
chmod +x ticket-2-3-be-a-hotfix/apply.sh
ticket-2-3-be-a-hotfix/apply.sh
```

The script is idempotent — re-running just rewrites the same bytes.

## Verification — localhost first

```bash
cd /home/runner/workspace
BASE_URL=http://localhost:80 \
  node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs
```

Expected: `Results: 14 pass / 0 fail`, exit 0.

## Verification — production (only after localhost is green)

```bash
cd /home/runner/workspace
BASE_URL=https://chat-followuper.replit.app \
  node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs
```

Same expected output.

## Replit Agent prompt

```
Apply ticket-2-3-be-a-hotfix from the uploaded zip.

Steps:

1. Unzip ticket-2-3-be-a-hotfix.zip in the workspace root.
   Command: rm -rf ticket-2-3-be-a-hotfix && unzip -o ticket-2-3-be-a-hotfix.zip

2. Make the apply script executable.
   Command: chmod +x ticket-2-3-be-a-hotfix/apply.sh

3. Run the apply script and capture full stdout + stderr.
   Command: ticket-2-3-be-a-hotfix/apply.sh

   This script ONLY replaces the integration test file. It does not
   touch any source code, does not run typecheck/build, and does not
   require a republish.

4. After the script reports DONE, run the test against localhost:

   Command:
   cd /home/runner/workspace && \
   BASE_URL=http://localhost:80 \
     node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs

   Expected: "Results: 14 pass / 0 fail" and exit 0.

5. If localhost shows 14 pass / 0 fail, run against production:

   Command:
   cd /home/runner/workspace && \
   BASE_URL=https://chat-followuper.replit.app \
     node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs

6. Report back:
   - apply.sh exit code
   - apply.sh evidence lines
   - localhost test pass count
   - production test pass count (only if localhost is green)
   - If anything fails, paste the relevant 30 lines of output
```

## Postmortem note for the next ticket

To prevent this regression class permanently, the next small
infrastructure ticket I'd propose is **`tests-shared-session-helper`**:
extract `mintSessionCookie` + `base64UrlEncode` into
`artifacts/api-server/tests/lib/session.mjs` and have every integration
test import from there instead of duplicating the helpers. ~20 minutes
of work, eliminates the drift surface that produced this bug.

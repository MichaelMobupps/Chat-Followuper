# Ticket 2.3-BE-B — pending-reveal prospects (phone column nullable)

## Summary

Backend support for the bulk WhatsApp flow's "Maybe" path: prospects
created from Apollo's `has_direct_phone: "Maybe"` can now be persisted
with `phone=null`, then promoted to a contactable phone once the async
webhook lands.

The schema and webhook plumbing for async phone reveal already exist
(Ticket 1.5b shipped `phoneRevealStatus`, `phoneNumber`,
`phoneRevealCorrelationId`, the webhook router, the HMAC verifier).
This ticket fixes one structural gap: `phone NOT NULL` blocked the
"create prospect first, request phone reveal second" pattern that the
bulk flow needs.

## What changes

| # | File | Change |
| --- | --- | --- |
| 1 | `lib/db/src/schema/prospects.ts` | Drop `notNull()` from `phone` |
| 2 | `artifacts/api-server/src/routes/prospects.ts` | Phone optional+nullable in Zod schema; `superRefine` requires `apolloPersonId` when phone is absent (anti-orphan check) |
| 3 | `artifacts/api-server/src/services/apollo.ts` | Webhook arrival promotes `phoneNumber → phone` via COALESCE — backwards compatible |
| 4 | `artifacts/api-server/src/routes/whatsappLink.ts` | Returns `409 phone_reveal_pending` when `phone` is null |
| 5 | `artifacts/dashboard/src/lib/api/prospects.ts` | FE type parity: `Prospect.phone: string \| null`; `CreateProspectInput.phone?: string` |

**No new endpoints. No new ACTION_TYPES. No new schema columns. No
breaking change to existing seeder flow** (single-prospect prospects
created with phone set continue to work unchanged — COALESCE leaves
their `phone` value alone on webhook arrival).

## How to ship

### Step 1 — apply code patches

```bash
chmod +x ticket-2-3-be-b/apply.sh
ticket-2-3-be-b/apply.sh
```

`apply.sh` does NOT mutate the DB. It applies code patches, runs
typecheck, builds the api-server, runs dashboard typecheck, syncs the
source-code mirror. Idempotent — safe to re-run.

### Step 2 — apply DB migration (LOCALHOST / workspace)

```bash
cd /home/runner/workspace
pnpm --filter @workspace/db push
```

This runs `ALTER TABLE prospects ALTER COLUMN phone DROP NOT NULL`.

### Step 3 — restart workspace api-server

Defect #7 reminder from 2.3-BE-A: code in dist is not enough — the
running process must reload to pick up the new bundle.

### Step 4 — run integration test against localhost

```bash
cd /home/runner/workspace
BASE_URL=http://localhost:80 \
  node artifacts/api-server/tests/integration-2-3-be-b-pending-prospect.mjs
```

Expected: `Results: 12 pass / 0 fail` (fewer if T6 hits the geo-gate
on US — that's not a failure, it's an environment-dependent skip).

### Step 5 — republish + apply DB migration to prod

After localhost is green:
1. Republish the Replit deployment.
2. From the Deployment shell, run `pnpm --filter @workspace/db push`
   (uses prod DATABASE_URL automatically), or temporarily export
   `DATABASE_URL=$PROD_DATABASE_URL` and run from workspace.
3. Verify: `psql "$PROD_DATABASE_URL" -c "\d prospects" | grep phone`
   — the `phone` column should NOT have `not null` next to it.

## Design choice: COALESCE on arrival, not column rename

The webhook handler currently writes only `phoneNumber` on the arrived
branch. Two ways to make pending prospects contactable:

1. **COALESCE** (chosen): `phone = COALESCE(prospect.phone, webhook.phone)`. Promotes only when phone was null. Seeder-flow prospects keep their original phone; bulk-flow prospects get the webhook value.
2. **Column rename**: drop `phoneNumber`, write directly to `phone`. Loses the audit trail showing exactly what Apollo returned (useful for investigating geo-blocked or no-match cases).

COALESCE preserves the audit trail, is one-line change, and is
backwards compatible. Picked this path.

## Idempotency

Each patch script:
- Counts the **new marker** (a distinctive substring of the new code that does not exist in the old)
- Counts the **old anchor** (the bytes being replaced)
- Branches:
  - marker > 0, anchor = 0 → `SKIP` (already applied)
  - marker = 0, anchor = 0 → `NOOP` (file in unexpected state — fail)
  - marker = 0, anchor = 1 → `APPLY`
  - anchor > 1 → `FAIL` (ambiguous match)
  - both > 0 → `FAIL` (partial state)

Re-running after a successful apply is a no-op. Re-running after a
partial failure picks up where it left off.

## Reversal

Code: revert the 5 patches by running with `git checkout -- <file>`
or restoring from the apply.sh's pre-patch state.

Schema: `ALTER TABLE prospects ALTER COLUMN phone SET NOT NULL`. Only
safe if no NULL phones exist:
```sql
SELECT count(*) FROM prospects WHERE phone IS NULL;
```

If non-zero, those pending-reveal prospects must be cleaned up first.

## Replit Agent prompt

```
Apply ticket-2-3-be-b from the uploaded zip. This is the backend
support for pending-reveal prospects (phone column becomes nullable).

Steps:

1. Unzip ticket-2-3-be-b.zip.
   Command: rm -rf ticket-2-3-be-b && unzip -o ticket-2-3-be-b.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-2-3-be-b/apply.sh

3. Run apply.sh and capture full stdout + stderr.
   Command: ticket-2-3-be-b/apply.sh

   This applies 5 code patches + typecheck + build. It does NOT touch
   the database. If exit non-zero, paste full output and stop.

4. After apply.sh exits 0, run the schema migration:
   Command: cd /home/runner/workspace && pnpm --filter @workspace/db push

   This runs ALTER TABLE prospects ALTER COLUMN phone DROP NOT NULL
   against the workspace dev DB. Capture the drizzle-kit output.

5. Restart the api-server workflow so the new dist is loaded
   (apply.sh built the dist; the running process must reload).

6. Run the integration test against localhost:
   Command:
   cd /home/runner/workspace && \
   BASE_URL=http://localhost:80 \
     node artifacts/api-server/tests/integration-2-3-be-b-pending-prospect.mjs

   Required env: DATABASE_URL, SESSION_SECRET (already in Replit Secrets).
   Expected: "Results: 12 pass / 0 fail" (or 11/0 if T6 hits geo-gate
   on US — non-fatal, the test logs that case clearly).

7. Report back:
   - apply.sh exit code + evidence lines
   - drizzle push output (any warnings or schema diff)
   - localhost test pass count + exit code
   - If anything fails, paste the relevant 30 lines of output

8. Do NOT push to prod or republish until I confirm the localhost
   results. Schema changes need explicit operator confirmation before
   touching prod.

Hammer-vs-nail rule: do not modify any source files yourself. The
patches are the only legitimate way to change the codebase.
```

## What this unblocks

After 2.3-BE-B ships and is verified, **2.3-FE** can be built. The
bulk WhatsApp page will:
1. Take URL paste/upload (Play, App Store, website)
2. Resolve URLs → search-org → search-people for each
3. Show flat multi-select grid with `directPhoneStatus` / `hasEmail` /
   `lastNameObfuscated` (from 2.3-BE-A)
4. Estimate credit cost: N×1 for "yes" + M×8 for "maybe"
5. On confirm: for "yes" people, sync reveal + create prospect; for
   "maybe" people, create pending prospect (this ticket) + request
   phone reveal; both paths run generate-message immediately on the
   Apollo data
6. DONE screen lists all created prospects; "yes" ones have
   live WhatsApp links, "maybe" ones show "phone reveal pending"
7. When the Apollo webhook lands later, "maybe" prospects auto-promote
   to contactable; SDR sees them in the prospects list (or a Mailgun
   reminder).

# Ticket 1.7-BE-2 — Prospects CRUD endpoints

Closes the backend gap that blocked 1.7-FE-B (the seeder flow): the api-server has zero routes that insert into `prospects`. Without `POST /api/prospects` and `PATCH /api/prospects/:id`, the seeder UI would 404 at the moment it tries to persist anything.

## Scope

Four routes added under `/api/prospects`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/prospects` | Create. Required: `phone` (E.164), `sourceMode` ("manual" / "apollo" / "csv"). All other fields optional incl. `researchBrief` (jsonb) and `campaignId` (FK to campaigns). |
| GET | `/api/prospects/:id` | Read own prospect. 404 on cross-user (no existence leak). |
| PATCH | `/api/prospects/:id` | Update editable fields. Phone is **immutable** (changing breaks cached whatsapp links and the unique-key relationship). System fields (firstMessage*, replied, followupPaused, phoneReveal*) are rejected. Send `null` to clear a field. |
| DELETE | `/api/prospects/:id` | Hard delete. Cascades to followups + conversations via FK. |

Out of scope (deferred to the Prospects-page ticket): `GET /api/prospects` (list with filters). 1.7-FE-B does not need a list — the seeder works one prospect at a time and the existing Prospects nav is still a placeholder.

## What this bundle changes

**One new file:**
- `artifacts/api-server/src/routes/prospects.ts` — 4 routes, Zod-validated, requireAuth-gated, action_logs entries on create/delete.

**Two patches:**
- `artifacts/api-server/src/routes/index.ts` — mount `prospectsRouter`.
- `lib/db/src/schema/action_logs.ts` — add `prospectDeleted: "prospect.deleted"` to `ACTION_TYPES`.

**No schema migration.** The `action_logs.action_type` column is `text`, not a Postgres enum — adding a new value to the TS-side `ACTION_TYPES` const requires no DB change. The existing `prospects.campaign_id` FK was already added by 1.7-backend (migration `0005_early_green_goblin.sql`).

## Conventions matched

- **Validation:** Zod with `.strict()` (matches 1.7-backend campaigns route). Unknown keys → 400. Slack-related fields rejected (decision log #5).
- **Auth:** `requireAuth` middleware + AND-ed `userId` filter on every query. 404 (not 403) on cross-user — no existence leak.
- **Error mapping:** 400 invalid body, 401 unauth, 404 not found / cross-user / malformed UUID, 409 duplicate phone (unique constraint).
- **Phone format:** E.164 (`^\+[1-9]\d{6,14}$`). Apollo returns this format and the geo-gate in `services/channels/whatsapp.ts` assumes it.
- **PATCH semantics:** field absent → don't update; field with value → update; field with `null` → clear. Phone is the only field that is hard-rejected (immutable).
- **Audit:** `action_logs` rows for `prospect.created` and `prospect.deleted`. Best-effort writes — audit-log failures don't fail the request.

## Bundle contents

```
ticket-1-7-be-2/
├── apply.sh                              # 6-step idempotent orchestrator
├── README.md                             # this file
├── new-files/
│   └── artifacts/api-server/src/routes/
│       └── prospects.ts                  # the new CRUD route file
├── patches/
│   ├── patch-routes-index.mjs            # mount the router
│   └── patch-action-types.mjs            # add prospectDeleted action type
├── tests/
│   ├── README.md                         # required env vars + run instructions
│   └── integration-1-7-be-2-prospects.mjs  # 50+ assertions, ~3s wall clock
└── docs/
    └── manual-test-1-7-be-2.md           # curl-based manual smoke tests
```

## How apply.sh runs

1. Copy `prospects.ts` to `artifacts/api-server/src/routes/`.
2. Patch `routes/index.ts` (anchored, idempotent, evidence-checked).
3. Patch `action_logs.ts` (anchored, idempotent, evidence-checked).
4. Root `pnpm run typecheck` (composite-aware — api-server depends on the patched `lib/db`).
5. `pnpm --filter @workspace/api-server run build` (mandatory before Republish).
6. Best-effort source-code mirror sync.
7. Stage the integration test at `/tmp/`.

After apply.sh: click Republish in the Replit UI, then run `node /tmp/integration-1-7-be-2-prospects.mjs`.

## Defect-log corrections baked in (compared to 1.7-backend's tests)

1. ✅ `BASE_URL` defaults to `http://localhost:80` (proxy convention).
2. ✅ Uses `pg` from `@workspace/db`'s installed driver — no `postgres` devDep.
3. ✅ All test phones are unique per call site; helpers don't hardcode.
4. ✅ Ships with `tests/README.md` documenting env vars + run command.
5. ✅ Fixtures (research_brief shape, etc.) match the actual `ProspectBrief` interface — no field-shape drift.

## What unblocks for 1.7-FE-B

After this ships, the seeder UI can:
- Create a draft prospect once the SDR has phone + minimal fields
- PATCH the brief after the SSE research stream finishes
- Attach the prospect to a campaign at create time or later via PATCH
- Delete an abandoned draft

The existing routes (`generateMessage`, `whatsapp-link`, `send-intent`, phone-reveal) all already work against an existing prospect, so once create/update exist, the full seeder flow has a backend.

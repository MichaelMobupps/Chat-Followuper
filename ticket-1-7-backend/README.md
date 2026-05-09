# Ticket 1.7 — Backend Half

This zip ships the **backend half** of Ticket 1.7 from the Chat Followuper master plan v2.

The frontend half (`artifacts/dashboard/src/...`) is deferred to a follow-up
session because the dashboard tree was not in the source-code review snapshot.

---

## What's in here

```
ticket-1-7-backend/
├── README.md                                     this file
├── apply.sh                                      idempotent orchestrator
├── new-files/
│   ├── lib/db/src/schema/campaigns.ts            new schema
│   └── artifacts/api-server/src/routes/
│       ├── campaigns.ts                          new CRUD route
│       └── generateMessage.ts                    new generate-message route
├── patches/
│   ├── patch-prospects-schema.mjs                add campaignId to prospects
│   ├── patch-schema-index.mjs                    add campaigns export
│   └── patch-routes-index.mjs                    mount new routers
├── tests/
│   ├── integration-1-7-campaigns.mjs             campaigns CRUD test
│   └── integration-1-7-message.mjs               generate-message test
└── docs/
    └── manual-test-1-7.md                        operator walkthrough
```

---

## What's shipped

### Schema

- New `campaigns` table:
  `(id, user_id, name, description, default_channel, default_sub_vertical,
   default_language, default_country, archived_at, created_at, updated_at)`
  with index on `(user_id, archived_at)`.
- New `prospects.campaign_id` column with `ON DELETE SET NULL` cascade.

### Routes

- `GET    /api/campaigns                       ` list non-archived (or all with `?includeArchived=true`)
- `GET    /api/campaigns/:id                   ` detail + prospectCount
- `POST   /api/campaigns                       ` create
- `PATCH  /api/campaigns/:id                   ` update fields
- `POST   /api/campaigns/:id/archive           ` soft-delete
- `POST   /api/campaigns/:id/unarchive         ` restore
- `DELETE /api/campaigns/:id                   ` hard-delete (cascades)
- `POST   /api/prospects/:id/generate-message  ` runs generator pipeline,
                                                 persists `firstMessageBody`,
                                                 increments `daily_usage`,
                                                 logs `seeder.message_generated`

All endpoints gated by `requireAuth` and AND-ed with `userId` to prevent
cross-user access (404 on cross-user, not 403 — does not leak existence).

Channel validation rejects `slack` (master plan decision log #5).

### Tests

- `integration-1-7-campaigns.mjs` — 16 assertions across CRUD, isolation,
  cascade, archive/unarchive, validation. No Anthropic spend.
- `integration-1-7-message.mjs` — non-live preconditions always run (auth,
  cross-user, missing-brief). Live call (~$0.10–0.20) opt-in via
  `RUN_LIVE_ANTHROPIC=1`.

Both tests connect to `DATABASE_URL` and mint a test session cookie using
`SESSION_SECRET`. They clean up after themselves.

---

## How to ship

From the Replit project root:

```bash
unzip -o ticket-1-7-backend.zip
bash ticket-1-7-backend/apply.sh
```

`apply.sh` runs:
1. Copy new files into place
2. Run anchored patches (idempotent; safe to rerun)
3. `pnpm --filter @workspace/db run generate` (Drizzle migration)
4. `pnpm --filter @workspace/db run migrate` (apply migration)
5. `pnpm --filter @workspace/api-server run typecheck`
6. `pnpm --filter @workspace/api-server run build` (mandatory before restart)
7. `bash scripts/sync-source-code.sh` (mirror)
8. Stage tests at `/tmp/`

After `apply.sh` completes, click **Republish** in Replit so the running
process picks up the new dist/. Then run the integration tests.

---

## Anti-patterns honored from the master plan

- Campaign delete cascades `prospects.campaignId` to NULL, not the prospects.
- Every endpoint enforces `userId` match.
- Every cross-user access returns 404 (does not leak existence).
- No PUT-style "replace whole resource"; PATCH updates only specified fields.
- No bulk archive/delete operation in this ticket; deferred per plan.
- Schema migration is purely additive (`CREATE TABLE` + `ADD COLUMN` +
  `CREATE INDEX`); no DROP, no ALTER TYPE, no NOT NULL on existing columns
  (Thread G).

---

## What's deferred

Frontend (next session, requires dashboard tree):
- `artifacts/dashboard/src/pages/seeder.tsx`
- `artifacts/dashboard/src/pages/campaigns.tsx`
- `artifacts/dashboard/src/pages/campaign-detail.tsx`
- `artifacts/dashboard/src/components/seeder/{ApolloPicker,ResearchProgress,BriefEditor,MessageReview,CampaignSelector}.tsx`
- `artifacts/dashboard/src/components/campaigns/{CampaignForm,CampaignCard}.tsx`
- `artifacts/dashboard/src/lib/{sse,api/campaigns,api/seeder}.ts`

Once the dashboard tree is in hand, the frontend half can be authored to
match the existing conventions (shadcn/ui imports, react-hook-form, routing).

# Ticket 1.7-FE-A — Campaigns CRUD frontend

Backend half of 1.7 shipped earlier (campaigns + generateMessage routes, both tests green). This bundle adds the user-facing Campaigns surface in `artifacts/dashboard/`.

## Scope

- Campaigns list page at `/campaigns` (active / archived tabs, create dialog, archive button per card)
- Campaign detail page at `/campaigns/:id` (edit, archive/unarchive, delete with confirmation, stats)
- New nav item "Campaigns" between Seeder and Prospects, megaphone icon
- API client + react-query hooks scoped to campaigns

## Out of scope (deferred to 1.7-FE-B)

- Seeder flow (Apollo picker, research SSE, brief editor, message review)
- Campaign selector inside the seeder flow
- Prospects-by-campaign filter in `/prospects`

## Architecture decisions

**β-pattern: thin fetch wrapper, not codegen.**
Codebase has two API conventions: `auth.ts`+`health.ts` use `@workspace/api-zod`+`@workspace/api-client-react` codegen, everything else uses inline TS types and direct fetch calls. This bundle follows the second (more common) pattern. New file: `dashboard/src/lib/api.ts` (a parallel `ApiError` to the one in api-client-react). Migration to a single shared codegen pattern is a separate architecture decision; this bundle stays consistent with the apollo-route majority.

**Slack channel intentionally absent.** Per master-plan decision log #5. The `CAMPAIGN_CHANNELS` enum in `lib/api/campaigns.ts` lists `whatsapp`, `telegram`, `teams`, `email` only.

## Bundle contents

```
ticket-1-7-fe-a/
├── apply.sh                                # 6-step idempotent orchestrator
├── README.md                               # this file
├── new-files/
│   ├── lib/
│   │   ├── api.ts                          # ApiError class + apiFetch helper
│   │   └── api/campaigns.ts                # campaign API functions + types
│   ├── hooks/
│   │   └── use-campaigns.ts                # 6 react-query hooks
│   ├── components/campaigns/
│   │   ├── CampaignCard.tsx                # list-item card
│   │   └── CampaignForm.tsx                # create/edit form (react-hook-form + zod)
│   └── pages/
│       ├── campaigns.tsx                   # list page
│       └── campaign-detail.tsx             # detail page
├── patches/
│   ├── patch-app-tsx.mjs                   # add CampaignsPage routes
│   └── patch-layout-tsx.mjs                # add Campaigns nav item
└── docs/
    └── manual-test-1-7-fe-a.md             # post-deploy checklist
```

## How apply.sh works

1. Copy 7 new files into `artifacts/dashboard/src/`.
2. Patch `App.tsx` (anchored, idempotent): adds two imports + two routes.
3. Patch `layout.tsx` (anchored, idempotent): adds `Megaphone` import + nav item.
4. Run **root** `pnpm run typecheck` (composite-aware — fixes the 1.7-backend hotfix lesson).
5. Build dashboard. Sets `PORT=5173` and `BASE_PATH=/` defaults so vite.config.ts evaluates.
6. Sync to `source-code/` mirror if `scripts/sync-source-code.sh` exists.

After apply.sh: click Republish in the Replit UI, then walk through `docs/manual-test-1-7-fe-a.md`.

## Test verification

This bundle ships with a manual test checklist instead of automated tests. Reasons:
- Frontend integration testing requires Playwright/Cypress, neither of which is currently installed in the dashboard.
- The backend routes exercised by these pages are already covered by `tests/integration-1-7-campaigns.mjs` (16 assertions, green).
- The UI is thin glue: forms, dialogs, react-query mutations. Adding a Playwright harness is a separate ticket worth doing, but doesn't gate this surface.

If you want automated UI tests next, that would be Ticket 0.x (test infra) and would also benefit from being reused for Today/Followups pages later.

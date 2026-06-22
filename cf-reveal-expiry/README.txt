Chat Followuper - Pending-reveal expiry feature (v2)
====================================================

Backend + dashboard. Stale Apollo phone reveals get a terminal "expired"
status so they leave the active "Phone pending" surface, both the list and the
detail page label them "Unreachable", and a late Apollo webhook can still
recover the phone.

v2 over v1 (from the godlike audit):
  A1 - build.mjs now emits the sweep, and the run command is corrected. v1
       shipped a sweep with no runnable entry (single esbuild entry, no tsx).
  A2 - pages/prospect-detail.tsx gains the expired status branch and badge
       entry. v1 missed this second consumer, which would have failed the
       dashboard typecheck gate.
  A4 - this bundle must run from the monorepo root (see RUN).

WHAT THIS BUNDLE CHANGES
  api-server (edited):
    src/routes/prospects.ts   status machine learns "phone-expired"
    src/services/apollo.ts    callback treats "expired" as a soft terminal
    build.mjs                 adds the sweep as a second esbuild entry
  api-server (new):
    src/services/phoneRevealSweep.ts   the idempotent sweep + env clamp
    src/scripts/sweepReveals.ts        entry, builds to dist/scripts/sweepReveals.mjs
  db package (edited, @workspace/db):
    schema/action_logs.ts     new apollo.phone_reveal_expired action type
    schema/prospects.ts       doc note for the "expired" status value
  dashboard (edited):
    src/lib/api/prospects.ts                               ProspectStatus union
    src/components/prospects-list/ProspectsListTable.tsx   badge config
    src/components/prospects-list/ProspectsListFilters.tsx filter option
    src/pages/prospect-detail.tsx                          computeStatus + badge

VERIFIED HERE
  All eleven edits matched the live api-server and dashboard files, applied,
  and re-ran as a clean no-op. The two db edits matched the review mirror and
  apply on your tree where that package lives. Typecheck was not run here
  (node_modules is not in the upload); your apply gates run it.

RUN
  1. Extract this bundle at your MONOREPO ROOT (the dir containing both
     artifacts/ and the @workspace/db package).
  2. Run: bash cf-reveal-expiry/apply.sh
  3. Confirm the typecheck and build gates pass.

  Set SKIP_BUILD=1 to apply and typecheck without building.

AFTER APPLY (separate steps)
  1. Point a Replit Scheduled Deployment at: node dist/scripts/sweepReveals.mjs
     on a daily cadence.
  2. Restart.
  3. Republish.

NOTES
  REVEAL_PENDING_MAX_AGE_HOURS controls the cutoff (default 72).
  If api-server typecheck reports apolloPhoneRevealExpired missing, rebuild
  @workspace/db so its new action type is visible to api-server.

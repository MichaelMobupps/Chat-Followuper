# Godlike Audit — TODO / Resume Checkpoint

**Companion to `LOG.md`.** LOG.md = the full narrative of what was done (Sessions 1–6).
This file = the short "what's the state and what's next" so any new session can resume cold
after an SSH drop. Keep it current: when you finish something, move it to DONE with a one-line
result; when you start something, note it under IN PROGRESS with the exact next step.

**Branch:** `audit/godlike-fixes` (main untouched at `e9ed33c`) · **Identity:** hwholestorm@gmail.com
**Green bar:** `pnpm run build` → exit 0 · `@workspace/db` tests → 3/3 · dev DB (heliumdb) at head.

---

## IN PROGRESS / OPEN

### 1. Production DB migration  ← the thing interrupted by the SSH drop (2026-07-04 ~18:11)
- **Why:** Replit's auto-generated deploy migration fails — its `action_logs_weekly_digest_week_uq`
  index used the wrong operator class (`text_ops` on a `uuid` column) → deploy rejected. So prod is
  behind dev and can't self-heal via Republish until that one statement is applied correctly by hand.
- **I cannot run this** — the workspace `DATABASE_URL` is the **dev** DB (heliumdb/helium). Production
  is only reachable via the **Replit SQL Console** (or a Republish). Needs the user to paste SQL there.
- **Unknown:** prod's actual current state — the `prod-state-check.sql` result was lost with the SSH
  session. Re-run it first to see what's already applied before applying anything.
- **Resume order (paste each into Replit SQL Console → Production DB, confirm no red error):**
  1. `prod-state-check.sql`   — READ ONLY. Tells you which objects already exist.
  2. `prod-migration-fix.sql` — removes duplicate rows so the new UNIQUE indexes can build (safe, re-runnable).
  3. `prod-bring-to-head.sql` — full idempotent migration (all guarded IF [NOT] EXISTS). *(Or run the 4
     `prod-batch-N-*.sql` files in order if the console chokes on the big one.)*
  4. Republish the app — with prod at head, Replit's generated migration finds nothing to do and skips
     the broken statement.
  - Narrowest possible fix if only the one index is missing: `prod-fix-just-the-broken-one.sql`.

## NEEDS A DECISION (not bugs — deferred on purpose, see LOG.md Sessions 4–6)
- **DB2** — encrypt `microsoft_refresh_token` / `slack_bot_token`. Columns are UNUSED today (Teams/Slack
  OAuth not built). Do it WHEN that feature ships; needs a KMS/app-key decision. User chose: leave until feature.
- **APO5 budget number** — default Apollo call budget = 80 (env `APOLLO_CALL_BUDGET`). One live Stripe run
  used ~14 calls, so 80 is ~5.7× headroom. Re-tune from real prod `apolloCallsConsumed` telemetry.

## POSSIBLE NEXT STEPS (once prod is at head — user's call)
- Merge `audit/godlike-fixes` → `main` (currently main is untouched at `e9ed33c`).
- Or open a PR for review before merge.

---

## FEATURE BACKLOG (requested 2026-07-04 — net-new work, not audit findings)

> **STATUS (2026-07-04):** ✅ All 5 read-only SCOPING passes DONE — findings appended under each item below.
> **USER DECISIONS (2026-07-04):** F-C Teams → **build Azure-free DEEP-LINK Teams (Path A)**. Build order →
> **start with F-E**, then sequence the rest. **BUILD ORDER: F-E → F-C(deep-link Teams) → F-B → F-A.**
> **STATUS (2026-07-08):** ✅ **F-E DONE** (commit `8c3f9bf`, chose Option A — batch-level company+product
> once, names optional; phone-only headerless paste supported; full-workspace build exit 0). **NEXT: F-C
> (deep-link Teams, Path A)** — see its section for the confirmed file targets. Commit per item; build green
> bar before moving on.
>
> **⚠ CANONICAL PATHS — resolve before ANY code:** The app is NOT in `godlike-audit/` (that dir holds only
> the audit SQL + logs). It lives in SIBLING dirs under `.../working_subv/`:
>   - Frontend: `artifacts/dashboard/src/`
>   - Backend: `artifacts/api-server/src/` + `lib/db/` — these are the REAL pnpm workspace packages
>     (per `pnpm-workspace.yaml`). `source-code/` is a STALE MIRROR (audit BUILD3) — do NOT edit it.
>   Some scoping agents cited `source-code/...` paths; treat those as line-number hints and re-map to
>   `artifacts/api-server/` before editing. Verify the canonical path for each file first.

> Each needs its own scoping pass before code. Order TBD with user.

### F-A. Add LinkedIn support (new channel)
- Add LinkedIn as a channel alongside whatsapp/telegram/teams/slack. Touches: `services/channels/`
  (new `linkedin.ts` adapter + registry `channels/index.ts`), `ChannelCode` type / `isChannelCode`,
  deep-link generation (LinkedIn message/profile URL — confirm what a prefillable LinkedIn URL even is;
  LinkedIn does NOT support message prefill like `wa.me`/`t.me?text=`, so likely profile-open + copy-to-clipboard
  fallback like CH5 did for Telegram), prospect identity column (`linkedin_url`/`linkedin_handle` + partial-unique
  index mirroring DB5), send-intent dispatch switch, frontend channel pickers/badges.
- **Scope first:** what identifier do we store, and what's the actual "open LinkedIn to this person" UX?
- **SCOPED (F-A findings) — wide but shallow; NO prefill deep link (clipboard-only, like Telegram CH5):**
  - **Storage already done:** `prospects.linkedin_url` exists (`lib/db/src/schema/prospects.ts:52`, since base migration). Field is
    already populated by prospect routes + Apollo reveal. **Missing:** the dedup partial-unique index →
    add `prospects_user_linkedin_unique` on `(user_id, linkedin_url) WHERE linkedin_url IS NOT NULL` in schema
    (`prospects.ts:138-149` block) + new migration `lib/db/drizzle/0016_*.sql` (mirror `0013_prospect_identity_unique.sql`) + `drizzle/meta/`.
  - **Type gate:** add `"linkedin"` to `ChannelCode` (`lib/channelRegister.ts:21`) + `isChannelCode` array (`:24-26`).
    The `ADAPTERS: Record<ChannelCode,…>` (`services/channels/index.ts:16-21`) then FAILS typecheck until a `linkedin:` entry
    is added — good forcing function. Add adapter `services/channels/linkedin.ts` (model on `telegram.ts`): `generateLink`
    returns bare profile URL (body NOT embeddable), `recordSendIntent` copied from `telegram.ts:99-190` + new
    `linkedin.send_intent` action type (`lib/db/src/schema/action_logs.ts:115`).
  - **Dispatch:** add `linkedin` branch to send-intent switch (`routes/whatsappLink.ts:182-192`) + `manualContactPrepare.ts`
    `resolveChannel`/`buildDeepLink` (`:52-72`, currently throws for non-wa/tg).
  - **~15 allowlists to extend (each independent):** routes — `prepareFirstMessage.ts:12`, `followups.ts:64`,
    `userExtras.ts:24`, `campaigns.ts:48`, `prospects.ts:82` + `:1104`, `testChannelLink.ts:14`; spec/codegen —
    `lib/api-spec/openapi.yaml:269/309/322` then regenerate `lib/api-zod`; FE unions — `lib/api/followups.ts:25-31`,
    `whatsapp.ts:38`, `manual-ingest.ts:16-17`, `prospects.ts:172`; FE label/icon `Record<Channel,…>` maps (won't compile
    till added) — `ChannelFollowupPage.tsx:78-88`, `today.tsx:58`, `AddManualContactDialog.tsx:59`, `ManualContactsSection.tsx:63`,
    `BulkAddDialog.tsx:78`.
  - **Clipboard-only send:** extend the CH5 `sendChannel === "telegram"` clipboard branch to include `linkedin` in BOTH
    send handlers — `today.tsx:227-235` (`handleSend`) and `ChannelFollowupPage.tsx:171-172` (`handleSendNext`). LinkedIn is
    STRICTLY clipboard (Telegram is best-effort). New `/followup/linkedin` route + page (`App.tsx`).
  - **Optional (message quality):** add `LINKEDIN_*` writer/critic prompt blocks in `channelRegister.ts:1245-1290` (falls
    through to `""` without them → generation won't crash but LinkedIn copy is undefined).

### F-B. Proper followups menu (control + visibility)
- Currently: no way to control how many followups are scheduled per person, and no way to see WHEN each
  followup is scheduled. Add: (a) per-prospect followup count/cadence control, (b) a view listing scheduled
  followups with their send dates/times (the schedule is in the `followups` table — stage/channel/scheduled time
  via `timingEngine`/`followupScheduler`), (c) surface Pushover account settings/config from within this menu
  (currently Pushover config lives elsewhere — `PushoverSettings.tsx`; user wants visibility from the followups menu).
- **Scope first:** read `followupScheduler.ts`, `timingEngine.ts`, `sequenceConfig.ts`, the followups page(s),
  and `PushoverSettings.tsx` to map current capability vs. the gap.
- **SCOPED (F-B findings):**
  - Live followups UI = `components/followup/ChannelFollowupPage.tsx` (rendered by `pages/followup/whatsapp.tsx`
    + `.../telegram.tsx`). Nav "Follow-ups" → `/followup/whatsapp`. `pages/followups.tsx` is a DEAD placeholder
    (routed at `App.tsx:43` but not in sidebar).
  - **(a) count/cadence control — PARTIAL, user-global only.** `users.maxFollowups` (default 3) + `users.stageTiming`
    (jsonb per-stage min/max days) drive it; editable in `SequenceConfigPanel.tsx:432-448` (a Sheet from the page
    header). Gaps: it's ONE global config (no per-prospect override — that'd be net-new column/table); **range
    mismatch** — config accepts maxFollowups 0–20 (`routes/sequenceConfig.ts:59`) but scheduler clamps 1–10
    (`followupScheduler.ts:62`) and stageTiming holds ≤10; **editing config does NOT re-seed already-scheduled
    prospects** (followups seeded once at first send in `scheduleFollowupsAfterFirstSend`).
  - **(b) see WHEN each followup sends — PARTIAL.** Data fully present: `followups.scheduledAt` (timestamptz NOT NULL)
    per stage; `GET /api/followups` already returns every stage row + `derived.nextScheduled` + `scheduledCount`.
    But UI shows only the SINGLE next send-time per prospect (`ChannelFollowupPage.tsx:600-606`); per-stage times
    only reachable one-at-a-time via `EditFollowupDialog.tsx`. Need: a multi-stage timeline/schedule view (data's there).
  - **(c) reach Pushover from followups menu — DOES NOT EXIST.** `SequenceConfigPanel.tsx:467-470` even has dead
    copy "configure under Accounts" with NO link. Fix: either link to `/accounts` or reuse `<PushoverSettings/>`
    in a followups Sheet/tab (+ the new quiet-hours/preferred-channel fields from F-D).
- **SCOPED (from F-D findings):** Pushover config today lives ONLY on the **Accounts page**
  (`artifacts/dashboard/src/pages/accounts.tsx:77` → `PushoverSettings.tsx`). It exposes ONLY the user key.
  The columns `pushover_quiet_hour_start/end` and `preferred_channel` (`lib/db/src/schema/users.ts:111-119`)
  have DB defaults but **NO API field and NO UI** — the PATCH schema (`routes/notificationSettings.ts:27-31`)
  accepts only `pushoverUserKey`. So "surface Pushover config from followups menu" = new PATCH fields
  (quiet hours + preferred channel) + new inputs, then mount/mirror into the followups menu.

### F-C. Add Teams (investigate requirements FIRST)
- User: "see what's required first." Ties directly to deferred **DB2** (Teams OAuth would introduce
  `microsoft_refresh_token` usage → then encryption + KMS decision becomes real). Teams adapter currently
  throws `ChannelNotImplementedError` (501) per CH4.
- **USER DECISION (2026-07-04):** "if we need to do anything in Azure i'd rather just remove teams entirely."
  → Path B (Graph send) is OUT (it needs Azure). **Path A (deep-link) needs NO Azure** — clarifying with user
  whether to build Azure-free deep-link Teams (same model as their existing WhatsApp/Telegram, which are ALSO
  just deep-links, NOT real API sends) OR remove Teams scaffolding entirely. AWAITING ANSWER.
- **SCOPED (F-C findings) — TWO PATHS:**
  - **Path A — DEEP-LINK Teams (NO Azure; mirrors Telegram; small).** Build
    `https://teams.microsoft.com/l/chat/0/0?users=<encodeURIComponent(teams_email)>&message=<encodeURIComponent(body)>`.
    Already in place: `teams_email` col + `prospects_user_teams_unique` index (DB5), Teams LLM writer/critic prompt
    blocks (`lib/channelRegister.ts`), registry slot (`services/channels/index.ts:19`), Teams labels/icons in FE.
    TO DO: (1) replace stub `services/channels/teams.ts:9-11` with real `generateLink` + `recordSendIntent` copied
    from `telegram.ts:99-190` (new `teams.send_intent` action type in `db/schema/action_logs.ts`); (2) add `teams`
    to `SEND_IMPLEMENTED_CHANNELS` + 409 `no_teams_identifier` guard + send branch in `routes/followups.ts`;
    (3) add `teams` branch to send-intent dispatch in `routes/whatsappLink.ts`; (4) FE: `/followup/teams` route
    (`App.tsx`) + Teams in preferred-channel selector (`UserPreferencesPanel.tsx:123-124`) + teams-email capture on
    prospect-create. **NO OAuth, NO Graph, NO encryption, NO migration.** Caveat: `message` prefill honored only in
    some Teams clients; cross-tenant chat subject to recipient External Access settings.
  - **Path B — real Microsoft GRAPH send (NEEDS AZURE — user rejected).** Azure/Entra app reg + `MICROSOFT_OAUTH_*`
    env; delegated scopes `Chat.ReadWrite`/`ChatMessage.Send`/`User.Read`/`offline_access`; `microsoft-auth.ts` OAuth
    route (reuse `oauth_nonces` provider="microsoft"); write `users.microsoft_refresh_token` = the deferred DB2 work
    (net-new symmetric encrypt/decrypt + KMS decision, none exists today); AND async-adapter interface refactor.
  - **Path C — REMOVE Teams entirely (if user wants it gone):** stub adapter → remove/keep-as-501; drop `teams` from
    `ChannelCode`/`isChannelCode`/ADAPTERS registry; remove Teams LLM prompt blocks in `channelRegister.ts`; remove
    Teams labels/icons/filters in FE (`ChannelFollowupPage.tsx:80/87`, `today.tsx:61`, `ProspectsListFilters.tsx:27`);
    DECIDE on `teams_email` column + `prospects_user_teams_unique` index + `microsoft_refresh_token`/`slack_bot_token`
    cols (drop via migration, or leave dormant). Note Slack is in the same 501-stub state — clarify if Slack goes too.

### F-D. Understand how Pushover works (investigation)
- Read the existing Pushover integration end-to-end: `PushoverSettings.tsx`, the pushover services
  (`pushoverDigest.ts`, `pushoverNudges.ts`, `pushoverSchedule.ts`, mailer/notification libs), the user
  columns (`pushover_user_key`, quiet hours), and the digest scheduler wiring. Produce a plain-language
  explainer of the current flow (feeds F-B's "surface Pushover config in followups menu").

### F-E. Move seeding: remove manual seed from Followups, add bulk phone seed to Contacts
- Remove the manual-seed entry point from the followups section; add a **bulk phone-number seed** into the
  Contacts section (paste/upload many phone numbers → create prospects/contacts). Touches: seeder UI
  (`pages/seeder.tsx` / whatsapp-bulk components), contacts page (`pages/contacts.tsx`), the bulk-ingest
  route(s) and `manual-ingest` API client (noted in FE7 as having 6 consumers). Reuse existing bulk-candidate
  flow where possible.
- **Scope first:** find the current manual-seed UI in followups + the existing bulk/candidate ingest path.
- **SCOPED (F-E findings) — most infra already exists:**
  - **REMOVE from followups:** the manual-seed UI is `<ManualContactsSection channel={channel}/>` rendered at
    `components/followup/ChannelFollowupPage.tsx:346-348` (import `:75`) — shows on `/followup/whatsapp` + `/followup/telegram`.
    Delete that render (+ import). Component file `components/followup/ManualContactsSection.tsx` is the ONLY UI that
    reads/writes the per-channel manual-ingest on/off toggle (`useToggleManualIngest`); removing it orphans that toggle UI
    (decide: also remove the toggle, or leave the settings endpoint dormant). `pages/followups.tsx` is a dead placeholder (nothing there);
    `pages/seeder.tsx` is the Apollo flow (leave it).
  - **ADD to Contacts:** `pages/contacts.tsx` ALREADY has "Add contact" (`:167-183` → `AddManualContactDialog` `:308-313`)
    and "Add many" (→ `BulkAddDialog` `:314-318`). So the bulk entry point already lives in Contacts. The task = add a
    **phone-only** bulk mode.
  - **Backend to reuse (already built):** `POST /api/prospects/manual-ingest/bulk` (`routes/prospects.ts:1505`, schema `:1460-1486`)
    — accepts `{channel, contacts:[{firstName,phone,company,ticker,prePlatformContext?}]}`, 1..200 rows (cap const 1458),
    always 200 with `{accepted, rejected[]}` partial-success. Dedup: `(user_id, phone)` unique → `duplicate_phone`;
    telegram partial-unique. Phone validation E.164 `/^\+[1-9]\d{6,14}$/`. **Caveat:** firstName/company/ticker are REQUIRED
    per row today → for phone-only seed, relax/default them in the schema+handler (and the FE `BulkAddDialog.parseCsv`/
    `BulkPreviewGrid.validateBulkRow`). FE client `lib/api/manual-ingest.ts postManualIngestBulk` + hook
    `use-manual-ingest.useAddManualContactsBulk` already exist.
  - **NOT the reuse target:** `whatsapp-bulk/CandidateGrid.tsx` is Apollo-candidate reveal UI, unrelated. Reuse
    `followup/BulkAddDialog` + `BulkPreviewGrid` + the bulk endpoint instead.
- **BUILD PLAN (F-E) — confirmed file targets (all under `artifacts/`):**
  - REMOVE: `components/followup/ChannelFollowupPage.tsx` — delete `<ManualContactsSection channel={channel}/>` render
    (~line 346-348) + its import (~line 75). Leaves `ManualContactsSection.tsx` + the manual-ingest toggle endpoint
    (`routes/prospects.ts:1315/1347`) dormant (keep for now; note as orphaned — do NOT delete the backend toggle).
  - ADD phone-only bulk to Contacts: `pages/contacts.tsx` already mounts `<BulkAddDialog>`. Backend bulk endpoint
    `routes/prospects.ts:1505` schema (`:1460-1486`) REQUIRES firstName+phone+company+ticker per row.
  - **DECISION RESOLVED → Option A** (2026-07-08, commit `8c3f9bf`): capture Company+Product ONCE for the
    whole pasted batch, names optional. Backend schema `defaultCompany`/`defaultTicker` (optional) + per-row
    firstName/company/ticker made optional; handler resolves row→batch default and rejects only if neither
    yields a company AND product. FE: batch control in `BulkAddDialog`, headerless phone-only CSV paste,
    inherited-default validation/placeholders in `BulkPreviewGrid`.
  - Channel default = active Contacts tab (whatsapp default) — not asking, reversible.

---

## DONE (high level — full detail in LOG.md)
- Sessions 1–6: 8-auditor godlike pass, ~60 findings, all fixed or explicitly deferred. Green bar held.
  Dev DB migrated to head (through migration 0015). Prod-migration workaround SQL authored (the files above).
- **F-E (2026-07-08, commit `8c3f9bf`):** moved seeding — removed manual-seed from Follow-ups, added
  phone-only bulk seed to Contacts (Option A: batch company+product once, names optional). Build exit 0.

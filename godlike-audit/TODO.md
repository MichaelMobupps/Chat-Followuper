# Godlike Audit — TODO / Resume Checkpoint

**Companion to `LOG.md`.** LOG.md = the full narrative of what was done (Sessions 1–6).
This file = the short "what's the state and what's next" so any new session can resume cold
after an SSH drop. Keep it current: when you finish something, move it to DONE with a one-line
result; when you start something, note it under IN PROGRESS with the exact next step.

**Branch:** `audit/godlike-fixes` (main untouched at `e9ed33c`) · **Identity:** hwholestorm@gmail.com
**Green bar (as of 2026-07-14) — 100%, nothing outstanding:**
`pnpm run build` → exit 0 · **`pnpm run test` (NEW, root) → 37/37** (`@workspace/db` 3/3 +
`@workspace/dashboard` 34/34) · **`pnpm --filter @workspace/dashboard test:e2e` → 6/6 in REAL
Chromium** · api-server smokes (live DB): `smoke:regenerate` 13/13, `smoke:chatfollowup` 17/17,
`smokeDeliveryFlow` 5/5 · dev DB (heliumdb) at head.
> The dashboard had **zero test infrastructure** until session 14 — every FE claim in this ledger
> before then rested on typecheck + review, which is exactly how a hook bug and a wrong *fix* for it
> both survived. `pnpm run test` at the root now runs every package that has tests.

> **State as of 2026-07-14 (session 14).** Sessions 13–14 (the hook-writer/ad-intel/seed-classifier
> batch, its 4-auditor godlike pass, the deferred-items batch, and the runtime smokes) landed as
> commits `cd24785` → `2e443d8` — this file had gone stale at 2026-07-10 and did not mention any of
> them; LOG.md is the authoritative narrative and was current throughout. Working tree clean at
> `2e443d8` + the session-14 Contacts preview work below. **Prod is at head (0018)** — the migration
> is DONE and verified (27/27); the only prod actions left are a Republish and the optional
> `prod-cancel-legacy-channel-followups.sql` data cleanup. Branch is **107 commits ahead of `main`**.

---

## 🔴 IN FLIGHT (2026-07-14) — RESUME HERE AFTER AN SSH DROP

Two threads open. Everything below is UNCOMMITTED unless it says otherwise.

### A. LLM cost work (in progress)

1. **[DOING] `pricing.ts` — claude-sonnet-5 intro rate is WRONG and it's live.**
   The table says `$3.00/$15.00`; Anthropic bills **$2.00/$10.00 per MTok through
   **2026-08-31**, reverting to $3/$15 after. **`CRITIC_MODEL = claude-sonnet-5`**, so every
   critic call is over-reported by **50%** right now — and so is every bench dollar figure in
   this folder. Fix must be **date-aware**: hardcoding either number is wrong half the time
   (2.0 is wrong from Sep 1; 3.0 is wrong today). Verified against the claude-api skill's
   authoritative pricing table, not memory.
2. **[NEXT] `RESEARCH_MODEL` is a hard const** (`prospectResearch.ts:43` =
   `"claude-opus-4-7"`), unlike the writer chain which is env-overridable. Make it
   `process.env.RESEARCH_MODEL || "claude-opus-4-7"` so the A/B needs no code edit per arm.
3. **[NEXT] Bench research: opus-4-7 vs sonnet-5.** Only **2** bench cases run real research
   (`en-US-research`, `tr-TR-research` — `research: "real"`), ~$0.39–0.52 each ⇒ ~$2 for both
   arms. Cost delta is deterministic and trustworthy at n=2; **quality is NOT** — treat any
   score difference as directional only. Use `BENCH_TAG=research-ab` per arm (the report stem
   now carries BENCH_TAG + subsetN, so runs can't clobber the committed 52-case baseline —
   that trap already ate it once today; recovered via git).
4. **[THEN] Decide.** claude-sonnet-5 is **−60% vs opus-4-7 today** ($2/$10 vs $5/$25), −40%
   after Aug 31, keeps 1M context and `web_search_20260209` dynamic filtering, and is the
   near-Opus agentic tier. **claude-haiku-4-5 is OUT** despite $1/$5: it is not eligible for
   `web_search_20260209` (would fall back to unfiltered `web_search_20250305` — more input
   tokens, worse briefs), caps at 200K context, and `effort` ERRORS on it.
   ⚠️ **TRAP if switching:** Opus 4.7 with `thinking` omitted = **thinking OFF** (today's
   behaviour). Sonnet 5 with `thinking` omitted = **adaptive thinking ON**. A naive model-string
   swap silently ADDS thinking tokens + latency. Set `thinking: {type:"disabled"}` to match
   today, or enable deliberately with `effort: "low"`. Tokenizer is the same family as Opus 4.7,
   so token counts carry over (the "+30%" figure is vs Sonnet 4.6, not vs Opus).

### B. Admin dashboard for michael@mobupps.com (NOT STARTED)

Infrastructure already exists — extend, don't rebuild: `ADMIN_EMAILS` allowlist
(`lib/admin.ts`), `requireAdmin` middleware, `routes/admin.ts` (`/admin/whoami`,
`/admin/activity`, `/admin/ops-dashboard`, `/admin/audit-export.csv`), `pages/admin-ops.tsx`.
Add michael@mobupps.com to `ADMIN_EMAILS`.

User chose (2026-07-14): **user-level kill switch** + **per-call ledger table**.

1. **Migration 0019** — `users.followups_paused` (bool, default false) + new `llm_calls`
   ledger (user_id, task, model, tokens, cost_usd, prospect_id?, created_at; indexes on
   (user_id, created_at), model, task).
2. **Ledger writes.** `callLLMRole()` (`lib/llm/router.ts:377`) is the chokepoint for
   writer/critic/lint and already returns `{model, provider, cost}` — but NOT userId. Two
   services bypass it and call `anthropic.messages.create` directly: `seedClassifier.ts` and
   `prospectResearch.ts` (+ `messageSummarizer.ts`, dead code per L11). Thread an explicit
   `ledger: {userId, prospectId?}` through the 3 service entry points (generateChatMessage,
   researchProspect, classifySeed) → into `LlmCallInput`. Explicit > AsyncLocalStorage for an
   accounting ledger; unattributed rows must surface as their own row, never hide.
3. **DATA GAP (tell the user again if asked):** `modelMetadata.draftModel/criticModel/
   rewriterModel` exist per call but are **discarded at the log boundary** — action_logs keeps
   iterations + finalOverallScore only. So **per-model history cannot be reconstructed**; the
   ledger only covers data from deploy onward.
4. **Kill switch** — gate `users.followups_paused` in EVERY send path: digest
   (`fetchDueRows`), pushover, send-next route, `/open`. Miss one and the switch leaks.
5. **Admin routes + FE page.**

### Live-verified facts (2026-07-14) — don't re-derive
- **gemini-3.5-flash NOW SERVES** on this key (probed: OK 16.4s; 3-flash-preview OK 16.3s). The
  router comment claiming it "503s (not provisioned)" is STALE. The chain silently promoted
  itself to the $1.50/$9.00 primary — **~3× the $0.50/$3.00 fallback** — with no deploy. The
  committed 52-case bench (3.90 avg / 1.90 iters) measured **3-flash-preview 52/52**, i.e. the
  FALLBACK, not what prod now runs. A full A/B (both arms pinned, `BENCH_TAG=ab`) was launched;
  if `/tmp/armA.log` / `/tmp/armB.log` are gone, it must be re-run.
- Grey-area routing (casino|betting|crypto|forex) keys off **subVertical only** — the coarse
  vertical is only ever web_cps|mobile and can never match. Asserted in `smoke:parity`.

---

## ⭐ SESSION 14 — CONTACTS: generate → preview → confirm (2026-07-14). Answers Murat's Q.

**Why:** first-message generation was INVISIBLE and UNREVIEWABLE. Adding a contact fired
prepare-first-message from inside the (unmounting) Add dialog, so there was no progress bar and no
preview — the SDR saw two toasts and the text only appeared, unreviewed, in the WhatsApp composer.
The row's "Generate" button existed but only surfaced on `status === "draft"` (i.e. after a FAILED
auto-generate), which is why it looked missing. This is the "in-app generate→preview→confirm step"
recorded as a possible future feature in Session 12 — now built, for **all 3 channels**.

**Built:**
- **BE** `force` flag on POST /prospects/:id/prepare-first-message (route + service). Default false →
  every existing caller keeps the free cached short-circuit; `force:true` skips it and re-runs the
  writer (research/classify reused via `hasBrief` — *usually* writer-only, NOT guaranteed).
- **FE** `FirstMessagePreviewDialog` (new): live `PrepareProgressBar` while generating → editable
  message + Regenerate / Save for later / Send. Channel-agnostic (wa/tg/li).
- **FE** `AddManualContactDialog`: `prepareAfterAdd?: boolean` → `onAdded?(prospect)`. The **page**
  now owns the run (it holds the single-flight `generatingId` + the one progress poller), so the
  staged bar is visible on the new row AND in the dialog.
- **FE** `contacts.tsx`: `runGenerate(target, force)` + `handleAdded` + row Generate all open the
  preview; `handlePrepareAndSend` now returns `Promise<boolean>` so a blocked popup keeps the dialog
  (and the SDR's edit) on screen. Spec + generated clients regenerated (`pnpm --filter @workspace/api-spec codegen`).

**Godlike audit — 2 parallel read-only auditors (BE force/spend + FE blast-radius), then 1
adversarial verifier on the FIXES. All High/Med fixed; green after each.**
- **[High] force could overwrite an ALREADY-SENT message** → follow-up writer cites text the prospect
  never received (it feeds stored `firstMessageBody` + `firstMessageSentAt` to the LLM as "you sent X
  on <date>"), and status stays `sent` so nothing surfaces the swap. Fix: `firstMessageSentAt` guard
  → 409 `already_sent`.
- **[High] force = new cost-DoS surface.** Pre-force this route was free to repeat (cached read).
  `assertUnderDailyLlmCap` is off by default (`.env.example` ships the cap empty) and is a
  read-then-check, so N concurrent calls all pass it. Fix: 10/min per-user sliding-window limit,
  **force-only** (cached path stays free), 429 + Retry-After.
- **[High] the progress bar froze on every Regenerate/retry.** The server parks ready/error for a
  15-min TTL and our GET beats the POST — `resetQueries` refetches SYNCHRONOUSLY while `mutateAsync`
  defers its fetch a microtask, so **no source ordering can put the POST first**. The poller believed
  the stale terminal entry and stopped dead → frozen 100% bar under a "Writing…" title. Fix:
  `usePrepareProgress(id, {running})` keeps polling while the POST is in flight; the bar self-corrects
  within one interval. (First attempt — reordering the calls — was proven useless by the verifier.)
- **[High] `prepare` is ONE shared mutation instance** across generate + send, so `prepare.isPending`
  made every send flip the dialog back to "Writing your first message…" and pinned a phantom spinner
  on the last-generated row. Fix: explicit `generateRunning` + `runSeqRef` epoch guard.
- **[Med]** force persisted the new body then rethrew from `buildDeepLink` → destroyed a good message
  *and* billed for it. Fix: degrade to `deepLinkUrl: null` on force only (first-generate still throws).
- **[Med]** LinkedIn clipboard copy fired AFTER `window.open` stole focus → `NotAllowedError`,
  swallowed, while the toast still claimed "message copied" — dead-ending LinkedIn (clipboard-ONLY).
  Fix: copy before open, awaited (2s-bounded), honest toast.
- **[Med]** preview save never invalidated `["followups"]`/`["prospects-list"]` → Today/follow-ups kept
  rendering the pre-edit body. **[Med]** Save-then-Send double-PATCHed and closed the dialog mid-send.
- **[Low]** unscoped research UPDATE (added userId), OpenAPI spec lacked `force` (added + codegen),
  stale-run toast escaped the epoch guard, "Regenerate" label on an error state → "Try again".

**Verified green:** `pnpm run build` exit 0 · **new `smoke:regenerate` 13/13** · `smoke:chatfollowup`
17/17 · `smokeDeliveryFlow` 5/5 · `@workspace/db` 3/3.
`pnpm --filter @workspace/api-server smoke:regenerate` — drives the force semantics over real HTTP on
the live DB and **spends ZERO LLM money by construction** (every case short-circuits or is rejected by
a guard before any model call). If a guard regresses it starts burning real money and the runtime
explodes — that's the signal.

**Follow-up round (4th verifier pass) — the `running` fix was incomplete; both gaps closed:**
- The stale terminal frame still **rendered** (green "Ready 100%" flash on every Regenerate, red
  "Failed" through every retry) → new `useFreshProgress` (`hooks/use-live-progress.ts`) suppresses a
  terminal frame until the live run reports in, then passes through (so the real ready, which lands
  while `running` is still true, isn't masked and the bar can't blink out at the end).
- **`useFollowupProgress` was the unfixed twin** — same store/TTL/parking, live-broken on follow-up
  send-next retries, with a comment falsely claiming it mirrored the prepare hook's hardening. Fixed
  identically. Also reverted an in-hook `{...query}` mask that permanently degraded React Query prop
  tracking to `"all"` (tracked-result Proxy + add-only `#trackedProps`).

**Examined, deliberately NOT changed (not defects):** `messagesGenerated` +1 per regeneration is the
consistent semantic (the digest sums it beside `messagesSent`/spend, and a regenerate does generate a
message at real counted cost). `force` + no-brief → full research, and + no-company → 409
`missing_company`: unreachable (the add form requires a company) and an honest error.

**GAP CLOSED — the dashboard now has tests (2026-07-14).** Took option (a): vitest 4.1.5 (the version
lib/db already uses) + @testing-library/react + jsdom, plus @testing-library/dom as an EXPLICIT dep —
`.npmrc` sets `auto-install-peers=false`, so the peer does not come along on its own. New root
`pnpm run test` runs every package that has tests. **34 dashboard tests, all green:**
- `hooks/use-live-progress.test.ts` (9) — the suppression rule: a stale ready/error frame is hidden at
  run start, the run's REAL ready is NOT (the bar must not blink out at the finish), and it re-arms per
  run and on runKey change.
- `hooks/use-prepare-progress.test.tsx` (6) — the polling rule, on BOTH hooks: keeps polling through a
  stale terminal frame while a run is live; still stops when nothing is running.
- `components/followup/FirstMessagePreviewDialog.test.tsx` (19) — the state machine: generating /
  ready / error, per-channel Send labels, edit→PATCH-before-composer ORDER, blocked popup keeps the
  dialog open with the edit intact, no double-PATCH while a save is in flight.

**The tests were verified to actually catch the bug:** with `if (running) return 1200` removed from both
hooks, exactly the 2 stale-frame tests fail and nothing else. That exercise also exposed inter-test
coupling worth knowing about — `clearAllMocks` leaves QUEUED `mockResolvedValueOnce` values behind, so a
test whose poller stopped early leaked its unconsumed frames into the next test (which then passed or
failed depending on run order AND on whether the code was correct). `mockReset` in `beforeEach` instead.

**BROWSER E2E — DONE (6/6, real Chromium).** `artifacts/dashboard/e2e/contacts-generate.spec.ts`, run
with `pnpm --filter @workspace/dashboard test:e2e`. Drives the REAL production build via `vite preview`
on 127.0.0.1 with every `/api` call stubbed → zero LLM spend, no DB. Covers: the app actually boots and
paints; the staged bar streams queued→researching→writing on the real 1.2s clock; **the stale-parked-
"ready" race reproduced end-to-end** (no flash, no freeze); edit→PATCH-before-composer as an ORDER; a
real blocked popup keeps the edit; and the **real clipboard under the real permission model** for
LinkedIn. Verified to catch the bug: removing `if (running) return 1200` makes exactly that regression
test fail.

> **SAFETY — do not break this.** The suite is localhost-only and **never contacts LinkedIn**.
> `window.open` is STUBBED, so the LinkedIn deep link is asserted as a string, never navigated to; a
> `page.route("**://www.linkedin.com/**", abort)` backstop fails loudly if anything tries to leave
> localhost. This app does no LinkedIn automation by design (F-A: clipboard-only; the SDR clicks in
> their own browser as themselves) and the tests must not become the exception. Any test that would hit
> a third-party host does not belong in this suite.

> **NIX GOTCHA — why @playwright/test is PINNED to 1.55.0.** `npx playwright install chromium` downloads
> a build that can't run here (`libglib-2.0.so.0` missing) and `playwright install-deps` is apt-based, so
> it can't fix a Nix box. We use the nix store's patchelf'd chromium instead:
> `PLAYWRIGHT_BROWSERS_PATH=/nix/store/71577…-playwright-browsers-1.55.0-with-cjk` (chromium-1187) +
> `channel: "chromium"` (the store has the FULL build, not the headless shell playwright defaults to).
> **Bumping @playwright/test breaks the launch** until a matching nix browsers path exists.

**NOT yet committed as of this checkpoint** / source-code mirror not re-synced.
**`pnpm-lock.yaml` + dashboard `package.json` changed** (test deps). Gotcha for the next session:
`pnpm add` inside the dashboard transiently broke `lib/db`'s vitest bin link (the jsdom peer forces a
re-resolution of the shared vitest); a root `pnpm install` repairs it — both suites pass after.

## ⭐ SESSION 12 — MURAT'S TEST FINDINGS (2026-07-10). FE fixes + audit + smoke.
Reviewed Murat's manual test pass (WhatsApp/Telegram/LinkedIn test-channel, follow-up tab,
campaigns, Pushover — all OK except two). Fixed the two broken items + one stale caption, then
2 adversarial auditors (correctness/blast-radius + security/UX) → 1 Med + Lows fixed; smoke 17/17.
- **LinkedIn "Open test chat" did nothing** — the FE panel gate `IDENTIFIER_SHAPE.linkedin`
  (`TestChannelMessage.tsx`) was STRICTER than the BE route (`/linkedin\.com\//` vs the BE's
  URL|`in/slug`|handle union) → valid identifiers silently blocked before submit. Broadened the FE
  regex to mirror the 3 BE forms; a `+`-phone still fails all → helpful hint. (The carry-over half
  was already fixed in `c3809c8`, which sits ABOVE the last "Published your App" e300b04 → **ships on
  next Republish**.) FE⊆BE parity proven in smoke (10-input table, FE/BE agree on all).
- **Follow-up "Edit" (pencil) dead for not-yet-sent prospects** — no follow-up row exists until the
  first send, so the pencil was disabled + no-op. Now (user chose edit-before-send) it opens a new
  `EditFirstMessageDialog` that edits `prospects.firstMessageBody` via PATCH /prospects/:id +
  invalidates `["followups"]`. **Audit M1 [Med] fixed:** gated on `followups.length === 0` (not
  `firstMessageBody`) so a replied/cancelled prospect (cancelled rows → next/last null but
  followups[] non-empty) keeps the pencil DISABLED and can't reopen a cancelled row / re-arm.
  Lows: textarea `maxLength=20000`, dropped dead "already sent" copy, added "sent from Today/Contacts"
  hint. Security auditor: XSS/open-redirect/IDOR all clean (BE canonicalize + `AND userId` are the boundary).
- **Doctrine-variant caption was stale/WRONG** (`SequenceConfigPanel.tsx`) — said doctrineVariant is
  "consumed in a later ticket". It's ALREADY wired (`followupMessageService.ts:184` →
  `messagePrompts.ts:701`) and steers every follow-up (stage ≥ 1). Rewrote the caption.
- New smoke `pnpm --filter @workspace/api-server smoke:chatfollowup` (no API key) → **17/17 PASS**.
  Full build exit 0. **NOT yet committed as of this checkpoint / source-code mirror not yet re-synced.**
- **Preview-before-send (answer to Murat's Q):** today the follow-up is generated lazily at send-next
  and the deep link opens with text PREFILLED in the WhatsApp/Telegram composer (real preview/edit is
  there); Telegram/LinkedIn copy to clipboard. In-dashboard, the pencil previews/edits an
  already-generated row (and now the first message). No in-app "generate→preview→confirm" step exists —
  a possible future feature if Murat wants a dashboard preview before the composer opens.

## ⭐ SESSION 10/11 — LLM COST REFRAME (2026-07-09). Full log: `LLM-COST-REFRAME.md`.
Phases A–H BUILT + smoke-verified + godlike-audited (3 auditors, 3 High + 5 Med/Low fixed, residuals
documented in the log). Exemplar library (947 chat-adapted, email-isms scrubbed across all scripts),
Gemini client + role router (writer/lint=gemini, critic=sonnet-5, grey→sonnet-4-6) with circuit breaker,
cache-aware pricing, F1 cache fix (research brief moved system→user prompt), Contacts auto-generate +
staged progress bar (FE polling bugs fixed). **All green:** build exit 0; smokeLlmChain PASS (default +
LLM_GEMINI_MODEL=gemini-3.1-flash-lite live-Gemini modes); smokePrepareProgress PASS both channels.
**KNOWN:** default gemini-3.5-flash 503s on this key (user decision: keep default, env-overridable) →
savings INACTIVE until user sets LLM_GEMINI_MODEL=gemini-3.1-flash-lite or provisions 3.5-flash.
gemini-2.5-flash was RETIRED by Google mid-session — don't use. COMMITTED as 290f295/a15a1f9/ff37db5/0c9001d (+mirror b31bbbd).

## ⭐ SESSION 11 cont. (2026-07-09 evening) — Phase I + investigation items BUILT + COMMITTED
- **Phase I DONE** (d31a7dc): follow-up send-next shows the staged progress bar (progress store
  generalized to userId:scope:id keys; followup checkpoints; GET /api/followups/:id/progress;
  useFollowupProgress hook; bar in the sending row). Edit-before-send VERIFIED end-to-end
  (PATCH → send-next serves the EDITED body, deep link embeds it). smokeFollowupProgress 16/16 PASS.
- **Investigation items 1/3/4 DONE** (d703a98): test-digest renders the REAL digest (real due rows
  or banner'd samples via shared fetchDueRows); per-row "Review in dashboard" links in the digest;
  **migration 0018** (pushover_hour_local/pushover_days/digest_days) + per-user pushover fire time
  (own hour+days+timezone; was env-global noon-GMT+2-weekdays) + digest day-of-week gate +
  notificationSettings fields; NEW /reminders consolidated page + nav; Accounts panels de-duped
  (UserPreferencesPanel → message-template only). smokeReminders 17/17 PASS. Migrations now 0000–0018.
- **prod-bring-to-head.sql extended through 0018** — prod migration STILL pending user (SQL Console).

## ⭐ SESSION 9 — THIRD GODLIKE PASS + built F-A & F-B (2026-07-08). Ledger: `PASS3-LEDGER.md`.
Audited the pass-2 FIXES adversarially (5 auditors): 0 Crit/High regressions; caught + fixed 3
self-inflicted issues (apolloFetch retry signal, incomplete L5 brief guard, F-B maxFollowups FE) +
Low/doc tail → commit `cef896a`.
Then BUILT the two remaining features:
- **F-A LinkedIn channel** (clipboard-only): adapter + CHANNEL_CODES single-source-of-truth +
  isChannelCode + LinkedIn prompt blocks + partial-unique dedup (migration **0017**) + allowlists +
  followups send-path + send-intent dispatch + testChannelLink + followupOpen/confirm + prospect
  status/identity + FE (unions/maps/filters/clipboard/Today-linkedin-column/route/page/nav). BE
  `beb866e`, FE `ce50490`.
- **F-B followups menu**: notificationSettings GET/PATCH now expose quiet-hours + preferredChannel
  (columns already existed); PushoverSettings UI extended; per-stage schedule view in
  ChannelFollowupPage; maxFollowups range bug fixed. BE `beb866e`, FE `ce50490`.
Then AUDITED the new features (2 auditors) → LinkedIn wasn't fully threaded; fixed 5 BE + 6 FE gaps
(digest-guard exclusion, buildDeepLink, prospect-status, testChannelLink, followupOpen, PushoverSettings
null-400, Today wrong-message-copy, bulk-open) → commit `6780dd5`. Green + live smokes throughout.
**F-A and F-B are DONE (were the last backlog features).** Migrations now 0000–0017.

## ⭐ SESSION 7 — SECOND GODLIKE PASS (2026-07-08). Full ledger: `PASS2-LEDGER.md`.
Re-audited the delta since session 6 (F-E bulk seed, F-C Teams/Slack removal, FE contract fixes)
with 8 parallel read-only auditors. Found **1 Critical, 5 High, ~15 Med + Low tail**. Fixed in 8
batches, green bar after each, commits `71083bf`→`88600e1` (+ mirror `4aee64d`).

**Applied + green (highest first):**
- **F1 [CRIT]** followup lifecycle: recordSendIntent now stamps `sentAt`+`status='sent'` (was
  write-nowhere → every sent followup re-digested/re-escalated/re-served forever). `71083bf`
- **High:** L1 prospector routes had NO spend cap + never recorded USD (unbounded burn) → cap
  pre-check ×3 + recordDailyLlmSpend; P1 webhook phone-promote 23505 lost paid reveals → dup guard;
  C1 telegram digit-strings stored as handles (corrupt phone-only batches) → regex must-start-letter;
  E1 bulk-add didn't refresh Contacts list. `7d3acf0`/`13d1af5`
- **Med:** F2 digest UTC-claim double-send; F3 pushover `>=` gate; F5 snooze-from-now; F6 claim-
  release-after-send; L2 researchStream spend; L8 tx×2; L10 cache-before-cap; P3a apolloFetch
  hardening; 23505→409 taxonomy (D1/A3/C2 + new `lib/dbErrors.ts`); A1 cap/error contract; A2 send-
  intent ownership 404; A9 detail leak; C3/A5 missing_company_product; L3/L4/L5 prompt-injection
  hardening; L6 grounding thousands-sep; A6 handle lowercase; E2-E7 frontend UX; C5 clipboard×3;
  F4/D2 zombie teams/slack followup guards ×4 + prod SQL; L7 wasted-rewrite; P3c reveal-sweep wired;
  B1 replit.md; B3 .env.example; B4 prod SQL run-order.

**RESIDUALS (documented, not fixed — reason each):**
- **P2a/P2b** [Med] AbortSignal not threaded through the stage-B prospector routes + discover's LLM
  steps → timeout losers keep burning credits. Bounded (rate-limited + zod-capped). Threading it is
  sprawling; deferred. discover-simple exact spend-recording also deferred (cap pre-check IS added).
- **C4** [Low] one bad row Zod-400s the whole bulk batch for DIRECT API clients (the FE can't trip it).
- **L9** [Low] `modelDefaultsAdaptiveThinking` sends `thinking:{disabled}` for fable-5 (reportedly
  400s) — latent, only via `PROSPECTOR_SONNET_MODEL=claude-fable-5`. Needs an authoritative fable-5
  API check before changing.
- **L11** [Low] messageSummarizer/priorSummary is unwired dead code — wire-with-spend or delete (product call).
- Dead code (harmless): GeoGate catch branches in routes/apollo.ts (unreachable since APO3);
  orphaned `ManualContactsSection.tsx` (zero importers post-F-E).
- **F4/D2 prod data:** `godlike-audit/prod-cancel-legacy-channel-followups.sql` must be run on prod
  (dev has zero such rows; the app-side guard already stops processing them).

---

## ⭐ SESSION 8 (2026-07-08, cont.) — post-audit hardening + verification
Done after the audit-2 fix batches (all green; commits on `audit/godlike-fixes`):
- **S1** live smoke (`5dfffcd`): F1 lifecycle 6/6 + F-E bulk HTTP 9/9 PASS on dev DB.
  Kept as `pnpm --filter @workspace/api-server smoke:audit2` / `smoke:bulk`.
- **S2** (`10be5b3`): L9 fable-5 thinking-param fixed (reference-verified — Fable 5 400s on
  `thinking:{disabled}`, must omit). C4 / L11 / dead-code / xlsx kept as documented residuals (reasons in commit).
- **S3** (`bca3352`): **migration 0016 drops the dormant Teams/Slack columns** (prospects.teams_email/
  slack_user_id + indexes, users.microsoft_refresh_token/slack_bot_token). Applied to dev, green. **Ties off
  DB2 permanently.** Prod: `godlike-audit/prod-drop-dormant-channel-columns.sql` (or auto-applied on Republish).
- **F-B (partial)** (`a7b5366`): cadence range bug fixed — `maxFollowups` validation now 1–10 (was 0–20)
  to match the scheduler clamp. **F-B UI slices NOT built** (see below).

### STILL OPEN — two large NET-NEW features (scoped, not built — recommend a focused session each)
- **F-B remaining (UI):** (a) per-stage schedule view — data already in `GET /api/followups`
  (`derived.nextScheduled` + every stage row); UI shows only the single next time
  (`ChannelFollowupPage.tsx:600`). (b) Surface Pushover config from the followups menu — the columns
  `pushover_quiet_hour_start/end` + `preferred_channel` exist but the PATCH schema
  (`routes/notificationSettings.ts` patchSchema) only accepts `pushoverUserKey`; add those fields + inputs,
  then mount `<PushoverSettings/>` (+ new fields) into a followups Sheet/tab.
- **F-A LinkedIn channel (widest sweep):** adapter + ChannelCode `"linkedin"` + `isChannelCode`; dedup
  partial-unique index on `(user_id, linkedin_url)` (new migration 0017, mirror 0013); ~15 allowlists
  (routes prepareFirstMessage/followups/userExtras/campaigns/prospects/testChannelLink; openapi + regen;
  FE unions + label/icon `Record<Channel,…>` maps); clipboard-only send (no prefill deep link — extend the
  CH5 telegram branch); `/followup/linkedin` route + page. `prospects.linkedin_url` already exists. Full
  file-by-file scope in the F-A section below.
  **NOTE:** both are greenfield features that each deserve the project's scope→build→live-verify discipline
  in a dedicated session, not a rushed tail-end build.

## IN PROGRESS / OPEN

### 1. Production DB migration — ✅ DONE 2026-07-09 ~22:00 (verified)
> Applied via the chunked console-safe scripts (prod-chunk-1..6.sql) after the full-file batch
> tripped the Replit SQL driver and a read-only-mode toggle masqueraded as a lock stall
> (prod-diagnose-locks.sql showed a clean lock table; Enable Editing was simply off).
> **prod-verify-state.sql: 27/27 ok=true** — prod matches dev head (0018). Remaining: user
> Republishes (auto-migration now finds nothing to do), and optionally runs
> prod-cancel-legacy-channel-followups.sql once (F4/D2 zombie-row DATA cleanup; the app-side
> guard already excludes those rows, so this is belt-and-suspenders).
> Historical detail below kept for the record.

### 1-historical. Production DB migration  ← the thing interrupted by the SSH drop (2026-07-04 ~18:11)
> **UPDATED 2026-07-09 (session 10):** `prod-bring-to-head.sql` was REGENERATED to carry prod all
> the way to dev head **0017** (was stale at 0015). It now (a) folds in **0016** — drops the dormant
> Teams/Slack columns + uniques, (b) folds in **0017** — adds the LinkedIn per-user dedup unique, and
> (c) NO LONGER creates the teams/slack uniques (0016 removes them anyway). Re-validated by running it
> inside a `BEGIN…ROLLBACK` txn against dev head: every statement a clean no-op, psql exit 0, zero net
> change. **Still blocked on the user** to paste it into the Replit SQL Console (prod is unreachable
> from this workspace — `DATABASE_URL` is the dev heliumdb).
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
- ~~**DB2** — encrypt `microsoft_refresh_token` / `slack_bot_token`~~ **MOOT as of 2026-07-08 (F-C):** Teams
  and Slack were removed entirely, so these token columns will NEVER be used. No encryption needed. They're now
  dormant with zero code refs — optionally drop them (+ `teams_email`/`slack_user_id`) in a future DB-cleanup
  migration; no KMS decision required anymore.
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
> **STATUS (2026-07-08):** ✅ **F-E DONE** (commit `8c3f9bf`, Option A). ✅ **F-C RESOLVED BY REMOVAL**
> (commit `996f1f9`) — user reversed the earlier "build deep-link Teams" decision: **remove Teams AND Slack
> entirely** (Path C, code-only). Both were 501-stubs, nothing functional lost. DB columns left dormant (no
> migration). **NEXT: F-B (followups menu).** Commit per item; build green bar before moving on.
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

### F-C. Teams — ✅ RESOLVED BY REMOVAL (2026-07-08, commit `996f1f9`)
- **FINAL USER DECISION (2026-07-08):** "remove Teams from the plan entirely. We don't want it." Chose to
  **rip out the code scaffolding for BOTH Teams AND Slack** (Path C, code-only), leaving DB columns dormant.
  Reverses the earlier 2026-07-04 "build Azure-free deep-link Teams" decision.
- **DONE:** `ChannelCode`/`isChannelCode` narrowed to `whatsapp|telegram`; deleted TEAMS_*/SLACK_* prompt
  blocks + `services/channels/{teams,slack,errors}.ts` + ADAPTERS entries + app.ts 501 mapping; dropped
  teams/slack from every route allowlist + the `teamsEmail` create/patch schema/writes; openapi enum →
  `[whatsapp,telegram]` + orval regen; FE unions/label-icon maps/filters narrowed. Build exit 0; db tests 3/3.
- **DORMANT (per decision — no migration):** `prospects.teams_email` + `prospects_user_teams_unique` index,
  `prospects.slack_user_id` (+ its unique index), `users.microsoft_refresh_token`, `users.slack_bot_token`.
  These now have ZERO code references. Drop them in a future DB-cleanup migration if/when desired (ties off
  the old **DB2** residual — there's no longer any feature that will ever use those token columns).
- Historical scoping (the three paths considered) preserved below for context:
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
- **F-C (2026-07-08, commit `996f1f9`):** removed Teams AND Slack entirely (were 501 stubs). Code-only rip-out
  across BE (types/registry/prompts/routes), openapi+orval regen, and FE; DB columns left dormant. Build exit 0;
  db tests 3/3. Ties off the DB2 residual (token columns now have zero code refs → drop in a future migration).

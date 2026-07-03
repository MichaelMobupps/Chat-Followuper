# Godlike Audit — Running Log & Checkpoint

**Purpose:** Durable record so nothing is lost on SSH disconnect. This file + the
git commits on branch `audit/godlike-fixes` together are a full resumable checkpoint.

Rubric: `debug-special-cases-prompt-v2.md` (Godlike Standard v2), adapted to a
multi-package codebase, plus **blast-radius** per finding and **auto-fix** (user
chose: auto-fix everything, on a branch).

---

## Session state

- **Branch:** `audit/godlike-fixes` (main untouched at `e9ed33c`)
- **Snapshot commit:** `0d8714f` — "checkpoint: WIP snapshot before godlike audit (97 files)"
  - This preserves the user's 97 uncommitted WIP files. `git checkout main` discards all audit work.
- **Git identity set (repo-local):** hwholestorm@gmail.com

## Baseline health probe (before any fixes)

- `pnpm run typecheck` → **PASS (exit 0)** across all packages. This is the regression bar: no NEW typecheck errors.
- `pnpm --filter @workspace/db run test` → **FAIL (exit 1)** — pre-existing.
  - Cause: `column "pushover_user_key" of relation "users" does not exist`.
  - Diagnosis: ORM schema (`lib/db/src/schema/users.ts`) declares a `pushover_user_key`
    column that was never migrated/pushed to the live dev DB. **Schema/migration drift.**
  - Recorded as **FINDING #1** (pending DB-agent confirmation of whether a migration file exists).

## Method

Phases 1-6 executed as 8 parallel READ-ONLY subsystem auditors (Agent tool fan-out),
each applying triple-framing (Technical / Security / End-user) and returning
findings with severity + blast radius + concrete fix + fix-confidence. Then:
consolidate → triage → auto-fix serially with typecheck health probe after each batch.

### Auditors launched
1. API routes, middleware, app wiring, session/admin/token libs
2. Anthropic / message generation (LLM, retry, pricing, prompts)
3. Apollo / discovery (prospector, orgFinder, webhook security, geo gate)
4. Followups / scheduling / notifications (schedulers, mailer, pushover)
5. Channels & templating (whatsapp/telegram/teams/slack deep links)
6. DB (schema, migrations, actionLog helpers, seed)
7. Dashboard frontend (pages, hooks, api client, UX)
8. Build / config / tooling / hygiene / secrets

---

## Findings ledger

- **F1** [High] ~~Schema/migration drift~~ **CORRECTED by DB auditor:** NOT schema-vs-sql drift — migration `0008_pushover_user_key.sql` has the column. Real cause: **live DB never migrated past ~0006/0007** (no `globalSetup`/`pretest`/migrate step). Fix: run `pnpm --filter @workspace/db migrate` before tests + verify prod/staging at 0010. Same root as DB1 below.

### Auditor 5 — Channels & deep links (returned)
- **CH1** [High] Telegram `generateLink` drops identifier verbatim into URL (only body is encoded) + handle stored with length-only validation → injection of `?`/`#`/`/` into t.me path, dropped message bodies, malformed phone links. `services/channels/telegram.ts:59-68`; unguarded callers `routes/whatsappLink.ts:142,148`, `routes/followups.ts:557,562`, `routes/followupOpen.ts:101-105`. Fix: validate handle `^[A-Za-z0-9_]{5,32}$` / E.164, `encodeURIComponent` path segment. Conf: High.
- **CH2** [Med] `GeoGateBlockedError` thrown for invalid phone *format* (gate is disabled) → misleading `geo_blocked` 422 for `+`-less phones. `whatsapp.ts:35-38`, `whatsappLink.ts:59-62`. Fix: dedicated `InvalidPhoneError` → 422 `invalid_phone`. Conf: Med.
- **CH3** [Med] `send-intent` dispatch is `if telegram … else whatsapp`, so `channel:"teams"|"slack"` logs a `whatsappSendIntent` while response says teams → corrupt analytics. `routes/whatsappLink.ts:88-107,177-182`. Fix: exhaustive switch over ChannelCode. Conf: High.
- **CH4** [Med] Registry advertises teams/slack (ADAPTERS + isChannelCode) but adapters `throw` untyped Error; comment claims "fully implemented". Latent (getChannelAdapter unused). `channels/teams.ts:6-8`, `slack.ts:6-8`, `channels/index.ts:16-21`. Fix: typed `ChannelNotImplementedError` (→501) or remove from registry. Conf: Med.
- **CH5** [Low] Telegram `t.me/<user>?text=` likely doesn't prefill for non-bot user handles → empty composer. Behavioral, needs product confirm. Conf: Low.
- **CH6** [Low] verticalClassifier Pass-1 substring `includes("cps"/"gaming"/…)` false-positives. `lib/verticalClassifier.ts:473-482`. Fix: `\b` regexes. Conf: Med.
- **CH7** [Med] `routes/followups.ts:532` `generateLink(prospect.phone!, …)` non-null assertion → `TypeError` crash if phone null (schema permits) instead of 409. Fix: null-guard → 409 like whatsappLink.ts:50-53. Conf: High.
- Style: typo `ironsouce` (verticalClassifier.ts:45); adapter param named `phone` but carries handle; testChannelLink phone/handle branches identical.
- Positives: WhatsApp null-phone → 409 (good); body encodeURIComponent'd both adapters; wa phone stripped to digits.

### Auditor 1 — API routes & middleware (returned)
- **API1** [High] IDOR write: `POST /prospects/:id/send-intent` takes `followupId` from body; `recordSendIntent` updates `followups SET clickedAt=now() WHERE id=followupId AND clickedAt IS NULL` with **no userId/owner join** → any user stamps another tenant's followup + writes usage/action_logs cross-tenant. `routes/whatsappLink.ts:153-191,175` → `channels/whatsapp.ts:86-98`, `channels/telegram.ts:113-125`. Fix: scope update by `EXISTS(prospects p WHERE p.id=followups.prospect_id AND p.user_id=userId)` or verify ownership in route. Conf: High.
- **API2** [Med] No terminal Express error handler → default handler serializes `err.stack` to client when `NODE_ENV!=="production"`; several post-mutation `await db.*` unguarded → 500 after partial write (LLM already charged). `app.ts` (none); `generateMessage.ts:217-270`. Fix: add error middleware, assert NODE_ENV=production / base cookie secure on `req.secure`, wrap bookkeeping. Conf: High.
- **API3** [Med] Apollo credit-burn routes `/search-org`,`/search-people`,`/reveal` have no per-user cap/limiter; monthly cap in `userExtras.ts:247-278` only *reported*, never enforced. `routes/apollo.ts:161-386`. Fix: enforce cap + prospector-style limiter. Conf: Med.
- **API4** [Med] `GET /prospects/research/stream` SSE: no rate limit / spend cap; raw `err.message` written to SSE error event. `routes/researchStream.ts:91-149,146`. Fix: limiter + sanitize error. Conf: Med.
- **API5** [Med] Follow-up open token: 14-day TTL, not single-use, carried in `?t=` query (logs/email) → leak grants read of prospect phone+message + confirm. `lib/followupLinkToken.ts:3`. HMAC itself is timing-safe & owner-bound (good). Fix: TTL ~48h + per-followup nonce/version. Conf: Med.
- **API6** [Low-Med] CSV formula injection in admin export: `csvEscape` handles `,"\n` but not `= + - @`. `routes/admin.ts:226-238`. Fix: prefix formula-leading cells with `'`. Conf: High.
- **API7** [Low] `notificationSettings` GET/PATCH return raw `pushoverUserKey` alongside masked. `:57,:118`. Fix: return masked only. Conf: High.
- **API8** [Low] Prospect status SQL filter keys on `phone` only; `computeProspectStatus` also considers `telegramHandle` → filtered list badges contradict filter. `routes/prospects.ts:98-154`. Fix: filter on `phone OR telegramHandle`. Conf: Med.
- Trivial: apollo webhook no replay/timestamp window; `cors()` fully open (`app.ts:32`); some schemas not `.strict()`; webhook non-JSON returns 500 not 415; `.bak` files in routes/middlewares/services.
- Positives: OAuth nonce consume race-safe (atomic UPDATE…RETURNING); session verify timing-safe + DB re-fetch; followup HMAC timing-safe; admin routes requireAdmin-gated; prospect/campaign/followup CRUD all userId-scoped (404 cross-user).

### Auditor 8 — Build / config / hygiene / secrets (returned)
- **NO SECRET LEAKS** (536-hit census + targeted sk-/AKIA/xox-/PEM scans all clean; `.env.example` all placeholders; no real `.env` tracked). Build config, tsconfig project refs, esbuild build.mjs, artifact.toml all verified correct.
- **BUILD1** [High] Repo `.gitignore` has **no `.env`** rule — protection comes only from host-global `/etc/.gitignore:8`. On any clone/CI/mirror a dev creating `.env` gets zero protection. Fix: add `.env`,`.env.*`,`!.env.example`,`*.pem`,`*.key`,`id_rsa*`,`*.bak*`,`*.zip`. Conf: High.
- **BUILD2** [High] `replit.md` massively stale: says "Phase 1 scaffold, no business logic/LLM/channels/auth" but code has LLM, 4 channel adapters, Apollo (6 files), digests, Pushover (6 files); says React 18 (actually 19.1.0), 8 tables (actually 9 — omits `campaigns`), last status Ticket 1.3 (actual ≈2.9). Fix: rewrite Overview/Stack/Status/Secrets. Conf: High.
- **BUILD3** [Med] `source-code/` git-tracked mirror stale: 100 src `.ts` vs 69 mirrored (31 missing incl. all pushover/digest/admin), and `prospects/action_logs/users` schema + `routes/index.ts` content DIFFERS. Fix: re-run `scripts/sync-source-code.sh` OR untrack + gitignore. Conf: High.
- **BUILD4** [Med] 15 tracked `.bak.*` snapshots (~174KB, list in log Appendix). Fix: `git rm` + `*.bak*` ignore. Conf: High.
- **BUILD5** [Med] `attached_assets/` in `.gitignore:50` but 109 ticket `.zip` already tracked (rule is no-op); + 6 root `cf-*-v2.zip`/`url-input-prereq.zip` tracked. Fix: `git rm --cached -r attached_assets`, `git rm` root zips, ignore `*.zip`. Conf: High.
- **BUILD6** [Low] `pnpm-workspace.yaml:4` globs `lib/integrations/*` which doesn't exist. Fix: remove line. Conf: High.
- **BUILD7** [Low] `api-server/package.json:11` `smoke:followup` reaches into `../../lib/db/node_modules/tsx` (not its own dep) — breaks on hoist change. Fix: add tsx devDep, call via tsx. Conf: Med.
- **BUILD8** [Low] Root scratch debris tracked (`debug-special-cases-prompt-v2.md`, `.grok/`). Cosmetic. Conf: Med.
- **.bak census (Appendix A):** build.mjs.bak x2, middlewares/auth.ts.bak, routes/index.ts.bak x2, routes/prospects.ts.bak (55KB), services/apollo.ts.bak (38KB), dashboard ProspectsListFilters/Table.tsx.bak, lib/api/prospects.ts.bak, pages/accounts.tsx.bak-, pages/prospect-detail.tsx.bak (23KB), pages/today.tsx.bak, db schema action_logs.ts.bak + prospects.ts.bak. All safe to delete (no imports, no secrets).

### Auditor 3 — Apollo discovery & webhooks (returned)
- Verified clean: webhook HMAC timing-safe + hex-validated; correlation token 32-byte CSPRNG, indexed, not logged; **no SSRF** (urlResolver host-pinned, `redirect:"error"` prevents X-Api-Key forward); LLM JSON parsing defensive.
- **APO1** [High] Apollo reveal budget cap is **display-only**: `/apollo/reveal` + `/apollo/request-phone-reveal` increment `apolloRevealsUsed` but never read/compare a cap before calling Apollo (8 credits each); `apolloMonthlyRevealCap`/`capExceeded` only in read-only usage endpoint; no rate-limit on these routes. Tight loop = unbounded credit drain. `routes/apollo.ts:277-386,413-469`. Fix: enforce cap inside the increment transaction → 402/429. Conf: High. (overlaps API3)
- **APO2** [High] AbortSignal not threaded into `findOrg`/`collectContacts` (which make 5-25 / 20-100+ Apollo calls) — only direct orchestrator `apolloPost` calls get it. On 300s timeout `ctrl.abort()` can't stop the in-flight cascade → credits spent minutes after 504. No `req.on("close")` abort either. `discoveryOrchestrator.ts:527,437,663,770`; `orgFinder.ts:509`; `contactCollector.ts:554`. Fix: add `signal?` param threaded to internal apolloPost + loop guards + client-close abort. Conf: High. NOTE: dead `subsidiaryExpander.ts` already threads signal correctly — reference impl.
- **APO3** [Med] Geo-gate disabled but leftover strict-E.164 `isAllowedPhone` marks legit revealed phones `blocked`, drops phone, logs `geo_blocked` — AFTER 8-credit reveal succeeded. `lib/geoGate.ts:147-156`; `apollo.ts:1080-1108,705-707`. Fix: normalize to E.164 (prepend `+`) or store raw; distinguish unparseable from geo_blocked. Conf: Med (needs product call).
- **APO4** [Med] Webhook no replay protection (HMAC signs body only, no timestamp/nonce); `expired`→`arrived` re-promotion replayable; static bearer fallback replayable. AND reveal counter mis-prices: async reveal = 8 credits but increments `+1` same as sync → cap under-counts up to 8x. `apolloWebhook.ts`; `apollo.ts:826-837`. Fix: timestamp binding if available; weight counter by credit cost. Conf: Med.
- **APO5** [Med] Discovery CallBudget coarse: checked before call, `bumpBy(flat estimate)` after; `consumed>=limit` lets a step at limit-1 enter collectContacts (5-100+ calls). "Hard cap" guarantee illusory. `discoveryOrchestrator.ts:206-231`. Fix: services report real call counts + in-loop budget check. Conf: Med.
- **APO6** [Low] researchStream continues Opus research after client disconnect (result discarded, cost incurred). `researchStream.ts:124-137`; prospectResearch no signal. Fix: thread signal to `messages.create({signal})`. Conf: Med.
- **APO7** [Low] `requestPhoneReveal` commits credit increment + `pending` before Apollo POST; 4xx leaves over-count + stuck-pending until 72h sweep. `apollo.ts:780-882`. Fix: compensating rollback on definitive 4xx. Conf: Med.
- **APO8** [Low] Dead `subsidiaryExpander.ts` (orchestrator runs own inline Phase-3); webhook non-JSON→500 not 415; `geoGate.normalizeCountryCode` wrong ISO-2 for unmapped multiword ("Switzerland"→"SW") but appears unused vs apollo.ts mapper.

### Auditor 6 — DB schema & data access (returned)
- Verified clean: increment helpers are **atomic** `INSERT…ON CONFLICT DO UPDATE SET col=col+n` (NO lost-update race); timestamptz consistent; action_logs cascade `set null` (preserves audit trail) correct. Zero schema-vs-`.sql` column drift.
- **DB1** [High] Failing test root cause: live/test DB behind migrations (0008-0010 unapplied); `.returning()` emits all columns incl. `pushover_user_key`. No `globalSetup`/`pretest`/migrate step. ALSO: any env provisioned before 0008 is missing pushover/preferred_channel/quiet_hour/message_template cols → `.returning()` inserts into `users` 500. Fix: add vitest `globalSetup` running migrator + verify prod at 0010. Conf: High.
- **DB2** [High] Secrets in plaintext columns: `users.microsoft_refresh_token`, `users.slack_bot_token` (bearer creds → account takeover on DB read); `magic_link_tokens.token` stored raw + indexed (replayable auth grant); `oauth_nonces.nonce` raw. `users.ts:121-122`, `magic_link_tokens.ts:22`. Fix: hash magic-link/nonce (store+lookup digest); envelope-encrypt refresh/bot tokens. Needs code + data migration. Conf: Med (design change).
- **DB3** [Med] Broken drizzle snapshot chain: `meta/` has snapshots 0000-0007 only, journal has 11 entries (0008-0010 hand-authored, no snapshot JSON). Next `drizzle-kit generate` diffs against 0007 → re-emits duplicate ADD COLUMN migrations that fail/double-apply. `drizzle/meta/`. Fix: rebuild 0008-0010 snapshots / re-baseline. Conf: Med.
- **DB4** [Med] FKs without covering indexes → parent DELETE seq-scans+locks child: `prospects.campaign_id`, `action_logs.prospect_id`/`followup_id` (append-only, unbounded), `conversations.source_followup_id`, `magic_link_tokens.user_id`, `oauth_nonces.user_id`. Fix: additive `CREATE INDEX` migration + schema `index()` entries. Conf: High.
- **DB5** [Med] Nullable `phone` defeats `(user_id, phone)` unique (NULLs distinct) → Telegram/Teams/Slack + reveal-pending prospects (phone=null) never deduped → same person messaged repeatedly. `prospects.ts:47,124`. Fix: partial unique indexes per identity (telegram_handle/teams_email/slack_user_id/apollo_person_id) + dedupe pass. Conf: Med.
- **DB6** [Med] `doctrineVariant` backfill: `users.ts:46-52` comment claims 0006 backfills existing rows, but `0006.sql` only sets DEFAULT (no UPDATE) → pre-0006 users lack the field. Non-crashing (optional type + default fn) but comment is false. Fix: backfill migration or fix comment. Conf: High.
- **DB7** [Med] Daily usage/caps bucketed by **UTC** date (`actionLog.ts:48-50` `toISOString().slice(0,10)`) while digests/quiet-hours/caps run in `digestTimezone` (Asia/Jerusalem) → caps reset ~02:00-03:00 local, a local day straddles two rows. Fix: compute bucket date in user tz. Conf: Med.
- Lows: `sql.raw(column)` sink (`actionLog.ts:90`, safe via fixed map but fragile); `serial` int4 PKs on followups/conversations/tokens (2.1B ceiling); `phone_reveal_correlation_id` index non-unique (replay could match multiple); `anthropic_spend_usd numeric(10,4)` daily ceiling; user-delete cascade is irreversible multi-table wipe (gate behind explicit path).

### Auditor 2 — LLM message generation (returned)
- Verified clean: critic/rewriter loop bounded (no infinite loop); `anthropic.ts` fails loudly on missing key, 60s timeout, maxRetries:0 + central retry; progressEvents guards write-after-close; verticalClassifier/languageNativeness pure data.
- **LLM1** [CRITICAL] Prompt injection: unauthenticated prospect inbound `body`/notes concatenated into draft/critic/rewriter prompts between `---BEGIN/END CONVERSATION---` markers with NO delimiter escaping and NO "treat as data" instruction. Same prompt holds confidential doctrine + peer/competitor list → exfiltration or brand-damaging auto-sent followup. `messagePrompts.ts:279-284,509-511,420-422,287-322`. Fix: escape/neutralize fence + `system:` leaders in untrusted values, add anti-injection directive, cap length, pass prospect text as separate turn. Conf: Med.
- **LLM2** [High] **Pricing table wrong** (billing/accounting): `pricing.ts:8-12` prices `claude-opus-4-7` at $15/$75 (auditor says correct is $5/$25 → 3x over-count on every draft+critic); `claude-haiku-4-5` $0.8/$4 (auditor says $1/$5); unknown model → silent `usd:0` (`:26-30`). Corrupts `daily_usage.anthropic_spend_usd` shown in admin + weekly digest. **⚠ VERIFY prices against claude-api reference before fixing.** Fix: correct values + warn on unknown model. Conf: High (that it's wrong); prices TBD-verify.
- **LLM3** [High] No per-user daily spend cap enforced anywhere: `anthropicSpendUsd`/`messagesGenerated` only written+SUMmed for reporting, never read/compared to a limit before generation. Each `generateChatMessage` = up to ~7 Opus/Sonnet calls ×5 retries. `routes/generateMessage.ts:230-253`; callers `manualContactPrepare.ts:196`, `followupMessageService.ts:180`. Fix: pre-check today's spend → 429 `daily_cap_exceeded`. Conf: High.
- **LLM4** [High] `isOrgNamePlausible` no-op copy-paste bug: `orgLower.includes(origLower) || origLower.includes(origLower)` — 2nd clause is orig∈orig = always true → plausibility gate ("prevents Astrum→VK misidentification") always passes → wrong company's prospects contacted. `opusRescue.ts:548-552`. Fix: 2nd clause → `origLower.includes(orgLower)`. One-token change. Conf: High.
- **LLM5** [Med] Deprecated dated model IDs: `llmValidator.ts:44` `claude-sonnet-4-20250514` (auditor: retires 2026-06-15, BEFORE today 2026-07-03 → likely 404 now, silently degrades org-validation to null); `opusRescue.ts:39` `claude-opus-4-1-20250805` (retires ~2026-08-05). **⚠ VERIFY retirement dates + correct replacement IDs via claude-api reference.** Also newer models reject `temperature` param (400) — naive swap breaks. Conf: Med.
- **LLM6** [Med] Grounding check `detectUngroundedClaims` uses `groundText.includes(m)` → `"2000".includes("200")` true → fabricated stats pass the anti-hallucination gate. `messageGenerator.ts:398-462`. Fix: numeric-token set membership. Conf: Med.
- **LLM7** [Med] Retry helper: unknown non-network error defaults retryable (`:61`), no jitter (thundering herd), budget checked before sleep. `anthropicRetry.ts:38-116`. Fix: ±20% jitter, default unknown→non-retryable, clamp sleep to budget. Conf: High.
- **LLM8** [Med] generateMessage persists message+spend+action-log as 3 non-atomic awaits → 500-after-persist, retry double-charges, or lost spend. `routes/generateMessage.ts:217-270`. Fix: transaction + best-effort action-log. Conf: Med.
- Lows: log says "Sonnet 4.6" but draft uses opus-4-7 (`messageGenerator.ts:1026`); opusRescue spins own Anthropic client (maxRetries:2, bypasses central retry) + no `pause_turn` handling.

### Auditor 4 — Follow-ups / scheduling / notifications (returned)
- Context: scheduler started in-process (`index.ts:26`) AND standalone cron (`scripts/sendFollowupDigests.ts`) both call `runFollowupDigests`; markers written AFTER send; default tz Asia/Jerusalem (DST).
- **FUP1** [High] Daily digest gate `hour === digestHourLocal` on drift-prone hourly setInterval (start+30s, then 3.6M ms). If an hour gets zero ticks (restart/drift/blocked loop) the digest is **silently skipped that day** — worst failure for a followup tool; marker only prevents re-send, never triggers missed. `followupDigest.ts:44,136`; same in `pushoverSchedule.ts:52`. Fix: `hour >= digestHourLocal` (marker guarantees at-most-once). Conf: High.
- **FUP2** [High] Overdue Pushover **double-sent**: `sendOverdueEscalations()` called from BOTH `pushoverDigest.ts:198` and `pushoverNudges.ts:278`, launched concurrently via `Promise.all` (`digestScheduler.ts:17-23`); dedup is check-then-insert TOCTOU → two priority-1 (quiet-hours-bypassing) buzzes per overdue followup at weekday noon. Fix: call from one place + atomic claim (insert-first w/ unique constraint). Conf: High.
- **FUP3** [High] No pre-send claim/lock: "already sent?" is SELECT-before-send, marker after; only protection is process-local `running` bool — doesn't cover the cron script co-running or a 2nd instance. Two runners both pass check + both send. `followupDigest.ts:140-166`, `pushoverDigest.ts:127-179`, `weeklyDigest.ts:128-168`. Fix: atomic `UPDATE daily_usage SET digest_sent=true WHERE …AND digest_sent=false RETURNING`, send only if claimed. Conf: Med.
- **FUP4** [Med] Weekly digest double-sends every Friday for non-UTC tz: `weekKey` from UTC date flips mid-Jerusalem-Friday (03:00 IDT) → two different keys same local Friday → 2nd email. `weeklyDigest.ts:30-51,110,128`. Fix: derive weekKey in user tz. Conf: High.
- **FUP5** [Med] `scheduleFollowupsAfterFirstSend`: existence check filters by channel but unique index is `(prospectId, stage)` only → prospect sequenced on channel A blocks channel B inserts (silently `onConflictDoNothing`) yet `scheduled++` still increments → 2nd-channel sequences never created + inflated counts. `followupScheduler.ts:39-83`; `followups.ts:38-41`. Fix: index `(prospectId, channel, stage)` [migration] or remove misleading channel filter + fix count. Conf: Med.
- **FUP6** [Med] `runFollowupDigests` has no `isSmtpConfigured()` short-circuit (unlike weekly/pushover) → throws per-user every hour when SMTP unset (log noise, misleading `usersFailed`). `followupDigest.ts:93`. Fix: guard at top. Conf: High.
- **FUP7** [Med] `generateScheduledTime` computes window in **server-local** tz not rep tz; Zod refine only checks `sendHourEnd>sendHourStart` when both in same PATCH → patching start alone → negative range → hour NaN/negative → `toISOString()` throws uncaught in seeding loop. `timingEngine.ts:54-65`; `sequenceConfig.ts:63-75`. Fix: user-tz math + clamp/refine vs stored row. Conf: Med.
- **FUP8** [Med] Pushover batch fixed `Etc/GMT-2` while quiet-hours + day-checks use DST-aware `digestTimezone` → noon batch fires 13:00 Israel summer; drift vs quiet-hours boundary. `pushoverSchedule.ts:2`. Fix: single tz basis. Conf: Med.
- **FUP9** [Low-Med] Open-link generation failure → silent redirect to /contacts (no error); due query omits `generatedMessage IS NOT NULL` despite docstring → dead-end CTAs in digest. `followupOpen.ts:84-117`; `followupDigest.ts:112-119`. Fix: add isNotNull filter or real error page. Conf: Med.
- **FUP10** [Low-Med] Open/confirm tokens replayable full 14-day TTL, not invalidated on use (overlaps API5). HMAC itself sound; no open-redirect (targets from DB); `Referrer-Policy:no-referrer` set (good). Fix: shorter TTL / one-time confirm nonce. Conf: Med.
- **FUP11** [Low] Invalid IANA tz string silently → `isDigestHourNow` returns true / quiet-hours falls to UTC; only validated as string.min(1).max(50). Fix: validate against `Intl.supportedValuesOf('timeZone')`. Conf: High.
- Lows: unused imports (`isNotNull` followupDigest, `gte` pushoverNudges); `timingEngine.ts:58` minute=floor(rand*46) never 46-59; `pushoverDueNotifier.ts` dead stub; `followupDigest.ts:88-91` stale docstring.

### Auditor 7 — Dashboard frontend (returned)
- Verified clean: AuthGate gates all non-/login routes (queries only mount when authenticated); **no XSS** (only dangerouslySetInnerHTML is dev-controlled chart CSS); admin page fails closed client-side.
- **FE1** [High] Seeder research-complete effect fires save PATCH repeatedly: `updateMutation` in deps + `.mutate()` flips isPending → new identity → re-run while guard still true (stage flips only in async onSuccess) → many concurrent PATCH writes. `pages/seeder.tsx:98-121`. Fix: `useRef` latch or `if(isPending)return` or save in SSE result path. Conf: High.
- **FE2** [High] Settings forms overwrite saved data on load failure: `getUserPreferences` no isError branch; on failed GET local state stays defaults, Save enabled → posts nulls → wipes prefs. Same in PushoverSettings. `UserPreferencesPanel.tsx:32-91,170`; `PushoverSettings.tsx:26-77,156`. Fix: isError UI + gate Save on `!prefs.data`. Conf: High.
- **FE3** [Med] Today "All" tab: `isError = wa.isError && tg.isError` → single-channel failure hidden → SDR thinks channel empty. `today.tsx:168-173`. Fix: warn if either errors. Conf: High.
- **FE4** [Med] Bulk "Open all" swallows per-send failures (`onError:()=>resolve()`), toasts pre-loop count regardless; `window.open` after await+timer → popup-blocked tabs 2..N. `today.tsx:303-339`. Fix: real counts + sync open. Conf: Med.
- **FE5** [Med] SequenceConfig error state unreachable: `isLoading||!form` skeleton guard before `isError` block → permanent skeleton on load failure. `SequenceConfigPanel.tsx:151-170`. Fix: move isError above guard. Conf: High.
- **FE6** [Med] Prospect outcome buttons prepend `[Outcome:…]` to contextNotes non-idempotently → accumulate/contradict + pollute message-gen context. `prospect-detail.tsx:119-147,388-405`. Fix: strip prior outcome / dedicated field. Conf: Med.
- **FE7** [Med] Hand-written `lib/api/{notification-settings,test-channel,manual-ingest}.ts` duplicate generated api-client-react hooks (byte-identical now, will drift). Fix: adopt generated hooks, delete dupes. Conf: High/Med.
- **FE8** [Med] No sign-out anywhere + signed-in identity never shown; generated `useLogout` unused. `components/layout.tsx`. Fix: sidebar account block + Sign out. Conf: High. (also QoL)
- **FE9** [Med] Prospect list rows onClick-navigate but no role/tabIndex/onKeyDown → keyboard-inaccessible (WCAG 2.1.1). `ProspectsListTable.tsx:154-167`. Conf: High.
- **FE10** [Med] Contacts opens confirm dialog even when `window.open` popup blocked (result ignored) → mis-recorded sends. `contacts.tsx:104-110` (prospect-detail/table do it right). Fix: check window ref. Conf: High.
- **FE11** [Med] BulkPreviewGrid active toggle uses interpolated Tailwind `border-[${VAR}]` → JIT never compiles → selected product barely visible. `BulkPreviewGrid.tsx:345-349`. Fix: literal classes. Conf: High.
- **FE12** [Med] Prospect search fires backend query every keystroke (no debounce). `ProspectsListFilters.tsx:81-88`. Fix: 300ms debounce (reset page 1). Conf: High.
- **FE13** [Med] MessageReview local edits silently discarded on Done (send uses server body). `MessageReview.tsx:35-95`; `seeder.tsx:270-273`. Fix: persist or confirm-on-edit. Conf: Med.
- **FE14** [Med] Research "Cancel" → Keep working leaves stream idle + stage still "research" → blank dead-end (only escape = Abandon paid draft). `seeder.tsx:216-219`. Conf: Med.
- **FE15** [Med] CandidateGrid select-all counts non-selectable existing-prospect rows (selectable ignores existingProspectId) → header overcounts. `CandidateGrid.tsx:83-108`. Fix: exclude existingProspectId. Conf: High.
- Lows: raw `<a>` in-app nav → full reload (today.tsx:409, seeder.tsx:380); SSE not closed on `result` (sse.ts:94-115); `calendarLink.ts:10-15` unguarded `new Date` → RangeError; ApolloPicker `?? ""` fallback never fires (use `||`); not-found.tsx hardcoded gray (dark-mode broken) + dev copy; `xlsx` CVE-2023-30533/CVE-2024-22363 (verify pinned version); many a11y label gaps; index-keyed editable lists; outcomeMutation doesn't invalidate prospects-list.

### UX / ORGANIZATION observations (feed nice-to-haves)
1. Placeholder pages leak scaffold copy ("Coming soon… Phase 1 scaffold", "Coming in ticket 2.6") — activity.tsx, followups.tsx, prospect/telegram.tsx. 2. Unify cache-refresh (manual refetch vs invalidation). 3. Standardize error-toast styling (destructive vs normal). 4. Centralize brand colors into theme tokens (hardcoded #4FFFE3/#00F5D4 inline, light/dark breaks). 5. Wire `messageLint.ts` char-limit into MessageReview (imported nowhere). 6. Per-item mutation pending state (global isPending disables all cards). 7. De-dup copy-pasted regex/displayName/back-link. 8. Layout sidebar footer = home for account/identity+sign-out. 9. Inline form validation feedback in bulk/URL flows. 10. Per-field copy buttons + keyboard-shortcut help overlay.

---
## ALL 8 AUDITORS COMPLETE. Consolidation + triage below.

---

## Fix log

### Batch A.1 (typecheck PASS)
- **API1** [High] FIXED: scoped `recordSendIntent` followups update by owner via `EXISTS(prospects WHERE id=followups.prospect_id AND user_id=userId)` in `channels/whatsapp.ts` + `channels/telegram.ts`. Closes IDOR.
- **LLM2** [High] FIXED: `lib/pricing.ts` corrected opus-4-7 $15/$75→$5/$25 (verified vs Claude API ref), haiku-4-5 $0.8/$4→$1/$5; added opus-4-8/sonnet-5 + legacy snapshot entries; unknown model now `console.warn`s instead of silent $0.
- **CH1** [High] FIXED: `channels/telegram.ts generateLink` now `encodeURIComponent`s the handle path segment + normalizes phone to `+digits`. Neutralizes URL injection / dropped-body.
- **CH3** [Med] FIXED: `routes/whatsappLink.ts` send-intent dispatch now explicit whatsapp/telegram; teams/slack → 501 instead of mislogged as whatsapp.

*(each applied fix recorded here: finding id, files, health-probe result)*

### Batch B.1 — LLM5 model migration (typecheck PASS + LIVE-VERIFIED)
- **LLM5** [High, was URGENT] FIXED + live-tested. Retired/deprecated model IDs migrated:
  - `llmValidator.ts` `VALIDATOR_MODEL`: `claude-sonnet-4-20250514` (retired 2026-06-15 → 404) → **`claude-sonnet-5`**.
  - `opusRescue.ts` `OPUS_MODEL`: `claude-opus-4-1-20250805` (deprecated, retires 2026-08-05) → **`claude-opus-4-8`**; web_search tool `web_search_20250305` → **`web_search_20260209`** (dynamic filtering, supported on Opus 4.8).
  - **Shared caller fix** (`companyResolver.ts`): added exported `modelRejectsSamplingParams()` + `modelDefaultsAdaptiveThinking()`. `defaultLLMCaller` now omits `temperature` for Opus 4.7/4.8/Sonnet 5/Fable 5 (they 400 on non-default sampling) and sends `thinking:{type:"disabled"}` for Sonnet 5 (adaptive is on-by-omission and would exhaust the validator's 250-tok budget → truncated JSON). `opusRescue`'s own caller reuses the exported predicate to drop `temperature` on Opus 4.8. `resolveCompany` (still Sonnet 4.6) is unaffected — 4.6 keeps `temperature`.
  - Pricing already covered (LLM2 added sonnet-5 $3/$15 + opus-4-8 $5/$25); legacy IDs left in table for historical accounting.
  - **Live smoke test (real API, throwaway script, removed):** Validator→sonnet-5 returned valid JSON, matched "Block, Inc." high-conf, 70 out-tok (thinking-off held budget); OpusRescue→opus-4-8 no-search returned 5 strategies; OpusRescue→opus-4-8 + web_search_20260209 returned 5 strategies, `searched=true`. No 400/404 on any path.
  - Removed from GATED list.

### Batch B.2 — LLM3 per-user daily spend cap (typecheck PASS)
- **LLM3** [High] FIXED. New `lib/llmSpendCap.ts`: `dailyLlmSpendCapUsd()` (env `LLM_DAILY_SPEND_CAP_USD`, null/disabled when unset/≤0), `todaysLlmSpendUsd(userId)` (reads UTC daily_usage row, matching the writers' bucket), `assertUnderDailyLlmCap(userId)` throwing `DailyLlmCapExceededError`. Pre-check wired into all three generation entry points BEFORE spend: `routes/generateMessage.ts` (before generate), `services/manualContactPrepare.ts` (after ownership, before research+generate — both billed), `services/followupMessageService.ts` (after cached-message short-circuit, before generate). Central mapping added to `app.ts` terminal handler → **429 `daily_cap_exceeded`** `{spentUsd, capUsd}` (Express 5 forwards async throws). Documented in `.env.example`. Cap OFF by default (no behavior change until env set). Gating decision table verified (unset/invalid/zero/negative→disabled; at/over cap→block; under/fresh→allow). Best-effort pre-check (not a transactional reservation) — noted inline; acceptable for a cost guardrail.

---

## Fixes applied (all typecheck-green; commits on `audit/godlike-fixes`)

f1ff6b0 — API1 IDOR scoping, LLM2 pricing, CH1 telegram encoding, CH3 dispatch
d3149e2 — LLM4 org-plausibility bug, API6 CSV injection, CH7 null-phone, FUP1 hour-gate, FUP6 SMTP guard
0d71600 — API2 error handler, BUILD1 gitignore secrets, BUILD4 .bak removal, BUILD5 zip untrack, BUILD6 workspace glob

## GATED / DEFERRED (not auto-applied — reason each)

- **LLM1** [Critical] Prompt injection — needs prompt-hardening (fence-escape untrusted prospect text + anti-injection directive). Prompt-behavioral change; do with an eval pass.
- **LLM3** [High] No per-user daily spend cap — add env-gated pre-check in generateMessage + callers.
### Batch B.3 — APO1/API3 Apollo reveal cap enforcement (typecheck PASS)
- **APO1/API3** [High] FIXED. New `lib/apolloRevealCap.ts` centralizes the cap (`apolloMonthlyRevealCap()`, default 100 / env `APOLLO_MONTHLY_REVEAL_CAP`), `monthBoundsUtc()`, `monthlyApolloRevealsUsed(userId)`, and `assertUnderApolloRevealCap(userId)` throwing `ApolloRevealCapExceededError`. Pre-check wired BEFORE the credit spend in both reveal routes: `/apollo/reveal` (before `revealContact`) and `/apollo/request-phone-reveal` (before the async Apollo POST). Central mapping in `app.ts` → **429 `apollo_reveal_cap_exceeded`** `{used, cap}`. `routes/userExtras.ts` `/users/me/apollo-usage` refactored to consume the same shared helpers (removes the duplicated cap+month math → reporting and enforcement can't drift; pruned now-dead drizzle/dailyUsage imports). Env documented in `.env.example`. Note: the always-on default of 100 makes the *already-advertised* cap real (not a new limit). Search-credit routes (`/apollo/search-org`,`/search-people`) remain unlimited — different credit dimension with no counter; left as a smaller residual (API3 remainder) needing its own counter+limiter.

### (was gated)
- ~~**APO1/API3** enforce in the reveal transaction~~ — DONE above (B.3).
- **APO2** [High] AbortSignal not threaded into findOrg/collectContacts — broad mechanical change; reference impl in dead `subsidiaryExpander.ts`.
- **DB1** [High] test/live DB behind migrations — add vitest globalSetup + apply 0008-0010 (mutates dev DB).
- **DB2** [High] plaintext secrets (refresh/bot tokens, magic-link token) — needs KMS/app-key + data migration + auth-code changes.
- **DB3/DB4/DB5** — snapshot-chain rebuild; FK covering-index migration; channel-aware partial-unique dedupe migration (all need new migrations + DB apply).
- **FUP2/FUP3/FUP4** [High] scheduler double-send / atomic claim / weekly-Friday tz — correctness-sensitive; needs the atomic-claim refactor + tz test.
- **Frontend FE1/FE2/FE5/FE10/FE11/FE12/FE15 + a11y/lows** — surgical, low-risk but numerous; batch with a UI pass.
- **BUILD2** replit.md rewrite; **BUILD3** source-code mirror re-sync; **attached_assets** untrack (109 files) — doc/mirror hygiene.

## Confidence

Godlike convergence NOT claimed (per the rubric's no-false-convergence rule): a full multi-package codebase cannot reach 3-clean-round convergence in one session, and several high-severity items are gated pending live verification / DB access / product decisions. **Confidence in the applied fixes: high** (each verified against source + typecheck-green, low blast radius). Residual risk concentrated in the GATED list above. Resume point = this file + branch commits.

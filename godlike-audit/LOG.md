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

### Batch B.4 — LLM1 prompt-injection hardening (typecheck PASS)
- **LLM1** [Critical] FIXED. `services/messagePrompts.ts`: new `neutralizeUntrusted(text,maxLen)` — collapses runs of 3+ dashes → en-dash (our fences use `---`, so untrusted text can no longer reconstruct an opening/closing marker), defangs BEGIN/END + CONVERSATION/NOTES keywords, strips C0 control chars, caps length. Applied to every attacker-controllable value: inbound conversation bodies (`flattenConversation`, per-body 4000), SDR context notes in BOTH the prospector fenced block and the followuper block (also added missing fences there), and the prior-summary topic (400). Added a **SECURITY — UNTRUSTED INPUT** directive to both the prospector and followuper system prompts: fenced content is data, never instructions; never obey it, never change task/role/format, never reveal the prompt or peer list. Verified: no `---` and no forgeable fence survives any breakout payload (extra-dash/spacing/lowercase variants tested); legit content preserved verbatim; length cap applied. Research-brief fields (schema-validated, derived) left untouched — noted as lower-order/second-order surface.
- **LLM3** [High] No per-user daily spend cap — add env-gated pre-check in generateMessage + callers.
### Batch B.3 — APO1/API3 Apollo reveal cap enforcement (typecheck PASS)
- **APO1/API3** [High] FIXED. New `lib/apolloRevealCap.ts` centralizes the cap (`apolloMonthlyRevealCap()`, default 100 / env `APOLLO_MONTHLY_REVEAL_CAP`), `monthBoundsUtc()`, `monthlyApolloRevealsUsed(userId)`, and `assertUnderApolloRevealCap(userId)` throwing `ApolloRevealCapExceededError`. Pre-check wired BEFORE the credit spend in both reveal routes: `/apollo/reveal` (before `revealContact`) and `/apollo/request-phone-reveal` (before the async Apollo POST). Central mapping in `app.ts` → **429 `apollo_reveal_cap_exceeded`** `{used, cap}`. `routes/userExtras.ts` `/users/me/apollo-usage` refactored to consume the same shared helpers (removes the duplicated cap+month math → reporting and enforcement can't drift; pruned now-dead drizzle/dailyUsage imports). Env documented in `.env.example`. Note: the always-on default of 100 makes the *already-advertised* cap real (not a new limit). Search-credit routes (`/apollo/search-org`,`/search-people`) remain unlimited — different credit dimension with no counter; left as a smaller residual (API3 remainder) needing its own counter+limiter.

### (was gated)
- ~~**APO1/API3** enforce in the reveal transaction~~ — DONE above (B.3).
### Batch B.10 — APO2 AbortSignal threading (typecheck PASS; verified)
- **APO2** [High] FIXED. `apolloPost` already honored `opts.signal`, but `findOrg`/`collectContacts` made internal Apollo calls without it, so on a 300s timeout `ctrl.abort()` couldn't stop the in-flight cascade (credits spent minutes after 504). Threaded an optional trailing `signal?: AbortSignal` through the whole discovery call graph: `orgFinder` (`enrichOrgByDomain`, `searchOrgByNameValidated`, `searchOrgByNameNoDomain`, `maybeUpgradeToParent`, `findOrg` — signal on every apolloPost + top-level abort guard + `if (signal?.aborted) break` in the alt-domain and search-query loops) and `contactCollector` (`apolloPeopleSearch`, `enrichPerson`, `processPeople`, `collectContacts` — signal on all 5 apolloPost calls + people-loop break + early-return guard mirroring the existing empty-result shape). Orchestrator now passes `input.signal` to `findOrg` (Step 2 + rescue loop) and `collectContacts` (Step 5 + Phase-3 subsidiary loop). **Client-close abort** added: `routes/prospector.ts` wires `req.on("close", () => ctrl.abort())` alongside the existing discovery-timeout controller. Optional trailing param → zero behavior change when omitted. Verified live: a pre-aborted signal makes `findOrg`/`collectContacts` return immediately (org=null/none, 0 contacts, 0 phases) with **zero** apolloPost calls (test needed no Apollo key → proves no call fired). (`subsidiaryExpander.ts` remains the dead reference impl; not wired.)
### Batch B.9 — DB4 + DB1 + DB3 (APPLIED to dev DB + verified)
- **DB4** [Med] FIXED & APPLIED. Added `index()` entries for all uncovered FKs (`prospects.campaign_id`; `action_logs.prospect_id`/`followup_id`; `conversations.source_followup_id`; `magic_link_tokens.user_id`; `oauth_nonces.user_id`) + authored migration `0011_fk_covering_indexes.sql` (`CREATE INDEX IF NOT EXISTS`) + journal entry idx 11. Applied to the dev DB; verified all 6 indexes present in `pg_indexes`.
- **DB1** [High] FIXED & APPLIED. Root cause confirmed live: `drizzle.__drizzle_migrations` recorded only 0000–0006, yet the DB already had a 0007 column (`manual_ingest_channels`) while 0008–0010 columns were absent — a half-applied, unrecorded drift (this is also DB3's live symptom). Made migrations 0007–0010 idempotent (`ADD COLUMN IF NOT EXISTS`) so re-running reconciles without collision; ran `migrate` → DB now at head (12 recorded, columns verified). Added a vitest **`globalSetup`** (`src/test/globalSetup.ts` + `vitest.config.ts`) that migrates before the suite so the DB tests are self-healing. **Baseline-failing `@workspace/db` test suite now PASSES (3/3)** — was red on `column "pushover_user_key" does not exist`.
- **DB3** [Med] partially resolved: the practical apply-time symptom (drift/collision) is fixed via idempotent migrations. The deeper drizzle-kit concern remains — `meta/` snapshots still only cover 0000–0007, so a future `drizzle-kit generate` will diff against 0007 and re-emit ADD COLUMN/CREATE INDEX for 0008–0011; those are now idempotent (harmless if applied) but the snapshots should be rebuilt/re-baselined for clean generation. Left as residual (needs drizzle-kit + care).
### Batch B.14 — DB2 plaintext secrets (assessed; live part FIXED + verified)
- **DB2** [High] — reassessed against actual usage, then partially fixed:
  - **`oauth_nonces.nonce`** (the ONLY actively-used secret): FIXED. `routes/google-auth.ts` now stores `sha256(state)` and looks up by the same digest on callback (the raw `state` still round-trips through Google). Keyless one-way hash — no KMS needed. Verified live: only the digest is persisted, hash-lookup finds the row, and the raw state neither appears in the DB nor matches a lookup (a DB-read attacker can't forge a callback state).
  - **`users.microsoft_refresh_token` / `users.slack_bot_token`**: NOT a live risk — grep shows **zero reads/writes** anywhere (Teams/Slack OAuth is unimplemented; adapters 501 per CH4). No secrets are stored in these columns today. Envelope-encrypting empty columns now is premature; the correct fix is to add encryption **when** that OAuth is wired — and that genuinely requires a **KMS/app-key decision** (key storage, rotation). **RESIDUAL — needs a product/infra decision; do it with the Teams/Slack feature.**
  - **`magic_link_tokens.token`**: dead schema — **zero references** in the codebase (auth is Google-OAuth-only). The raw-token risk is purely theoretical (nothing writes or reads it). **RESIDUAL — wire-securely-or-drop the unused table (hash on write if it's ever used).**
- **DB3/DB4/DB5** — snapshot-chain rebuild; FK covering-index migration; channel-aware partial-unique dedupe migration (all need new migrations + DB apply).
### Batch B.5 — FUP2 + FUP4 scheduler double-send (typecheck PASS; verified)
- **FUP2** [High] FIXED (code-only, no migration). `sendOverdueEscalations()` was invoked by BOTH `runPushoverNudges` and `runPushoverDigests`, which run concurrently in the scheduler's `Promise.all` → two priority-1 (quiet-hours-bypassing) pushes per overdue followup. Removed the call (and the now-unused `escalationsSent` field + import) from `pushoverDigest.ts`; escalations now have a single owner (`runPushoverNudges`). Confirmed no external reader of `pushoverResult.escalationsSent` (only `nudgeResult.escalationsSent` is read by the scheduler).
- **FUP4** [High] FIXED (code-only). Weekly-digest dedup key was UTC-derived (`${startUtc}_${endUtc}`) and flipped at UTC midnight — mid-Friday for tz east of UTC — so a Jerusalem user emailed at 01:00 IDT got a different key at 04:00 IDT and was emailed twice. New `weekKeyForTimezone()` keys on the local calendar date (en-CA `YYYY-MM-DD` in the user's tz), stable across the whole local Friday; computed per-user inside the loop. Verified: at 01:00 vs 04:00 IDT on one local Friday the new key is identical (`2026-07-03`) while the old key differed. Stats window/label left UTC (approximate, cosmetic).
- **FUP5** FIXED in B.11 (channel-aware unique index migration 0012, applied). **FUP3** FIXED in B.12 (atomic claim, below).

### Batch B.12 — FUP3 atomic digest claim (typecheck PASS; DB-verified)
- **FUP3** [High] FIXED for the two daily_usage-backed digests (code-only — `digest_sent`/`pushover_sent` already exist). Converted `followupDigest.ts` + `pushoverDigest.ts` from check-then-send-then-mark (TOCTOU) to an atomic claim BEFORE send: `INSERT … ON CONFLICT DO UPDATE SET <sent>=true WHERE <sent>=false RETURNING` — exactly one runner (in-process scheduler OR standalone cron) wins, the loser skips. On send failure the claim is RELEASED so a later tick retries (hour-gate is `>=` from FUP1). Verified live: two concurrent claims → one winner; post-claim attempt loses. Removed the redundant post-send marker. weeklyDigest not converted (dedups via action_logs JSON, would need a partial-unique-index migration; FUP4 already fixed its actual double-send — residual is the theoretical once/week race).

### Batch B.7 — Frontend High fixes FE1 + FE2 (dashboard typecheck PASS)
- **FE2** [High] FIXED in `components/accounts/UserPreferencesPanel.tsx` + `components/PushoverSettings.tsx`: on a failed settings GET the form sat at empty defaults with Save still enabled (gated only on `isLoading`), so a click PATCHed nulls over the user's real prefs/pushover key. Save now also disabled on `isError || !data`, plus an inline error banner with a Retry (refetch) button.
- **FE1** [High] FIXED in `pages/seeder.tsx`: added a `briefSavedForRef` latch so the research-complete → save-brief effect fires exactly once per prospect. Previously `updateMutation`'s identity flipped on `isPending` and re-ran the effect while the `stage==="research"` guard was still true (stage only flips in async `onSuccess`) → a storm of concurrent PATCHes. Latch resets on error to allow retry.
### Batch B.8 — Frontend Med fixes FE5/FE10/FE11/FE12/FE15 (dashboard typecheck PASS)
- **FE5** [Med] `components/followup/SequenceConfigPanel.tsx`: moved the `isError` branch ABOVE the `isLoading || !form` skeleton guard — on load failure `form` stays null so the skeleton rendered forever and the error state was unreachable.
- **FE10** [Med] `pages/contacts.tsx`: capture the `window.open` ref; if the popup is blocked (null), toast + return instead of opening the confirm dialog / recording a pending send for a chat the user never saw (mirrors prospect-detail/table).
- **FE11** [Med] `components/followup/BulkPreviewGrid.tsx`: replaced runtime-interpolated Tailwind arbitrary values (`border-[${VAR}]` — never seen by the JIT scanner, so uncompiled → selected ticker had no highlight) with inline `style` for the active brand colors; hover uses a static `hover:border-ring`. Removed the now-dead `IGNITE_BORDER_HOVER`.
- **FE12** [Med] `components/prospects-list/ProspectsListFilters.tsx`: debounced the free-text search (local state for responsive typing; committed `search` param fires 300ms after the last keystroke; resets to page 1 via existing patch). No more backend query per keystroke.
- **FE15** [Med] `components/whatsapp-bulk/CandidateGrid.tsx`: `selectable` now also excludes already-imported rows (`existingProspectId == null`), so "select all" and the header count match `selectedCandidates` (which already excluded them) — no more overcount / selecting non-revealable rows.
- a11y lows (keyboard nav on list rows, label gaps, etc.) — deferred as polish; not correctness.
### Batch B.6 — BUILD2 + BUILD3 doc/mirror hygiene
- **BUILD3** FIXED. Re-ran `scripts/sync-source-code.sh` → `source-code/` mirror refreshed (was stale by 54 files incl. all B.x fixes + prior drift). Kept it tracked (it's a Replit "view source" export the sync/watch scripts maintain — didn't unilaterally untrack a possible feature; noted that untrack+gitignore is the alternative if the mirror isn't needed).
- **BUILD2** FIXED. Rewrote `replit.md`: removed the false "Phase 1 scaffold / no business logic" narrative; Stack now React **19.1** (was 18), lists LLM/Apollo/4 channel adapters/digests/Pushover; DB section lists **9** tables (added `campaigns`) + migrations 0000–0010 with the DB1/DB3 audit caveat; Secrets section lists the actually-used env vars incl. the new `LLM_DAILY_SPEND_CAP_USD` / `APOLLO_MONTHLY_REVEAL_CAP`; added pointer to `audit/godlike-fixes` + this log. (attached_assets untrack — 109 files — left for the user; large tracked-asset removal is a judgment call, not audit-critical.)

## Confidence

Godlike convergence NOT claimed (per the rubric's no-false-convergence rule): a full multi-package codebase cannot reach 3-clean-round convergence in one session. **Confidence in the applied fixes: high** — each verified against source, full workspace typecheck-green, and (where a live path exists) exercised against the real API/DB. Low blast radius throughout.

## Batch B — GATED list fully worked through (session 2)

Every item from the original GATED/DEFERRED list is now resolved or precisely characterized. Green bar: full-workspace `pnpm run typecheck` PASS; `@workspace/db` test suite PASS 3/3 (was RED at baseline). Dev DB migrated to head (0013).

**Applied + verified (High/Critical):** LLM5 (model IDs, live-tested), LLM1 (prompt-injection hardening), LLM3 (daily spend cap), APO1/API3 (reveal cap), APO2 (AbortSignal, abort-verified), DB1 (migrate-to-head + globalSetup; failing test now green), FUP2/FUP3/FUP4/FUP5 (double-send: atomic claim DB-verified, tz key, channel index), DB2-live (nonce hashing, verified).
**Applied + verified (Med):** DB4 (FK indexes), DB5 (identity partial-unique indexes), FE1/FE2/FE5/FE10/FE11/FE12/FE15, BUILD2/BUILD3.

**True residuals (documented, not silently dropped):**
1. **DB2 token encryption** — `microsoft_refresh_token`/`slack_bot_token` are currently UNUSED (Teams/Slack OAuth unimplemented). Encrypt when that feature ships; needs a **KMS/app-key decision**.
2. **magic_link_tokens** — dead schema (zero refs); wire-securely-or-drop.
3. **weeklyDigest cross-process atomic claim** — FUP4 fixed the real double-send; the theoretical once/week cross-process race needs an `action_logs` partial-unique-index migration.
4. **DB3 snapshot rebuild** — practically mitigated (idempotent migrations applied cleanly); `meta/` snapshots (0000–0007) should be rebuilt for clean future `drizzle-kit generate`.
5. **Un-triaged Med/Low findings BELOW the gated line** (never in the gated set): LLM6 (grounding substring), LLM7 (retry jitter), LLM8 (generateMessage non-atomic persist), CH2/CH4/CH5/CH6, API4/API5/API7/API8, APO3/APO4/APO5/APO6/APO7, DB6/DB7, FE3/FE4/FE6–FE9/FE13/FE14, and a11y polish. Each is recorded in the findings ledger above; none are High/Critical.

Resume point = this file + branch commits (`git log audit/godlike-fixes`).

---

## Session 3 — clearing the Med/Low pile (residual #5)

Working through the un-triaged Med/Low findings below the gated line. Same
methodology: fix → full-workspace `pnpm run typecheck` → commit per subsystem
batch. Product-decision items (CH5, APO3, APO5) flagged, not guessed.

### Batch B.15 — LLM Med residuals (typecheck PASS)
- **LLM6** [Med] FIXED — was NOT actually fixed (the comment block had been
  rewritten to describe token membership, but the code still used
  `groundText.includes()`). `services/messageGenerator.ts detectUngroundedClaims`
  now builds a `Set` of grounded numeric tokens (`\d+(?:\.\d+)?`) and checks
  **exact token membership** for percentages / large numbers / bounded claims.
  Closes the false-negative where a fabricated `200` passed because the brief
  said `2000` (`"2000".includes("200")` was true).
- **LLM7** [Med] FIXED — `services/anthropicRetry.ts`: (1) unknown non-APIError
  with no network signature now defaults **non-retryable** (was retryable → burnt
  the whole backoff budget on unfixable bugs); (2) **±20% jitter** on the backoff
  (Retry-After hints jittered upward-only so we never undercut the server's ask
  → no thundering herd); (3) sleep **clamped to remaining budget** so we never
  sleep past the cap only to fail the budget check next iteration.
- **LLM8** [Med] FIXED — `routes/generateMessage.ts`: the prospect-body write and
  the `daily_usage` spend/counter increment are now in a single `db.transaction`
  (all-or-nothing) so a 500 between them can't charge-without-persist or (on
  retry) double-charge. Success action-log moved outside the tx as best-effort
  `.catch()` (audit metadata must not roll back committed spend), mirroring the
  failure-path log.

### Batch B.16 — Channels Med/Low residuals (typecheck PASS)
- **CH2** [Med] FIXED — invalid-phone *format* no longer reports as `geo_blocked`.
  New `InvalidPhoneError` in `services/channels/whatsapp.ts`; `generateLink` throws
  it (not `GeoGateBlockedError`) on E.164 failure (the geo gate is disabled, so an
  `isAllowedPhone` miss is always a format problem). Terminal handler (`app.ts`)
  maps it → **422 `invalid_phone`**; the two user-facing deep-link routes
  (`whatsappLink.ts`, `followups.ts`) also branch on it explicitly. `GeoGateBlockedError`
  kept for the apollo reveal path (`services/apollo.ts:706`, = APO3) and future geo.
  `detectCountry` import in whatsapp.ts pruned (now unused). `testChannelLink` pre-
  validates with PHONE_RE so it never hits the throw; `manualContactPrepare`'s catch
  is a passthrough → flows to the terminal handler.
- **CH4** [Med] FIXED — new `services/channels/errors.ts` `ChannelNotImplementedError`
  (own module to avoid a cycle through `channels/index.ts`); Teams/Slack stubs throw
  it instead of an untyped `Error`; terminal handler maps → **501 `channel_not_implemented`**
  `{channel}`. (send-intent route already returned 501 for teams/slack via CH3; this
  covers the latent `getChannelAdapter` path too.)
- **CH6** [Low] FIXED — `lib/verticalClassifier.ts` Pass-1 now tokenizes labels+subject
  on non-alphanumeric runs and matches whole tokens (`gaming`/`cps`/`fintech` exact,
  `retarget` prefix) instead of raw `.includes()`, so short codes no longer false-fire
  inside longer words. `gaming_ua`-style labels still split and match.
- **CH5** [Low] FLAGGED (product decision) — Telegram `t.me/<user>?text=` prefill for
  non-bot handles is a behavioral question; needs product confirmation, not a code fix.

### Batch B.17 — API Med/Low residuals (typecheck PASS)
- **API4** [Med] FIXED — `routes/researchStream.ts` (billed Opus SSE): (1) **daily
  LLM spend cap** pre-check (`assertUnderDailyLlmCap`, reuses LLM3) BEFORE flushing
  SSE headers so an over-cap request gets a clean **429 `daily_cap_exceeded`** JSON
  (once headers flush we can only emit SSE); (2) **per-user concurrency limiter**
  (process-local Map, max 3 concurrent streams/user → **429 `too_many_streams`**,
  slot released in a `finally`); (3) **sanitized error event** — only curated
  `ResearchFailedError` messages reach the client; anything else → generic
  "Research failed. Please try again." with full detail kept in the server log.
- **API5** [Med] FIXED (TTL part) — `lib/followupLinkToken.ts` default TTL **14d → 72h**
  (env `FOLLOWUP_LINK_TTL_HOURS`). Safe because every digest send (email/pushover/
  nudge) re-mints a fresh token, so an expiring link is superseded by the next digest;
  72h spans a weekend if a daily digest is missed once. Cuts the `?t=` query-string
  replay window ~4.7×. Single-use/invalidate-on-confirm nonce left as a documented
  sub-residual (needs a per-followup nonce column + migration; must not break
  legitimate re-opens).
- **API7** [Low] FIXED (BE+FE) — `routes/notificationSettings.ts` GET+PATCH no longer
  return the raw `pushoverUserKey`, only `pushoverUserKeyMasked`. FE coupling handled:
  `lib/api/notification-settings.ts` type drops the raw field; `PushoverSettings.tsx`
  removes the raw-key pre-fill effect (input now behaves like a password field — blank
  = "no change") and closes the resulting footgun (blank input + Save would have PATCHed
  null → wiped the key): Save is disabled while blank and `handleSave` no-ops on blank;
  clearing stays on the explicit **Disable** button.
- **API8** [Low] FIXED — `routes/prospects.ts statusSqlFilter` now mirrors
  `computeProspectStatus`'s identity logic: `phone-pending` also requires a null
  `telegramHandle`; `ready`/`draft` accept `phone OR telegramHandle`. Telegram-only
  prospects no longer get list badges that contradict the active filter.

### Batch B.18 — Apollo Med/Low residuals (typecheck PASS)
- **APO6** [Low] FIXED — `services/prospectResearch.ts researchProspect` takes an
  optional trailing `signal?: AbortSignal` and passes it as the `messages.create`
  request option; `routes/researchStream.ts` creates an `AbortController` and calls
  `ctrl.abort()` in the existing client-disconnect handler. The Opus research call is
  now cancelled on disconnect instead of running to completion and discarding a paid
  result. Optional param → zero behavior change when omitted (mirrors APO2).
- **APO7** [Low] FIXED — `services/apollo.ts requestPhoneReveal` (async path) commits
  the `pending` status + `apolloRevealsUsed +1` BEFORE the Apollo POST (so a webhook
  always finds a correlationId). Previously a POST 4xx left an over-count + a prospect
  stuck `pending` until the 72h sweep. Now: on a **definitive client error**
  (`ApolloApiError` 4xx or `ApolloAuthError` — no reveal, no credit) a compensating
  transaction restores the captured prior status, clears the correlationId/requestedAt,
  and decrements the counter (`GREATEST(...-1, 0)`), then rethrows. 5xx/network/rate-
  limit left as-is (uncertain acceptance → sweep reconciles). Rollback is best-effort
  (bare catch, matching the sync path's bookkeeping style). Sync `/apollo/reveal` path
  was already correct (increments only after success / on geo-block).
- **APO3** [Med] FLAGGED (product decision) — geo-gate leftover marks legit revealed
  phones `blocked` AFTER the 8-credit reveal. The auditor's own fix ("normalize to
  E.164 / store raw / distinguish unparseable from geo_blocked") is explicitly "needs
  product call". Not guessed.
- **APO4** [Med] FLAGGED — two sub-parts, both needing a decision: (a) reveal counter
  "weight by credits" is a **product-semantics** question — the cap is named/defaulted
  as *reveals* (100) and counts 1/reveal *consistently*; whether it should instead be a
  *credit* budget is a product call, not a bug. (b) webhook replay-protection needs a
  **timestamp Apollo may not send** (auditor hedged "if available") — can't be done
  reliably without confirming the payload. Left as documented residuals.
- **APO5** [Med] FLAGGED — CallBudget precision (services reporting real per-call counts
  + in-loop budget checks) is a larger discovery-orchestrator refactor; deferred, not a
  quick residual.

### Batch B.19 — DB Med residuals (typecheck PASS)
- **DB6** [Med] FIXED (comment) — verified `0006_extend_stage_timing_with_doctrine_variant.sql`
  only `ALTER COLUMN stage_timing SET DEFAULT ...` (new rows) with **no UPDATE**, so
  pre-0006 users' `stage_timing` jsonb lacks `doctrineVariant`. The schema comment in
  `lib/db/src/schema/users.ts` falsely claimed 0006 backfilled existing rows; corrected
  to state the truth — the field is safe only because the type is optional and reads fall
  back to `defaultVariantForStage`. Chose the comment fix over a JSON-mutating backfill
  migration: the field is non-crashing with a robust default, and rewriting every user's
  sequence-config JSON carries more risk than value. (A backfill remains an option if a
  future feature needs the field materialized.)
- **DB7** [Med] FLAGGED (cross-cutting, do as its own verified change) — daily_usage.date
  is bucketed **UTC** (`toISOString().slice(0,10)`) at ~6 sites (`generateMessage`,
  `apollo` reveal ×2, async `requestPhoneReveal`, `manualContactPrepare`) and read by the
  daily LLM spend cap (`llmSpendCap`) while digests/quiet-hours run in the user's
  `digestTimezone` — so caps reset ~02:00–03:00 local and a local day straddles two rows.
  It is internally CONSISTENT today (all-UTC). Converting to user-tz must move **every**
  writer AND reader atomically to a shared `usageBucketDate(userTimezone)` (each write
  site needs the per-user tz), and daily_usage.date also keys the FUP3 digest atomic
  claim — a partial conversion silently corrupts spend/cap accounting. Too high-stakes to
  bundle; left as a documented residual with this exact plan. Not a crash — a reset-timing
  nuance.

### Batch B.20 — Frontend Med residuals, part 1 (dashboard typecheck PASS)
- **FE3** [Med] FIXED — `pages/today.tsx`: the "All" tab computed `isError` as
  `waQuery.isError && tgQuery.isError`, hiding a single-channel failure (SDR reads an
  empty WhatsApp column as "nobody due"). Added `partialErrorChannel` (exactly one
  channel errored) and an amber `role="alert"` banner with Retry that renders above the
  queue WITHOUT blanking the channel that loaded. `isError` stays the both-failed hard state.
- **FE4** [Med] FIXED — `pages/today.tsx handleBulkOpen`: was reporting the pre-loop
  count as if all sends succeeded and swallowing per-send failures. Now tracks real
  `openedCount`/`blockedCount`/`failedCount`, captures the `window.open` handle to detect
  browser pop-up blocking (the root cause of the "sync open" note — each open runs after
  an async per-send mutation, outside the click gesture, so tabs 2..N get blocked), and
  reports honest counts. Only enters the "did you send these?" confirm flow when
  `openedCount > 0` (was recording sends for chats that never opened), and surfaces
  pop-up-blocked with actionable guidance.
- **FE6** [Med] FIXED — `pages/prospect-detail.tsx outcomeMutation`: prepended
  `[Outcome: …]` unconditionally, so re-clicking or switching outcomes accumulated
  contradictory `"[Outcome: no response] [Outcome: worked] …"` chains that also polluted
  message-gen context. Now strips any prior leading outcome marker(s)
  (`/^(?:\s*\[Outcome:[^\]]*\]\s*)+/`) before prepending — idempotent and switch-safe.
- **FE14** [Med] FIXED — `pages/seeder.tsx handleResearchCancel`: no longer calls
  `research.cancel()` — it only opens the confirm dialog. Killing the stream before the
  user confirmed left `stage="research"` with a dead idle stream on "Keep working" (blank
  dead-end). The stream now keeps running so "Keep working" resumes seamlessly (no
  re-incurred cost); `handleAbandon` remains the single teardown path (`research.reset()`
  + delete + back to form).

### Batch B.21 — Frontend Med residuals, part 2 (dashboard typecheck PASS)
- **FE8** [Med] FIXED — `components/layout.tsx`: added a sidebar footer account block
  (name/email from `useCurrentUser` → generated `/api/auth/me`) and a **Sign out** button
  wired to the generated `useLogout` mutation. `handleSignOut` clears the react-query cache
  and routes to `/login` on settle (leave regardless of outcome; AuthGate re-verifies).
  Previously there was no sign-out anywhere and the signed-in identity was never shown.
- **FE9** [Med] FIXED — `components/prospects-list/ProspectsListTable.tsx ProspectRow`:
  rows navigated on click but were keyboard-inaccessible (WCAG 2.1.1). Added
  `role="button"`, `tabIndex={0}`, an `aria-label`, a focus-visible ring, and an
  `onKeyDown` (Enter/Space → navigate) that ignores keys targeting controls inside action
  cells (`e.target !== e.currentTarget`).
- **FE13** [Med] FIXED (persist, not just confirm) — `components/seeder/MessageReview.tsx`
  + `pages/seeder.tsx`: manual body edits were silently discarded on Done (the send flow
  uses the server's `first_message_body`). The stale comment claimed PATCH couldn't accept
  it, but the route DOES (`prospects.ts:317/737`, edit-message-capability). `onDone` now
  passes the edited body; `handleMessageDone` PATCHes `firstMessageBody` when it changed
  from the generated text (with a save spinner + error toast that keeps the SDR on the
  review). Banner changed from "not persisted" to "saved when you click Done"; stale doc
  corrected.
- **FE7** [Med] FLAGGED (refactor, entangled with API7) — the hand-written
  `lib/api/{notification-settings,test-channel,manual-ingest}.ts` duplicate generated
  api-client-react hooks (a maintainability/drift item, not a correctness bug). Adopting
  the *current* generated hooks would REINTRODUCE the raw `pushoverUserKey` field that
  API7 just removed from `NotificationSettings` — so this must be done together with
  regenerating the api-spec to reflect the masked-only contract (a codegen toolchain step,
  out of scope for a code batch). Left as a documented residual with that dependency noted.

## Session 3 — Med/Low pile worked through (summary)

The entire un-triaged Med/Low pile below the old gated line (residual #5) is now
resolved or precisely characterized. Green bar held after every batch: full-workspace
`pnpm run typecheck` PASS; no new typecheck errors introduced. Seven batches, all on
`audit/godlike-fixes`.

**Applied + verified (typecheck-green each batch):**
- **LLM:** LLM6 (token-grounding, closes the substring false-negative), LLM7 (retry
  jitter + unknown→non-retryable + budget-clamped sleep), LLM8 (atomic message+spend).
- **Channels:** CH2 (`InvalidPhoneError`→422), CH4 (`ChannelNotImplementedError`→501),
  CH6 (token-match verticals).
- **API:** API4 (SSE spend-cap + per-user concurrency limiter + sanitized errors),
  API5 (link TTL 14d→72h), API7 (mask pushover key, BE+FE, footgun closed),
  API8 (telegram-aware status filter).
- **Apollo:** APO6 (abort research on disconnect), APO7 (compensating rollback on 4xx reveal).
- **DB:** DB6 (corrected the false doctrineVariant backfill comment).
- **Frontend:** FE3 (all-tab partial-error banner), FE4 (honest bulk-open counts +
  popup-block detection), FE6 (idempotent outcome notes), FE8 (sign-out + identity),
  FE9 (keyboard-accessible rows), FE13 (persist manual message edits), FE14 (research-
  cancel dead-end).

**Flagged (documented, not guessed) — need a product/infra/codegen decision:**
- **CH5** — Telegram non-bot-handle prefill (behavioral; product confirm).
- **APO3** — geo-gate E.164 normalize vs store-raw (auditor itself said "needs product call").
- **APO4** — reveal counter "weight by credits" (cap = reveals vs credits is product
  semantics; counter is internally consistent) + webhook replay needs an Apollo timestamp
  that may not exist.
- **APO5** — CallBudget precision (discovery-orchestrator refactor).
- **DB7** — daily_usage UTC→user-tz bucket: cross-cutting across ~6 writers + the cap
  readers + the FUP3 digest claim key; must convert atomically or corrupt accounting.
  Precise plan recorded. Not a crash.
- **FE7** — adopt generated api hooks / delete hand-written dupes; entangled with the
  API7 masked-only contract → needs api-spec regeneration first.

**Carried residuals from session 2 (unchanged):** DB2 token encryption (unused cols;
KMS decision), magic_link_tokens (dead schema), weeklyDigest cross-process claim,
DB3 snapshot rebuild.

Resume point = this file + branch commits (`git log audit/godlike-fixes`).

---

## Session 4 — completing the flagged residuals

User asked to finish everything remaining. Each item taken with a clear correct path;
a safe reversible default applied where a full product/infra decision is genuinely
required (and called out). Typecheck green after each; migrations applied to the dev DB
and verified.

### APO3 — geo-gate no longer drops paid reveals as "geo_blocked" (typecheck PASS)
The gate is disabled, so `!isAllowedPhone(phone)` was a pure FORMAT check, yet both reveal
paths marked legitimately-revealed phones `blocked` and discarded them AFTER the 8-credit
reveal. Fix: new `geoGate.normalizeToE164()` (tidies Apollo numbers missing `+` / with
spaces·dashes·parens / `00` prefix). Sync `revealContact` normalizes the returned phone
instead of throwing `GeoGateBlockedError`; the async webhook normalizes the extracted phone,
folds a genuinely-unparseable value into `no_match` (distinct `reason:"unparseable_phone"`,
NOT geo), and the block branch now gates on GEOGRAPHY (`isAllowedCountry`, currently
always-true) rather than format. Removed the now-dead `GeoGateBlockedError` import from
apollo.ts. Paid phones are kept + normalized (also satisfies CH2's E.164 expectation
downstream).

### DB7 — daily LLM spend cap buckets by the user's local day (typecheck PASS)
De-risking insight: daily_usage counters are INDEPENDENT — each row's `date` is one value,
but each counter is written+read by its own group, so a group can be converted atomically
without touching the others. Converted the **LLM daily-spend-cap group** fully: shared
`lib/usageBucket.ts usageBucketDate(tz)` (en-CA `YYYY-MM-DD` in the user's `digestTimezone`,
UTC fallback on bad tz, never throws) used by all three writers (`generateMessage`,
`manualContactPrepare`, `followupMessageService`) AND the reader (`llmSpendCap`). Added
`digestTimezone` to `req.user` (auth middleware select + type) so the route writer needs no
extra query; the two service writers read it from their already-loaded user row. Cap resets
at the user's midnight now, not ~02:00–03:00 local. **Deliberately left UTC (documented in
usageBucket.ts):** Apollo reveal counter (MONTHLY cap → negligible nuance) and messages_sent
(no cap). Verified helper format + tz + garbage-tz fallback at runtime.

### weeklyDigest cross-process atomic claim (migration 0014; applied + verified)
Replaced the check-then-send TOCTOU with an atomic claim: partial unique index
`action_logs_weekly_digest_week_uq` on `(user_id, (metadata->>'weekKey')) WHERE
action_type='digest.weekly_sent'` (added to the schema + hand-authored 0014, which
first dedups any pre-existing duplicate markers so the index can build). `weeklyDigest.ts`
now inserts the marker BEFORE sending (`onConflictDoNothing().returning()`); an empty
return means another runner won the week → skip. On send failure the claim is deleted so a
later run retries. Applied to dev DB; index present; db tests 3/3.

### magic_link_tokens dropped (migration 0015; applied + verified)
Dead schema — zero code refs repo-wide (auth is Google-OAuth-only), so the raw-token
column was pure attack surface. Hand-authored `0015_drop_magic_link_tokens.sql`
(`DROP TABLE IF EXISTS`), removed the schema file + index export. Applied; `to_regclass`
confirms the table is gone; db tests 3/3.

### DB3 — latest drizzle snapshot rebuilt (generate is clean again)
Ran `drizzle-kit generate` once (it dumped 0007→current as a bogus 0016 because meta/
stopped at 0007) purely to capture the accurate current-schema snapshot it produced;
promoted that to `meta/0015_snapshot.json` (baseline for the last real migration), deleted
the bogus 0016 SQL + journal entry. **Verified:** a follow-up `drizzle-kit generate` now
reports "No schema changes, nothing to migrate" — future generation diffs correctly instead
of re-emitting 0008–0015. Intermediate 0008–0014 snapshots intentionally NOT reconstructed
(neither `generate` nor `migrate` reads them; `migrate` uses journal + SQL hashes). migrate
to head + db tests 3/3 still green.

### FE7 — API contract corrected + client regenerated (wrapper-rewire deferred)
Root drift source was the spec: `openapi.yaml`'s `NotificationSettings` RESPONSE schema still
declared the raw `pushoverUserKey`, so the generated type carried it (contradicting API7).
Removed it from the response schema (kept in `NotificationSettingsPatch` to SET a key) and
re-ran `orval` codegen — the generated `NotificationSettings` type is now masked-only, matching
the hand-written client (drift + latent raw-key leak in the contract resolved; typecheck:libs
green). The physical dedup (delete hand-written `lib/api/{notification-settings,test-channel}.ts`
+ rewire their 1 consumer each to generated hooks) is DEFERRED: pure plumbing with no behavior
change, and the runtime bits (queryKey/invalidation shapes) can't be verified without running
the dashboard in a browser. `manual-ingest` is NOT a generated-hook duplicate (6 consumers, no
generated equivalent) — out of scope.

### Genuinely blocked / infeasible-as-specified (documented, not guessed)
- **APO5 (CallBudget precision):** the cap is a *documented, intentional* coarse stop-loss —
  services are internally bounded by zod limits, so no true runaway; the imprecision is only
  in calls made INSIDE findOrg/collectContacts (bumped post-hoc by flat estimates). A precise
  fix must thread the budget through the whole Apollo cascade (mirroring APO2's signal
  threading — ~9 functions), bump per real `apolloPost`, check in each loop, drop the flat
  estimates, AND re-tune `DEFAULT_APOLLO_CALL_BUDGET` (it changes discovery REACH). That's a
  credit-spend + product-tuning change I can't validate without a live Apollo key; a
  half-measure would alter reach unverified. Precise plan recorded here; left for Apollo-
  integration-tested work.
- **APO4 (webhook replay):** infeasible AS SPECIFIED — `apolloWebhookSecurity.ts`'s own docs
  state Apollo doesn't commit to a signing scheme across plan tiers, so there is NO timestamp
  to bind. Practical exposure is already low: the terminal-state guard makes reprocessing a
  completed reveal idempotent, the correlationId is unguessable CSPRNG and never logged, and the
  reveal counter is incremented at REQUEST time (not webhook time) so replay can't inflate
  credits. Residual (bearer-fallback has no body binding; `expired`→`arrived` re-promotion is
  replayable-but-benign) is inherent to Apollo's signing limits.
- **APO4 (counter weight):** reveals-vs-credits is a PRODUCT-semantics decision (the counter is
  internally consistent at 1/reveal, cap named/defaulted as "reveals"). Not a bug to guess at.
- **DB2 (token encryption):** `microsoft_refresh_token`/`slack_bot_token` remain UNUSED (Teams/
  Slack OAuth unimplemented). Encrypting empty columns is premature and the correct design needs
  a KMS/app-key decision — do it WHEN that OAuth ships. (magic_link_tokens, the other DB2 arm,
  is now dropped.)
- **CH5 (Telegram non-bot prefill):** behavioral/product question, not a code fix.

## Session 4 — summary

Of the items flagged for a decision, **6 completed** (APO3, DB7-LLM-group, weeklyDigest,
magic_link drop, DB3 snapshot, FE7 contract) — all typecheck-green, migrations applied to the
dev DB and verified, db tests 3/3. **5 documented as genuinely blocked or infeasible-as-specified**
with precise rationale + plans (APO5, APO4-replay, APO4-counter, DB2, CH5). No guesses on
credit-spend, product-semantics, or KMS decisions.

---

## Session 5 — clearing the deferred items (user: "deal with all of it")

User asked to resolve everything still open, with decisions delegated ("you decide" /
"I trust your decision") plus explicit choices on DB2 (leave until feature) and CH5 (copy
fallback), and confirmed an Apollo key is available. Typecheck green after each; the two
migration/DB items already covered.

### APO5 — discovery call-budget is now a REAL per-call ceiling (verified, no credits burned)
The old flat post-hoc estimates let a step entering at limit-1 run a whole service (5–100+
Apollo calls) before the "hard cap" registered. Fix: `apolloPost` self-counts against a
per-request budget and returns `null` (no request, no key needed) once exhausted — callers
already treat null as "no data" and stop. The budget is scoped via **AsyncLocalStorage**
(`apolloBudgetStore`, orchestrator uses `enterWith`), so EVERY apolloPost in the run —
orchestrator inline + all findOrg/collectContacts internals — self-counts with zero
signature threading. Removed the flat `CALL_ESTIMATE` bumps/constants; `budget.count()` is
now exact. Verified via a throwaway test (no credits): a pre-exhausted/at-limit budget
blocks apolloPost with 0 calls, and ALS propagates through awaited helpers (what the cascade
relies on). **NOTE:** `DEFAULT_APOLLO_CALL_BUDGET` was tuned against the old estimates — with
exact counting the effective reach may shift; worth re-checking against real run counts.

### APO4 — replay now app-level single-consume + counter semantics documented
- **Replay** (was "infeasible — no Apollo timestamp"): solved app-side WITHOUT a timestamp.
  The webhook now clears `phoneRevealCorrelationId` on every HARD terminal (arrived/no_match/
  blocked), so a replayed delivery (HMAC or bearer) finds no correlation match and no-ops —
  strict single-consume. The sweep leaves the token on the SOFT `expired` state, so legit late
  arrivals still promote (and then burn the token). Closes both replay surfaces the auditor
  flagged (expired→arrived re-promotion; bearer-fallback replay).
- **Counter** (decided: reveal QUOTA): kept 1-per-reveal — correct `apollo_reveals_used`
  column + reporting semantics; documented 1 reveal ≈ 8 credits + `APOLLO_CREDITS_PER_PHONE_REVEAL`
  so operators can reason in credits without overloading the counter into a credit budget.

### CH5 — Telegram plain-handle copy-message fallback (decided: add fallback)
`t.me/<handle>?text=` often doesn't prefill the composer for plain user handles. On the two
primary send paths (`today.tsx handleSend`, `ChannelFollowupPage`), opening Telegram now copies
the message to the clipboard and toasts a paste-if-empty note. Additive, no downside.

### DB2 — leave until the feature ships (decided)
`microsoft_refresh_token`/`slack_bot_token` stay as-is: no secret is stored today (Teams/Slack
OAuth unimplemented), so there's nothing to protect; encryption + a KMS/key decision belong with
that feature. (The other DB2 arm, `magic_link_tokens`, was already dropped in Session 4.)

### FE7 — spec fixed (Session 4); component rewire correctly NOT adopted
Investigated the wrapper-rewire: the generated client's `ApiError` exposes `.status`/`.data`,
NOT the `.code` the UI displays, and the app deliberately keeps its own `apiFetch` (with `.code`)
for non-auth endpoints. So the hand-written wrappers are NOT true duplicates — adopting the
generated client would silently degrade error messages. Kept the wrappers; the Session-4 spec fix
(generated `NotificationSettings` type now masked-only) already removes the real drift/leak concern.

## Session 5 — summary

Everything deferred is now resolved. **APO5** (real per-call budget ceiling, ALS-scoped, verified),
**APO4 replay** (app-level single-consume — solved without the Apollo timestamp that doesn't exist),
**APO4 counter** (reveal-quota, documented), **CH5** (copy fallback), **DB2** (leave-until-feature per
decision), **FE7** (spec fixed; rewire correctly declined on error-contract grounds). No open audit
items remain that don't require net-new product features (Teams/Slack OAuth) or live Apollo re-tuning
(the APO5 budget number). Green bar throughout; APO4 anti-replay + APO5 ceiling verified against the DB
and in isolation.

---

## Session 6 — "do everything doable except the Slack/Teams thing"

User asked to finish everything actionable, explicitly EXCLUDING the DB2 token-encryption arm
(`microsoft_refresh_token`/`slack_bot_token` — deferred until Teams/Slack OAuth ships, per the
Session-5 decision). An Apollo key + Anthropic key are both present in this environment, so the
one item previously blocked on "live Apollo re-tuning" (the APO5 budget number) became doable.

### BUILD (new, found during verification) — `pnpm run build` was broken outside the Replit wrapper
Verifying the "green bar" beyond typecheck surfaced a real failure: `pnpm run build` (the command
`replit.md` documents) **failed** in any environment without `PORT` set. `artifacts/dashboard/vite.config.ts`
threw `PORT`/`BASE_PATH` "required" at config-LOAD time, but `PORT` is only consumed by the dev
`server`/`preview` blocks — never by `vite build`. Production deploys pass because the dashboard
artifact's `[services.env]` injects `PORT=23183`/`BASE_PATH=/`, but a bare workspace-root build (CI,
local, the documented command) died before Vite could distinguish build from serve. FIXED: switched to
Vite's config-function form `defineConfig(async ({ command }) => …)` and enforce `PORT` + the `BASE_PATH`
throw only when `command === "serve"`; `base` still reads `BASE_PATH ?? "/"` (identical to what production
sets), so build output is unchanged and dev/preview strictness is preserved. Verified: bare
`pnpm --filter @workspace/dashboard run build` succeeds; full root `pnpm run build` now **exits 0**
(api-server + dashboard) — previously exit 1. (Typecheck was always green; only the production build was
broken, which is why prior sessions' typecheck-only bar missed it.)

### APO5 — budget number re-checked against a real run; kept 80, made env-tunable
Prior sessions implemented the exact per-call ceiling but flagged the *number* 80 for "re-check against
real run counts." Done:
- **Analytical:** the removed flat estimates were `FIND_ORG_CALL_ESTIMATE=5`, `COLLECT_CONTACTS_CALL_ESTIMATE=20`,
  `SUBSIDIARY_COLLECT_CALL_ESTIMATE=10`. The `collectContacts` estimate (20) **under-counted** its real
  cost (per-page search + up to 3 enrich calls per email-less person, ×25/page ×3 tiers ×3 pages) — the very
  "illusory cap" the APO5 fix named. So exact counting did NOT shrink typical reach; it only tightened the
  *runaway* path (which the old estimate let escape past 80 real calls). Typical successful discoveries were
  always well under 80 either way.
- **Empirical anchor (one live run, minimal spend — domain-seeded strict path, rescue+subsidiary disabled):**
  Stripe discovery → `status=success, apolloCallsConsumed=14, budgetExhausted=false, contacts=6`. A full
  successful discovery uses **~14 real calls**, so 80 is ~5.7× headroom.
- **Decision:** keep the default at **80** (no reach loss, caps the enrichment runaway) rather than guess a
  new hardcoded number that would need a live Apollo tuning campaign to validate. Instead made it
  **env-tunable**: `DEFAULT_APOLLO_CALL_BUDGET` → `defaultApolloCallBudget()` reading `APOLLO_CALL_BUDGET`
  (default 80, clamped to the same `[10,200]` as the per-request `apolloCallBudget` override), mirroring the
  `APOLLO_MONTHLY_REVEAL_CAP` pattern — operators re-tune from production `apolloCallsConsumed` telemetry
  without a deploy. Documented in `.env.example`.
- **Doc bug fixed:** the comment above the `CallBudget` class still described the removed
  "APPROXIMATE … bump by a conservative estimate" behavior — rewritten to state it's now an exact
  ALS-scoped per-call meter.

### Explicitly NOT done (per user)
- **DB2 token encryption** (Slack/Teams) — excluded by the user; unchanged, still correctly deferred to
  when that OAuth ships (columns are unused today).

### Green bar (stronger than prior sessions)
- Full-workspace `pnpm run build` → **exit 0** (typecheck + api-server esbuild + dashboard vite build).
- `@workspace/db` tests → **3/3 PASS** (globalSetup migrates to head).
The throwaway APO5 probe script was removed. No open audit items remain except the two that genuinely
need a net-new feature (Teams/Slack OAuth → DB2 encryption) or ongoing production telemetry (APO5 number,
now operator-tunable via env).

---

## Session 7 — SECOND GODLIKE PASS (2026-07-08)

Re-audited the delta since session 6 (features F-E bulk phone-seed + F-C Teams/Slack removal, and the
FE contract fixes) with 8 parallel read-only subsystem auditors, triple-framed, blast-radius per finding.
Full finding-by-finding ledger + triage + per-batch fix log: **`godlike-audit/PASS2-LEDGER.md`**.

- **Found:** 1 Critical, 5 High, ~15 Med, long Low/trivia tail. Several corroborated by 2–3 auditors
  independently (the 23505 cluster; the zombie-teams/slack-followups issue).
- **Fixed:** 8 serial batches, full `pnpm run build` + `@workspace/db` tests green after each. Commits
  `71083bf` (batch1) → `88600e1` (batch8), mirror re-sync `4aee64d`, all on `audit/godlike-fixes`.
- **Headline:** F1 (Critical) — `followups.sent_at` was written nowhere, so every followup a rep sent
  stayed "due" forever (re-digested, re-escalated priority-1, re-served with duplicate outreach);
  recordSendIntent now stamps sentAt + status='sent'. L1 (High) — prospector LLM endpoints ran
  uncapped and unrecorded (unbounded spend); P1 (High) — webhook phone-promote lost 8-credit reveals
  on shared numbers; C1 (High) — digit strings were stored as telegram handles, corrupting phone-only
  bulk pastes.
- **Residuals** (documented, reason each): P2a/P2b abort-threading (bounded blast), C4 direct-API bulk
  400, L9 fable-5 thinking param (latent/env), L11 dead summarizer, harmless dead-code (GeoGate catches,
  ManualContactsSection). Prod action pending: run
  `godlike-audit/prod-cancel-legacy-channel-followups.sql` (dev has zero such rows).

**Godlike convergence NOT claimed** (per the rubric's no-false-convergence rule): a full multi-package
codebase cannot reach 3-consecutive-clean-round convergence in one session, and the deferred residuals
above are honest open items. **Confidence in the applied fixes: high** — each verified against source,
full-workspace build-green + db-tests-green after every batch, low blast radius throughout.

---

## Feature audit — LinkedIn in manual ingest (scoped) — 2026-07-09

**Scope:** the LinkedIn-in-manual-ingest change (12 files: `routes/prospects.ts`,
`routes/testChannelLink.ts`, `services/channels/linkedin.ts`, + 9 dashboard files).
Method: 4 parallel read-only auditors (correctness / security / blast-radius / FE-UX),
triple-framed, each finding carrying severity + blast radius + fix + confidence, then
serial auto-fix with a typecheck probe after each batch. Both packages typecheck-green.

### Findings & disposition
- **C1** [Med-High] FIXED — `channels/linkedin.ts` `generateLink` did NO canonicalization →
  trailing-slash / `?trk=` query / case / locale-subdomain (`il.linkedin.com`) variants
  each stored a distinct `linkedin_url`, defeating `prospects_user_linkedin_unique` →
  **duplicate prospect + double outreach**. New `canonicalizeLinkedinUrl()` collapses all
  cosmetic variants to one string (verified: 11 variants → 1 canonical). Blast: all linkedin
  ingest, single + bulk + within-batch. Conf: High.
- **C2** [Med] FIXED — `/in/<slug>/` round-tripped to a broken `…/in/slug%2F`; a pre-encoded
  slug double-encoded. Canonicalizer strips trailing slash + decode-then-encode (idempotent).
- **S1** [Med] FIXED — `generateLink` returned any `https?://` verbatim and generic
  `PATCH /prospects` `linkedinUrl:.url()` accepted any host; that value flows to a server-side
  `res.redirect(302)` (`followupOpen.ts:126`) + `window.open` → **open-redirect on trusted
  origin**. Fix: canonicalizer enforces linkedin.com host (non-linkedin → null → safe
  fallback); schema `.refine()` restricts host at the write door. Verified: `linkedin.com.evil.com`,
  `linkedin.com@evil.com`, `evil.linkedin.com.attacker.com` all → null. Conf: High.
- **U1** [Low-Med] FIXED — bulk grid placeholder `linkedin.com/in/yaronk` was itself an invalid
  value; resolved by U3 (scheme-less now accepted).
- **U2** [Low-Med] FIXED — LinkedIn headerless-CSV detection used a loose slug regex → a
  non-aliased header row imported as junk data. Now requires a URL/path shape
  (`linkedinLooksLikeUrl`).
- **U3** [Low] FIXED — scheme-less `linkedin.com/in/x` (common paste) was rejected; FE+BE
  validators now accept optional scheme. Added `maxLength=300` to the single-add input to
  match the BE cap (was FE-valid / BE-400 at >300).

### Verified SAFE (no action)
Subdomain regex not bypassable; no XSS (linkedin_url rendered as escaped text only); no IDOR
(dedupe SELECT + insert userId-scoped); no ReDoS; 64→300 cap safe (text columns, regex-gated);
enum widening additive; downstream (computeProspectStatus / manualContactPrepare / followup
scheduler / digest due-queries / list filter) already LinkedIn-aware.

### Deferred (separate surface — NOT auto-fixed)
- **P1** [Med] The general Prospects **list/detail** pages (`ProspectsListTable.tsx`,
  `prospect-detail.tsx`) hardcode wa/telegram → a linkedin prospect shows a dead disabled
  "Open (linkedin)" button. NOT a clean mirror: needs a new `GET /prospects/:id/linkedin-link`
  BE endpoint (none exists) + `getChannelLink` wiring + clipboard-copy branches on both pages.
  Different surface from the Contacts "menu" this change targeted; LinkedIn contacts remain
  fully sendable from **Contacts** and **Today**. Awaiting product go-ahead.

**Confidence: high** on the applied fixes (canonicalizer unit-verified for dedup/security/
idempotency; both packages typecheck-green). Low blast radius. P1 is the one honest open item.

---

## P1 follow-up — LinkedIn "Open" on Prospects list/detail + audit — 2026-07-09

**Change:** new BE `GET /prospects/:id/linkedin-link` (mirrors telegram-link) + FE
`getLinkedinLink`/`getChannelLink` wiring + LinkedIn send on prospect-detail and the
prospects-list ActionButton. Method: 2 parallel read-only auditors (correctness+blast-radius,
security+UX-parity). Both packages typecheck-green.

### Findings & disposition
- **P1-F1** [High] FIXED — prospect-detail.tsx has its OWN frontend `computeStatus` that was
  never made LinkedIn-aware (`!p.phone && !p.telegramHandle → "phone-pending"`), so a linkedin
  prospect could never reach `"ready"` → the new "Open LinkedIn" button never rendered AND the
  badge wrongly read "Phone pending", while the LIST (server status) worked. Half-wired
  inconsistency. Fix: added `&& !p.linkedinUrl`, mirroring the BE computeProspectStatus. Conf: High.
- **P1-F2** [Med] FIXED (scope-adjacent) — seeder.tsx `handleOpenInChannel` still hardcoded
  telegram/whatsapp → a linkedin prospect was mis-routed to a WhatsApp deep link AND recorded a
  **whatsapp send-intent for a linkedin prospect** (corrupt analytics, à la the original CH3), and
  linkedin's non-prefill link opened an empty composer with no clipboard copy. Fix: linkedin-aware
  channel + clipboard-copy of the message + correct label. Now all four "open in channel"
  surfaces (contacts/today/detail/list) + seeder are consistent.
- **P1-F3** [Low] NOT FIXED (parity, not a regression) — `no_linkedin_identifier`/
  `no_message_generated` 409s surface as raw error codes in the toast, identical to the existing
  `no_telegram_identifier` handling and unreachable on the happy path (button only renders when
  server status is "ready"). Left as pre-existing UX debt.

### Verified SAFE
New endpoint is requireAuth + userId-scoped (no cross-tenant linkedin_url/body read; 404 on
foreign id); returned url host-enforced via canonicalizeLinkedinUrl (poisoned linkedin_url →
linkedin.com fallback, not off-origin/js:); url/body only reach window.open + clipboard (no XSS);
getChannelLink/useChannelLink type widening is a pure superset — every caller (seeder, detail,
list) still assignable, no exhaustiveness gap; route is mounted (routes/index.ts → /api).
Post-fix sweep: zero remaining `=== "telegram" ? … : "whatsapp"` defaults or `linkedinUrl`-omitting
status checks in the dashboard.

**Confidence: high.** Both packages typecheck-green. The one High (dead detail button) is fixed
and re-swept.

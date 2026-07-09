# Investigation — digest 404, manual-ingest doctrine, digest buttons, reminder-schedule config

**Date:** 2026-07-09 · **Branch:** audit/godlike-fixes · **App:** chat-followuper.replit.app
**Durable record** (SSH-drop safe). Method: 3 parallel read-only code-trace agents + direct grep.

---

## 1. The 404 on "Send test digest email" — ROOT CAUSE FOUND + FIXED

**Bug:** FE/BE path mismatch.
- FE posted `POST /api/users/me/test-digest` — `dashboard/src/lib/api/user-extras.ts:50`
- BE route is `POST /api/users/me/test-digest-email` — `api-server/src/routes/userExtras.ts:147` (mounted at `/api` via routes/index.ts:39)
- `test-digest` ≠ `test-digest-email` → 404.

**Fix applied:** changed the FE path to `/api/users/me/test-digest-email`
(`dashboard/src/lib/api/user-extras.ts:50`). BE returns `{ ok: true }`, matches
`TestDigestResponse`. Dashboard typecheck green.

**Side note (relevant to item 3):** the test-digest route sends a STATIC PLACEHOLDER
html (userExtras.ts:179-183), NOT the real digest render. It does not exercise the
real per-row "Follow up" buttons — so it's a preview stub, not a true dry-run of the
production digest. Consider making it render `followupDigest.renderEmail()` with sample
rows so the test actually previews the real thing.

---

## 2. Manual ingest — Doctrine-based auto-generator? YES

A manually-ingested contact's first message IS auto-generated through the SAME doctrine
pipeline as Apollo/CSV prospects.

- Create endpoint only STORES the contact (no message): `routes/prospects.ts` manual-ingest
  handler sets sourceMode='manual', vertical from ticker, firstMessageChannel, prePlatformContext.
- Generation runs on "Generate & send" → `POST /prospects/:id/prepare-first-message`
  (`routes/prepareFirstMessage.ts:31`) → `services/manualContactPrepare.ts` → research
  (`researchProspect`) then `generateChatMessage({ stage: 0 })` = prospector mode.
- Doctrine injection points:
  - Research packs (web_cps / mobile_gaming / mobile_non_gaming): `lib/doctrine/researchPrompts/*`
    via `getResearchSystemPrompt` → `getDoctrineDomain` (`lib/doctrine/taxonomy.ts:427`).
  - WHY→VALIDATION+HOW seed into writer prompt: `services/messagePrompts.ts:363`.
  - Channel register (full doctrine shape, per channel): `buildWriterRegisterBlock(channel,
    "prospector")` `messagePrompts.ts:386`; critic `:628`; defs in `lib/channelRegister.ts`
    (WhatsApp:39, Telegram:294, LinkedIn:595).
  - Doctrine-term firewall: `messageGenerator.ts:940 applyFirewall(...)`.
- Channel-specialized: YES (whatsapp/telegram/linkedin each have distinct register blocks).
- Prospector (first msg) here is stage 0; FOLLOW-UPS use followuper mode via
  `services/followupMessageService.ts` (also doctrine-grounded).
- Gaps: no non-doctrine stub path (missing context → throws MissingContextError, not a
  placeholder). Manual contacts get a COARSE default sub-vertical (ticker→web_cps/mobile
  default) via `manualContactPrepare.defaultSubVertical()` — still doctrine, but best-guess pack.

---

## 3. Digest email buttons + pre-send editing

The digest email is built in `services/followupDigest.ts:68-91 renderEmail()`. Each due row
renders EXACTLY ONE button.

### 3.1 Button linking to the relevant Chat Followuper page — **NO**
There is no link to a prospect-detail or follow-ups dashboard page. The only per-row link is
the "Follow up" button pointing at the API open endpoint:
`${base}/api/followups/open/${followupId}?t=${token}` (followupDigest.ts:72-73, 79). The only
dashboard path referenced anywhere is `/contacts`, used server-side as a redirect FALLBACK
(followupOpen.ts:22-28), never rendered in the email.

### 3.2 "Send follow-up" that auto-generates AND sends — **PARTIAL: auto-generates, does NOT auto-send**
The single "Follow up" button → `GET /api/followups/open/:id?t=<token>` (token-gated,
`followupOpen.ts:79`). On click:
1. Validates token + state (not sent/paused/replied).
2. If no message stored, GENERATES one on demand (`followupOpen.ts:89-97` →
   `followupMessageService.generateAndPersistFollowupMessage`) from doctrine (followuper mode)
   + prior conversation context (`buildConversation`, previousFollowups).
3. 302-redirects the rep into the chat app with the message PREFILLED (wa.me / t.me;
   LinkedIn = profile URL, clipboard-only). `followupOpen.ts:99-128`.
It does NOT send. The rep presses Send inside WhatsApp/Telegram ("the click is the send"
model; actual recording via `recordSendIntent` / `POST /api/followups/confirm/:id`). Digest
intro text says as much (followupDigest.ts:87,89 "You send each message yourself.").
=> There is NO true one-click auto-send anywhere. By design (manual-send product).

### 3.3 UI to ADJUST a follow-up before sending — **YES (dashboard, not email)**
`components/followup/EditFollowupDialog.tsx` — editable Textarea seeded from
`followup.generatedMessage` (`:81,171-180`), plus scheduled-time and status edits; saves via
`usePatchFollowup` PATCH (`:118,131-153`). Wired into `ChannelFollowupPage.tsx:157,482` (backs
the WhatsApp/Telegram/LinkedIn follow-up pages). Because a follow-up is only "sent" when the
rep clicks through, edits here take effect on next send. NOTE: this review/edit step is
reachable only from the dashboard — the email's "Follow up" button jumps straight to the chat
composer with no dashboard review in between.

---

## 4. Reminder-schedule configuration — exists but SCATTERED / partially missing

### What IS user-configurable today (stored on `users` table, edited via SequenceConfigPanel)
Panel: `components/followup/SequenceConfigPanel.tsx` → `PATCH /api/users/me/sequence-config`.
- Per-stage cadence min/max days — `stage_timing` jsonb (users.ts:87), panel :305-338
- Add/remove stages (1-10) / max follow-ups — `max_followups` (users.ts:97), panel :442-456
- Which weekdays follow-ups schedule on — `send_days` (users.ts:91), panel :368-388
- Send-window start/end hour (scheduled follow-ups) — `send_hour_start/end` (users.ts:95-96), panel :390-431
- **Daily email digest hour + timezone** — `digest_hour_local`/`digest_timezone` (users.ts:99-100), panel :485-510
Accounts page (`pages/accounts.tsx` → PushoverSettings + UserPreferencesPanel, which DUPLICATE
each other): Pushover user key, preferred channel, quiet-hours start/end local hour
(`pushover_quiet_hour_start/end`, users.ts:116,119).

### What is HARDCODED / NOT configurable
- Scheduler is an in-process hourly `setInterval` (`services/digestScheduler.ts:8,72`, started
  `index.ts:26`) — NO cron file anywhere.
- **Pushover reminder time-of-day = 12:00** — env `PUSHOVER_HOUR_LOCAL ?? 12`, no users column,
  no UI (`lib/pushoverSchedule.ts:16-17`). User can't change WHEN the mobile reminder fires
  (only suppress via quiet hours).
- **Pushover weekdays-only** — hardcoded (pushoverSchedule.ts:52). Can't enable weekends.
- **Pushover timezone** — global env `Etc/GMT-2` (pushoverSchedule.ts:2). Not per-user (only
  the EMAIL digest has per-user timezone).
- **Email digest days-of-week** — digest runs EVERY day; `send_days` gates follow-up SCHEDULING,
  not the digest email.
- `require_approval` toggle exists but is INERT ("Effective once the auto-send worker ships" —
  SequenceConfigPanel.tsx:462).
- `doctrineVariant` per stage stored but NOT yet consumed by the generator.

### Discoverability — POOR (this is the user's main ask)
No dedicated "Reminder schedule" nav item (`components/layout.tsx` PRIMARY/SECONDARY nav).
The important timing knobs (cadence + digest hour) hide behind a small "Sequence config"
outline button in the header of each per-channel follow-up page (`ChannelFollowupPage.tsx:338`,
`SequenceConfigPanel.tsx:114`). Pushover timing lives separately on Accounts, in TWO overlapping
panels editing the same columns. => scattered, duplicated, not conspicuous.

### Gap summary for a "super conspicuous, user-customizable" reminder schedule
- Most timing is ALREADY persisted (sequence-config) — a consolidated settings page is largely
  UI composition.
- Two real BACKEND gaps to add for full control: (a) per-user Pushover reminder hour (today
  env-global 12:00), (b) day-of-week control for reminders/digest.
- Recommended: one prominent "Reminders & schedule" settings page (nav item) consolidating
  cadence, digest time+days, pushover time+days+channel+quiet-hours; de-duplicate the two
  Accounts panels; add the two missing backend fields.

---

## STATUS
- Item 1: FIXED (404) + typecheck green.
- Items 2,3,4: investigated, findings above. No code changes requested yet for 2/3/4 —
  awaiting user direction on: test-digest real-preview, adding a page-link button to the digest,
  and building a consolidated conspicuous reminder-schedule settings page (+2 backend fields).

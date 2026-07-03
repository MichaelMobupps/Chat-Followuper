# Session Log — Manual-First Followup Tool

**Started:** 2026-07-03T07:07:13Z  
**User goal:** Transform Chat Followuper into a manual-ingest-first followup tool with scheduler emails and one-click send from email.

---

## 2026-07-03T07:07:13Z — Session start

- User authorized autonomous work with SSH-drop recovery via `.grok/logs/` + `.grok/TODO.md`.
- Prior tool calls were cancelled (user asked "all good?"); retried successfully.

## 2026-07-03T07:07:13Z — Codebase audit findings

### Already implemented (significant prior work)

1. **Manual contact ingest (BE)**
   - `POST /api/prospects/manual-ingest` — single contact (phone E.164, company, ticker, optional prePlatformContext)
   - `POST /api/prospects/manual-ingest/bulk` — up to 200 rows
   - `GET/PATCH /api/users/me/manual-ingest-settings` — per-channel toggle
   - File: `artifacts/api-server/src/routes/prospects.ts` (lines ~1006–1621)
   - DB: `pre_platform_context` column, `users.manual_ingest_channels` (migration 0007)

2. **Manual contact ingest (FE)**
   - `ManualContactsSection`, `AddManualContactDialog`, `BulkAddDialog`
   - Lives under `/followup/whatsapp` and `/followup/telegram` as a toggle section
   - Files: `artifacts/dashboard/src/components/followup/*`

3. **Follow-up scheduler email**
   - `artifacts/api-server/src/services/followupDigest.ts`
   - Sends daily digest to each rep (idempotent via `daily_usage.digest_sent`)
   - Lists due follow-ups with signed open links

4. **Email one-click open**
   - `GET /api/followups/open/:id?t=<token>` in `followupOpen.ts`
   - Verifies HMAC token, redirects to WhatsApp/Telegram deep link with prefilled message
   - Button label in email: "Open chat" (user wants "Follow up")

5. **Message generation with doctrine**
   - `POST /api/prospects/:id/generate-message` — uses `messageGenerator` + doctrine packs
   - Requires `researchBrief` — manual ingest stores only SDR fields; research runs lazily

6. **Today queue + send**
   - `artifacts/dashboard/src/pages/today.tsx` — due follow-ups with Send button
   - Opens WhatsApp via `useSendNextFollowup`

### Gaps vs user vision

| User requirement | Current state |
|------------------|---------------|
| Manual ingest as center of app | Ingest is a toggle under Follow-up pages; Apollo/Seeder still prominent in nav |
| Click button to send from tool | Exists on Today + follow-up pages, but not wired immediately after manual ingest |
| Scheduler emails rep | Exists (`followupDigest`) — needs cron/workflow verification |
| Email "Followup" button | Exists as "Open chat" — opens WA with prefilled message (no auto-send; by design) |
| Generate + critic + lint on click | Pipeline exists but not triggered automatically post-ingest |
| No Apollo prospecting focus | Apollo flows still in nav (`/prospect/whatsapp`, `/seeder`) |

### Planned next steps

1. UI restructure: manual ingest as primary entry (new Contacts page or Today-first layout)
2. Post-ingest pipeline: trigger research + generate-message for new manual contacts
3. Rename email CTA to "Follow up"
4. Verify digest script scheduling
5. Typecheck + smoke test

---

## 2026-07-03T07:25:00Z — Implementation complete

### Backend
- `services/manualContactPrepare.ts` — research + stage-0 generation + deep link
- `services/followupScheduler.ts` — seeds stages 1..maxFollowups after first send
- `services/followupMessageService.ts` — on-demand follow-up generation (stage >= 1)
- `routes/prepareFirstMessage.ts` — POST /api/prospects/:id/prepare-first-message
- `routes/followupOpen.ts` — generates message on email click if missing
- `routes/followups.ts` — send-next generates on demand
- `services/followupDigest.ts` — CTA "Follow up", no longer requires pre-generated message
- `services/channels/whatsapp.ts` — schedules follow-ups after first send-intent
- `routes/prospects.ts` — sourceMode list filter, firstMessageChannel on ingest

### Frontend
- `pages/contacts.tsx` — primary manual ingest hub
- `components/layout.tsx` — nav: Today / Contacts / Follow-ups
- `App.tsx` — /contacts route
- `lib/api/manual-ingest.ts` — prepare API client
- `hooks/use-manual-ingest.ts` — usePrepareFirstMessage
- `pages/today.tsx` — link to Contacts

### Verification
- `pnpm run typecheck` — PASS

### Ops remaining
- Replit scheduled deployment for `node dist/scripts/sendFollowupDigests.mjs`

---

## 2026-07-03 — Email follow-up smoke test + Test Message UI

### Email "Follow up" button behavior (confirmed)
1. Digest email link → `GET /api/followups/open/:id?t=<signed-token>`
2. Server generates follow-up message if needed (doctrine pipeline)
3. **302 redirect to `https://wa.me/<PROSPECT_PHONE>?text=<message>`** (or t.me for Telegram)
4. Rep reviews prefilled message and **presses Send in WhatsApp** — NOT auto-sent by our app

Smoke test: `pnpm --filter @workspace/api-server run smoke:followup` — PASS

### Geo gate finding
- Prospect outreach: only allowed markets (BR, LATAM, IN, SEA). **IL (+972) prospects are blocked.**
- Self-test endpoint bypasses geo gate so reps can test with their own Israeli number.

### Test Message UI
- `TestChannelMessage` component on **Contacts** and **Accounts**
- `POST /api/users/me/test-channel-link` — WhatsApp + Telegram self-test
- Saves last-used identifier in localStorage

---

## Files touched this session

- `.grok/TODO.md`
- `.grok/logs/session-2026-07-03-manual-first.md` (this file)
- `artifacts/api-server/src/services/manualContactPrepare.ts` (new)
- `artifacts/api-server/src/services/followupScheduler.ts` (new)
- `artifacts/api-server/src/services/followupMessageService.ts` (new)
- `artifacts/api-server/src/routes/prepareFirstMessage.ts` (new)
- `artifacts/api-server/src/routes/followupOpen.ts`
- `artifacts/api-server/src/routes/followups.ts`
- `artifacts/api-server/src/routes/prospects.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/services/followupDigest.ts`
- `artifacts/api-server/src/services/channels/whatsapp.ts`
- `artifacts/dashboard/src/pages/contacts.tsx` (new)
- `artifacts/dashboard/src/components/layout.tsx`
- `artifacts/dashboard/src/App.tsx`
- `artifacts/dashboard/src/lib/api/manual-ingest.ts`
- `artifacts/dashboard/src/lib/api/prospects.ts`
- `artifacts/dashboard/src/hooks/use-manual-ingest.ts`
- `artifacts/dashboard/src/pages/today.tsx`
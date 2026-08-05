# LinkedIn Clipboard-Flow — TODO / Resume Checkpoint

**Companion to `LOG.md` / `TODO.md`.** Standalone task file for the LinkedIn
"no automation, copy-paste instead" work requested 2026-07-27. Kept current so any
session can resume cold after an SSH drop. When you finish something, move it to DONE
with a one-line result; when you start something, note it under IN PROGRESS with the
exact next step.

**Branch:** `audit/godlike-fixes` · **Identity:** hwholestorm@gmail.com
**Requested:** 2026-07-27.

---

## THE GOAL (verbatim intent)

LinkedIn automation violates LinkedIn's T&Cs, so the app must NOT try to prefill /
automate messages into LinkedIn's UI. Instead:

1. **First message** — option to GENERATE the message and copy-paste it manually into
   the prospect's LinkedIn message box (an easy Copy button).
2. **Follow-ups** — the reminder system stays identical (email + Pushover reminders;
   prewrite → critic → lint → fix against the exemplar system BEFORE the reminder is
   sent). The ONLY difference vs WhatsApp/Telegram: no prefill — the generated message
   shows up in the Chat Followuper UI with an easy Copy button; the SDR pastes it into
   LinkedIn by hand.
3. **Test message** — you cannot message yourself on LinkedIn, so the "test send"
   flow must target another contact (not yourself), expose a copyable space for a
   GENERATED message (if the user chooses to generate), and — if the user writes their
   OWN message — auto-add that contact to the LinkedIn follow-up section.

The WhatsApp "prefilled compose box" experience is NOT possible on LinkedIn; the copy
button in the Chat Followuper UI is the substitute.

---

## CURRENT STATE (recon 2026-07-27 — what already exists)

A prior session already shipped LinkedIn as a **clipboard-only channel**. Confirmed by
two read-only recon passes:

### Backend — FULLY wired for LinkedIn (no production gaps found)
- `lib/channelRegister.ts` — `CHANNEL_CODES = ["whatsapp","telegram","linkedin"]` is the
  single source of truth; LinkedIn writer + critic register blocks exist for BOTH
  prospector and followuper modes (`:595-638`, `:656-657`, `:673-674`).
- `services/channels/linkedin.ts` — `generateLink` returns the canonicalized bare
  profile URL (host-enforced, no prefill); `recordSendIntent` stamps send + schedules
  follow-ups (`scheduleFollowupsAfterFirstSend`).
- `services/followupScheduler.ts` — channel-agnostic; conflict target `(prospectId,
  channel, stage)`.
- Generation: `messagePrompts.ts` / `messageGenerator.ts` pass channel through the
  writer → critic → rewriter chain unchanged; exemplar selection is channel-agnostic
  by design. LinkedIn gets the same prewrite/critic/lint/fix treatment.
- Reminders: email digest (`followupDigest.ts:124`, body names LinkedIn at `:105`),
  Pushover digest (`pushoverDigest.ts:89`), overdue/Monday nudges (`pushoverNudges.ts`),
  hourly pre-generation (`followupPregenerate.ts:67`) — all enumerate via `CHANNEL_CODES`.
- Email-open path can't 302 into a prefill → diverts LinkedIn to an HTML copy-paste
  page (`followupOpen.ts:127-143`, `followupFallback.ts:115-130` renders Copy + Open
  Profile).
- Routes return `{ url/deepLinkUrl, body/generatedMessage }` for clipboard copy:
  `whatsappLink.ts` `GET /prospects/:id/linkedin-link` (`:162-209`) + `POST
  /prospects/:id/send-intent` → `recordLinkedinSendIntent` (`:289-290`);
  `followups.ts` send-next has linkedin in `SUPPORTED_/SEND_IMPLEMENTED_CHANNELS`.
- Test route already accepts linkedin: `routes/testChannelLink.ts:64-86`.

### Frontend — a VISIBLE Copy button already exists in some surfaces
- Today queue card — `pages/today.tsx:701-709` (only when a message is already generated).
- Prospect detail message card — `pages/prospect-detail.tsx:491` + `CopyButton :674-708`.
- Seeder review — `components/seeder/MessageReview.tsx:104-114`.

### Frontend — the REAL gaps (silent copy / no visible button)
- **`components/followup/FirstMessagePreviewDialog.tsx`** (main FIRST-MESSAGE path):
  only a passive hint at `:266-270`; copy fires silently on Send in `pages/contacts.tsx
  :295-312`. No way to copy the draft without clicking Send.
- **`components/followup/ChannelFollowupPage.tsx`** (the dedicated `/followup/linkedin`
  FOLLOW-UP queue): NO Copy button anywhere; message shown only truncated (`:754-761`);
  copy is silent on "Send next" (`:241-249`), which also records the send.

### Stale (cosmetic) — not runtime bugs
- `scripts/smokeAudit2.ts:60` — hardcoded `["whatsapp","telegram"]` due-query (test only).
- Stale comments: `routes/campaigns.ts:20,45`; `services/messageGenerator.ts:79`;
  `routes/followups.ts:5-9`; `routes/generateMessage.ts:137`.

---

## TASKS

### ⬜ Task 3 — Test-message repurpose (LinkedIn tab) — DECISIONS LOCKED 2026-07-27
Decisions (from the user):
- **Scope: LinkedIn-only.** WhatsApp/Telegram test tabs are unchanged (you can message
  yourself there). Only the LinkedIn tab is reworked.
- **Generate path = copy-only, NO enroll.** "Generate" just produces a copyable message
  (ephemeral — nothing persisted). ONLY the write-your-own path creates the contact +
  adds it to the LinkedIn follow-up section.
- **Placement: keep it in the existing `TestChannelMessage` widget** (repurpose the
  LinkedIn tab in-place; do NOT fold into Contacts).

Build (LinkedIn tab only):
- Reframe copy from "test to yourself" → "reach out to a contact". Field = the
  prospect's LinkedIn profile URL (route already accepts any identifier).
- Two explicit paths:
  - **Generate**: call the existing generate path → show the message in a copyable
    box with a Copy button. Nothing saved. (Needs a name/company context to generate a
    good message — confirm what minimal inputs the generate endpoint needs.)
  - **Write your own**: user types a message → on submit, CREATE the contact on the
    linkedin channel with that first message and enroll it into the LinkedIn follow-up
    section (reuse the Contacts manual-ingest path). Then it appears in `/followup/linkedin`.
- Keep WhatsApp/Telegram tabs exactly as-is.

### ⬜ Task 1 — First-message Copy button (FE)
Add a visible Copy button to `FirstMessagePreviewDialog.tsx` so a LinkedIn (and any
clipboard-channel) SDR can copy the generated draft without pressing Send. Reuse the
existing copy pattern/toast. No backend change (`linkedin-link` already returns `body`).

### ⬜ Task 2 — Follow-up queue Copy button + full message (FE)
On `ChannelFollowupPage.tsx` (used by `/followup/linkedin`): show the FULL generated
message (not just a truncated preview) and add a Copy button that copies WITHOUT
recording a send (decouple copy from "Send next"). Keep "Send next" as the
record-the-send action. This is the "message shows up in the Chat Followuper UI to
copy-paste" requirement. Consider showing this only for clipboard channels (linkedin/
telegram) or for all — decide during build; low risk either way.

### ⬜ Task 4 — Cleanup (low priority, do with the audit)
- `scripts/smokeAudit2.ts:60` → derive from `CHANNEL_CODES`.
- Fix the 4 stale comments listed above.

### ⬜ Task 5 — Godlike audit + blast radius + smoke + auto-fix (final)
After Tasks 1–3: typecheck + build; run the FE tests (`pnpm run test`) + e2e; run the
api-server smokes relevant to the changed paths (`smoke:followup`, `smoke:chatfollowup`,
`smoke:pregen`, `smoke:regenerate`, `smoke:delivery`); adversarially review the diff
(blast radius: every caller of the changed components/routes); auto-fix anything found;
append a session entry to `godlike-audit/LOG.md`.

---

## GREEN BAR / BASELINE
- Baseline typecheck at start of this task: see `/tmp/baseline-typecheck.log` (captured
  2026-07-27 before any edits).
- Target end state: `pnpm run typecheck` exit 0, `pnpm run build` exit 0, root
  `pnpm run test` all pass, relevant smokes pass.

## DONE (2026-07-27)
- **Task 1** — `FirstMessagePreviewDialog.tsx`: added a visible "Copy message" button
  for clipboard channels (linkedin/telegram); reworded the LinkedIn hint. Test's loose
  regex still matches (no test change).
- **Task 2** — `ChannelFollowupPage.tsx`: added a per-row "Copy" button (clipboard
  channels) that copies the full ready message WITHOUT opening a tab or recording a
  send; decoupled copy from "Send next".
- **Task 3** — LinkedIn tab of `TestChannelMessage.tsx` repurposed: no more
  "message yourself" (impossible on LinkedIn). It now launches the audited
  `AddManualContactDialog(channel="linkedin")` — Generate → copyable draft (copy-only,
  no enroll); write-your-own + "Add contact" → creates the linkedin contact
  (firstMessageChannel=linkedin) so it lands in `/followup/linkedin`; onAdded navigates
  there. Added a "Copy" button to that dialog's message area. WhatsApp/Telegram test
  tabs unchanged. DESIGN NOTE: reused the existing audited add/generate/enroll flow
  instead of duplicating ~200 lines of generation logic into the test widget (the repo
  already flags this flow as dedupe-worthy). Entry point stays in the test widget.
- **Task 4** — cleanup: `smokeAudit2.ts` due-query now derives from `CHANNEL_CODES`;
  fixed stale "only whatsapp/telegram" comments in `campaigns.ts` (x2),
  `generateMessage.ts`, and the `followups.ts` docstring.

## Task 5 — GODLIKE AUDIT (DONE 2026-07-27)
Adversarial review of the diff (1 agent) + blast-radius sweep. Findings + resolution:
- **[Med] Stale-copy on the follow-up queue — FIXED.** The row Copy button copied
  `messagePreview`, which falls back to the previously-SENT stage (`last`) or the first
  message when the next stage isn't generated yet (lazy gen). Now copies a dedicated
  `copyTarget` = next stage's generated text, else the not-yet-sent first message, else
  disabled. Never copies a stale/wrong-stage message.
- **[Low] Dead LinkedIn branches in TestChannelMessage `test` mutation — REMOVED.**
  Unreachable once the LinkedIn tab stopped rendering "Open test chat". onSuccess
  simplified to WA/TG only.
- **[Nit] Overstated copy — SOFTENED.** "...gives you the ready message to copy once it's
  generated."
- Verified-correct by the audit (no change): no mount-time network calls from the
  unconditionally-rendered dialog (`usePreviewProgress` disabled when draftId===null;
  others are mutations); copy handlers copy the full, current, right text; blast radius
  clean (FollowupRow's new required props come only from ChannelFollowupPage; whatsapp/
  telegram/linkedin pages all render <ChannelFollowupPage/>); api-server changes are truly
  comment-only; `[...CHANNEL_CODES]` valid. Two AddManualContactDialog instances can
  co-exist on Contacts (independent open state) — acceptable, documented.

## ⚠️ PRETTIER INCIDENT (handled)
Ran `prettier --write` on the touched files → it reformatted MANY pre-existing lines
(the repo is not prettier-default-clean; no prettier config exists). That churn was
reverted: `git checkout HEAD -- <files>` (explicit paths) then re-applied only the logical
edits. **Do NOT run prettier on this repo's files** — match surrounding style by hand.
smokeAudit2's churn was hand-reverted before the checkout trick was found.

## FINAL POLISH (2026-07-27) — remaining nits closed
- Copy gating made consistent: `AddManualContactDialog`'s Copy button now shows only for
  clipboard channels (linkedin/telegram), matching the other two surfaces. WhatsApp
  prefills, so no Copy there.
- Trailing newline added to `TestChannelMessage.tsx`.

## PUBLISH READINESS (2026-07-27)
- This change set touches NO DB schema, NO migrations, NO env vars, NO new endpoints —
  it adds ZERO new publish prerequisites (FE components + doc comments + one smoke script).
- The STANDING prerequisite from prior admin-dashboard work is unchanged: before ANY
  republish, run `/RUN-THIS-BEFORE-PUBLISH.sql` against the PROD DB (Replit SQL Console →
  Production) one line per Run, confirm the 4 VERIFY numbers (want_1/want_1/want_6/want_2),
  then set `ADMIN_EMAILS`. The SQL is idempotent — safe to re-run to CONFIRM prod is already
  at 0019–0021. If the 4 numbers are already right, republish immediately.

## VERIFY STATUS — ALL GREEN (2026-07-27, on the final surgical diff)
- `pnpm run typecheck` → exit 0
- `pnpm run build` → exit 0
- root `pnpm run test` → 54/54 (db 3 + dashboard 51)
- `pnpm --filter @workspace/dashboard test:e2e` → 8/8 real Chromium (incl. LinkedIn spec)
- `smoke:audit2` → 6/6
- Diff: 8 files, ~273 insertions / 97 deletions, surgical (no prettier churn).

## LOG
- 2026-07-27 — Recon (2 agents) → decisions locked → implemented Tasks 1-4 → adversarial
  audit (1 agent) → fixed [Med] stale-copy + [Low] dead code + [Nit] wording → reverted a
  prettier-churn mishap → re-verified all green. COMPLETE. Not committed (left for the user
  to review + commit).

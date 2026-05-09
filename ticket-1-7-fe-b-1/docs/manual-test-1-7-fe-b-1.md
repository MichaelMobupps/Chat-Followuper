# Manual test — Ticket 1.7-FE-B-1 (Manual seeder flow)

This bundle ships the seeder UI: form → research SSE → brief edit → message generation. It uses the prospects + campaigns + generate-message routes shipped in 1.7-backend, 1.7-FE-A, and 1.7-BE-2.

Walk this checklist after Republish.

## Pre-flight

- [ ] Sign in via `/login`.
- [ ] Sidebar nav: Today, Seeder, Campaigns, Prospects, Followups, Activity, Accounts.
- [ ] Click "Seeder". URL becomes `/seeder`. Page title is "Seeder".
- [ ] Stage indicator shows "1 Input → 2 Research → 3 Brief → 4 Message → 5 Done".

## Form validation (no spend yet)

- [ ] Submit the empty form. Inline errors on `phone`, `brand`, `country`, `language`, `subVertical`, `product`.
- [ ] Phone "919900099911" (no `+`) → "E.164 format required".
- [ ] Country "India" → "ISO 2-letter, e.g. IN".
- [ ] Language "english" → "ISO code, e.g. en or pt-BR".
- [ ] Country "IN" + language "en" + valid phone + brand/subVertical/product → form accepts.

## Dry-run (cancel research, no spend)

The research stream costs real Anthropic spend. Do this dry-run first to catch any UI bugs without burning credits.

- [ ] Fill form: phone `+919900099911`, brand `Probo`, country `IN`, language `en`, subVertical `real_money_gaming`, product `opinion-trading app`. Leave campaign as "No campaign".
- [ ] Click "Save & start research".
- [ ] Stage indicator advances to step 2. Research panel shows "Connecting…" then "Researching…".
- [ ] Event log starts streaming `progress` events.
- [ ] Click "Cancel" within 5 seconds. Then click "Abandon draft" → "Delete draft" in the alert.
- [ ] Toast: "Draft deleted". You return to the form. Network tab shows `DELETE /api/prospects/<id>` → 200.

## Full end-to-end (live, costs ~$0.20-$0.40)

- [ ] Same form input. Submit. Verify on Network tab:
  - `POST /api/prospects` → 201 with new prospect
  - `EventSource` connection to `/api/prospects/research/stream?input=…` opens
- [ ] Research streams progress events for 30-90 seconds. On `result` event:
  - Stage advances to "Brief"
  - `PATCH /api/prospects/<id>` fires with `{researchBrief: {…}}` → 200
  - Brief editor renders with read-only metadata + editable arguments
- [ ] Read-only section shows: country IN, scale tier, daily volume, primary event, scale rationale, market context, competitors badges, alternative events badges, generated-at timestamp + model + cost.
- [ ] Editable section has filled values for: hook, problem, why, validation, how, tangible reasons (multiple inputs).
- [ ] No "Native-language versions" card visible (because language is `en`).
- [ ] Edit the hook field. Click "Save & generate message".
- [ ] Network: `PATCH` with edited brief → 200, then `POST /api/prospects/<id>/generate-message` → 200 with `{subject, message, costUsd, iterations}`.
- [ ] Stage advances to "Message". Cost + iterations displayed in card header.
- [ ] Subject and body shown. Body is editable.
- [ ] Edit the body. "(edited)" indicator appears with "Local edits — not persisted" warning.
- [ ] Click "Copy". Toast "Copied to clipboard". Paste into another app to verify.
- [ ] Click "Done". Stage advances to "Done", success card shown.

## Non-English language path

- [ ] Start a new seeder. Same form, but language `hi`.
- [ ] After research completes, brief editor has the additional "Native-language versions" card with three Hindi textareas pre-filled.
- [ ] Edit each native field. Save. Message generation proceeds.

## With campaign attachment

- [ ] Pre-create a campaign at `/campaigns` if you don't have one.
- [ ] Start a new seeder. Pick the campaign in "Attach to campaign".
- [ ] Submit. After research, brief, message, done — the "Done" card has both "View campaign" and "Start another" buttons.
- [ ] Click "View campaign". URL goes to `/campaigns/<id>`. Stats show prospect count incremented.

## Error paths

- [ ] Duplicate phone: re-run with the same phone as a previous successful seeder. Toast "Could not save prospect" with "duplicate phone" detail. Form stays mounted, no draft created.
- [ ] Cross-user campaign (advanced — needs a second account): impossible from UI since `CampaignSelector` only shows your own campaigns. Skip.
- [ ] Research stream error: hard to trigger reliably; if you see one, the panel shows red "Research failed" with retry button.

## Auth & navigation

- [ ] In a separate tab, hit `/api/auth/logout`. Reload `/seeder`. Redirected to `/login`.

## Console

- [ ] No red errors during normal use.
- [ ] No EventSource reconnect warnings (the hook closes cleanly on `done`).

## Known limitations (out of scope for FE-B-1)

- Edits to the generated message body do NOT persist back to the prospect. The PATCH endpoint doesn't accept `firstMessageBody` (server-controlled). Workaround: copy edited text manually, or refine the brief and regenerate.
- No Apollo discovery: the SDR types phone manually. Apollo picker ships in FE-B-2.
- No prospect detail page: success state only links to campaign (if attached). Prospects nav still shows the placeholder.

---

## If anything fails

Paste back:
1. Which step
2. Network tab: method, URL, status, response body for the failing call
3. Console errors if any
4. Stage indicator state when the failure happened

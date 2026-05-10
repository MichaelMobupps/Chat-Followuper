# Manual test — Ticket 2.3-FE

The bulk page is at `/prospect/whatsapp`. Each scenario below is one
verification target. Run after the dashboard workflow has restarted.

## Scenarios

### 1. First render (placeholder is gone)

**Action**: Navigate to `/prospect/whatsapp`.

**Expected**: A page titled "Prospect contacts via WhatsApp" with:
- Header breadcrumb (Prospect → WhatsApp)
- 5-step stage indicator (URLs → Discover → Pick → Reveal & save → Done), step 1 active
- A textarea labeled "URLs (one per line, max 50)"
- Title filters input (defaults to "Head of Growth, VP Marketing, ...")
- Country input (optional)
- "Discover" button (disabled when textarea is empty)

**NOT expected**: The old placeholder text "Coming in ticket 2.3-FE — Paste or upload a list of URLs…"

### 2. URL classification

**Action**: Paste 3 URLs into the textarea, one per line:
```
https://probo.in
https://play.google.com/store/apps/details?id=com.example
not-a-url
```

**Expected**:
- Two badges appear: "2 valid" + "1 invalid"
- An expandable list shows: `not-a-url — not a URL`
- Discover button is enabled (because there are valid URLs)

### 3. Empty + over-50 cases

**Action 3a**: Clear the textarea. **Expected**: Discover button disabled.

**Action 3b**: Paste 51 valid URLs. **Expected**: Badge shows "51 valid"
+ destructive badge "over 50 limit; only first 50 will be processed".
Discover button still works (caps at 50 server-side).

### 4. Discovery happy path

**Action**: Paste 1 URL (e.g., `https://probo.in`), click Discover.

**Expected**:
- Stage indicator advances to step 2 (Discover)
- One per-URL card appears, transitioning through:
  `Resolving URL` → `Searching Apollo for company` → `Loading people` → `Done`
- After completion, header shows: "1 URLs ok · 0 failed · N candidates found"
- "Continue to candidates (N)" button appears (active)

### 5. Discovery failure isolation

**Action**: Paste 2 URLs — one valid, one for a brand Apollo won't find:
```
https://probo.in
https://this-brand-definitely-does-not-exist-anywhere.example
```

**Expected**:
- Both URLs run in parallel
- The bogus one ends in "Failed" with an error message
- The valid one ends in "Done"
- The "Continue" button still appears (skip-and-continue behavior)

### 6. Candidate grid renders + filters work

**Action**: From scenario 4, click "Continue to candidates".

**Expected**:
- Stage advances to step 3 (Pick)
- Filter card with Search, Country, "Hide no-phone", "Show maybe", "Has email"
- Table of candidates, each with: checkbox · name · title · company ·
  phone badge (yes/maybe/no with credit cost) · email/linkedin badges
- "Hide no-phone" is ON by default (so 📞 no rows are hidden)
- "Show maybe" is ON by default

**Filter checks**:
- Toggle "Hide no-phone" off → rows with `📞 no` reappear
- Toggle "Show maybe" off → rows with `📞 maybe (8c)` disappear
- Type a title fragment in Search → list narrows
- Pick a country in Country dropdown → list narrows further

### 7. Multi-select + credit estimator

**Action**: Tick 3 candidates: 2 with `📞 yes` and 1 with `📞 maybe`.

**Expected** (sticky bottom bar):
- "3 selected · Est. 10 credits (2 yes × 1 + 1 maybe × 8)"
- "Reveal & save 3" button is enabled

### 8. Soft cap behavior

**Action**: Click "Select all visible" with > 25 candidates visible (or
tick > 25 manually).

**Expected**:
- Selection summary shows "26 selected · ..."
- Amber "Over soft cap of 25" badge + "Override" button appears
- "Reveal & save" button is **disabled**
- Click "Override" → button text changes to "Override active",
  Reveal button becomes enabled

### 9. Reveal confirmation dialog

**Action**: With selections made, click "Reveal & save".

**Expected**:
- Confirmation dialog opens
- Shows breakdown:
  ```
  Sync reveals (phone cached): N × 1 = N credits
  Async reveals (bulk_match):  M × 8 = M*8 credits
  Total:                       (N + M*8) credits
  ```
- If maybe count > 0, a small note explains: "Apollo's webhook
  delivers the phone number(s) later"
- Cancel button → dialog closes, no fan-out
- Reveal & save button → fan-out starts

### 10. Fan-out progress (yes path)

**Action**: After confirming reveal for 2 "yes" candidates:

**Expected**:
- Stage advances to step 4 (Reveal & save)
- Progress bar at top, with "Processing prospects (X / 2)"
- Each row transitions through:
  `Queued` → `Revealing contact (1 credit)…` → `Creating prospect…` →
  `Writing stub brief…` → `Generating message (3-stage Doctrine)…` →
  `Ready to send` (green check)
- Up to 3 rows process in parallel

### 11. Fan-out progress (maybe path)

**Action**: After confirming reveal for 1 "maybe" candidate:

**Expected**:
- Row transitions through:
  `Queued` → `Creating prospect…` →
  `Requesting phone reveal (8 credits, async)…` →
  `Writing stub brief…` → `Generating message (3-stage Doctrine)…` →
  `Message ready, phone reveal pending` (amber clock)

### 12. DONE screen

**Action**: Wait for all fan-out to complete.

**Expected**:
- Stage advances to step 5 (Done)
- Header: "Batch complete — N ready · M phone reveal pending · F failed"
- Three groups (only those with members are shown):
  - **Ready to send** (green): each row has "Open WhatsApp" button
  - **Phone reveal pending** (amber): each row has "phone pending" badge
  - **Failed** (red): each row shows the error message
- "New batch" button at bottom

**Action**: Click "Open WhatsApp" on a ready row.

**Expected**:
- New tab opens to `https://wa.me/<phone>?text=<urlencoded message>`
- If browser blocks the popup, a destructive toast appears with a hint

**Action**: Click "New batch".

**Expected**: Page resets to step 1 (URL input), all state cleared.

## Failure modes worth testing

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| First-render shows old placeholder text | Dashboard not republished, or workflow not restarted | Restart dashboard workflow; hard-refresh browser (Cmd-Shift-R) |
| Discover button stays disabled with valid URLs | URL classifier rejecting good URLs (regex bug) | Open browser devtools console, paste URL into `new URL(...)` to verify |
| Discovery card stuck on "Resolving URL" | resolve-urls 500ing or auth failed | Check api-server logs; confirm cf_session cookie is fresh |
| Candidate grid empty after discovery | search-people returned 0 (org has no matching titles) | Loosen title filters at step 1, or confirm Apollo returns people for that org |
| All "yes" rows fail with "reveal returned no phone" | Apollo's cached phone changed format or got purged | Cross-check the affected person ids in Apollo's UI; rare |
| All rows fail with 401 | Session expired mid-fan-out | Refresh page, log in, try again |
| All "maybe" rows fail with "phone_reveal_already_in_progress" | Stale prospects from previous abandoned batch | Look up the affected `apolloPersonId` in the prospects table; delete the orphan row OR pick different people |
| WhatsApp link button returns 422 geo_blocked | Phone country isn't in the allowed market list | Expected behavior — open `services/channels/whatsapp.ts` geoGate to confirm allowed list |

## When something is wrong

Don't try to patch components yourself. Pull the affected component
file, paste it in a chat, describe the symptom. A targeted hotfix
bundle is the legitimate path — same pattern as 2.3-BE-A v1 → v2.

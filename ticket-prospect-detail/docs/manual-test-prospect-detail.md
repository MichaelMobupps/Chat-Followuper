# Manual test — Ticket prospect-detail

## Pre-req

At least one prospect in the DB. If empty, scenarios 1-2 are still meaningful.

## Scenarios

### 1. Direct URL navigation

**Action**: Type `/prospects/<some-id>` in the address bar (use any
prospect ID from your DB — get one via `psql` or by visiting
/prospects and copying from devtools).

**Expected**: Detail page loads with that prospect's data, OR error
card if the ID is wrong / cross-tenant.

### 2. Direct URL navigation — bad ID

**Action**: Visit `/prospects/00000000-0000-0000-0000-000000000000`.

**Expected**: Error card titled "Could not load prospect" with the
error code (probably `not_found`).

### 3. Click-through from list

**Action**: Visit `/prospects`. Click any row (anywhere except the
"Open" action button on the right).

**Expected**: Navigates to `/prospects/<that-row's-id>`.

### 4. Action button click does NOT navigate

**Action**: On a Ready row in the list, click the "Open" action button.

**Expected**: Opens WhatsApp link in new tab. Does NOT navigate to the
detail page (the row click handler skips clicks inside the action cell).

### 5. Detail page sections render

**Action**: Open detail page for a prospect that has a phone, message,
and brief.

**Expected**:
- Header: name + title/company + Ready/Sent/etc badge
- Action row: "Open WhatsApp" + "Regenerate message" + "Delete"
- "Prospect data" card with fields (some may be "—" if null)
- "First message" card with body + Copy button
- "Research brief" card collapsed by default; click to expand

### 6. Phone reveal section visibility

**Action**: Open detail page for a prospect with `phoneRevealStatus`
that's NOT "none" (e.g., "pending", "arrived", "blocked", "no_match").

**Expected**: A "Phone reveal" card appears showing reveal status +
audit phoneNumber + a status-specific explanation.

**Action**: Open detail page for a prospect with `phoneRevealStatus`
= "none" (seeder-flow prospect).

**Expected**: No "Phone reveal" card.

### 7. Copy message

**Action**: Click "Copy" button on the message card.

**Expected**: Button briefly shows green check + "Copied"; pasting
into another app yields the message text.

### 8. Brief expand / collapse

**Action**: Click the "Research brief" toggle.

**Expected**: Section expands showing brief fields (country, scale,
hooks, arguments, etc.). Click again to collapse.

### 9. Brief expand for stub-brief prospect

**Action**: Open detail for a bulk-flow prospect (created via 2.3-FE),
expand the brief.

**Expected**: Brief shows but most fields are empty / placeholders
("scale tier: unknown", "primary event: empty", etc.). The "Generator
model" should say `stub-2.3-fe` and "Generator cost" should be `$0.0000`.

This is the visible signal that re-research is needed for these prospects.

### 10. Regenerate message

**Action**: Click "Regenerate message". Wait.

**Expected**:
- Spinner inside the Regenerate button
- After completion: success toast "Message regenerated"
- The message card updates with the new message
- "Updated" timestamp in data card refreshes

### 11. Regenerate fails when no brief

**Action**: Find a prospect with no `researchBrief`. Try to click
Regenerate.

**Expected**: Button is disabled with a tooltip "Research brief
missing — message generation requires it".

### 12. Delete

**Action**: Click "Delete". Confirmation dialog opens.

**Expected**: Dialog shows warning text. Cancel → dialog closes, no
action. Confirm → API DELETE call → success toast "Prospect deleted"
→ navigates back to `/prospects`. The deleted row is no longer in the
list.

### 13. Open WhatsApp

**Pre-req**: Ready prospect with channel=whatsapp.

**Action**: Click "Open WhatsApp".

**Expected**: New tab opens to wa.me link. If browser blocks the popup,
toast appears.

### 14. Back link

**Action**: Click "Back to prospects" at the top of the page.

**Expected**: Navigates to `/prospects`. Filters and pagination state
on the list are preserved (component-local state survives back-nav since
list page wasn't unmounted by detail navigation — actually, list IS
unmounted by route change, so filters reset to default. Acceptable v1.)

### 15. Sidebar still works

**Action**: From the detail page, click "Today" or "Activity" in the
sidebar.

**Expected**: Navigation works as expected. Detail page unmounts cleanly.

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Row click does nothing | wouter import not patched into ProspectsListTable | Re-run apply.sh; check evidence output |
| Row click navigates but page is blank | App.tsx route not registered OR import path wrong | Check App.tsx for `<Route path="/prospects/:id">` |
| Page shows "Could not load prospect" with 401 | Session expired | Refresh, log in again |
| Regenerate spins forever | generateMessage endpoint hangs OR cf_session expired mid-call | Check api-server logs; refresh page |
| Delete doesn't navigate away | Mutation `onSuccess` callback not invalidating queries | Check tanstack-query DevTools; invalidate manually if stuck |
| Brief expansion shows empty fields for seeder-flow prospect | seeder-flow brief is null | Expected — only bulk-flow prospects always have a brief (stub) |
| Open WhatsApp returns 422 geo_blocked | Phone country not in allowed list | Expected; geo-gate config is environment-dependent |

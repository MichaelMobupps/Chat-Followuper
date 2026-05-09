# Manual test — Ticket 1.7-FE-A (Campaigns CRUD)

After Republish, open the dashboard in a browser and walk through these checks. All test IDs use `data-testid` attributes for stable selection.

## Pre-flight

- [ ] Sign in via `/login`. You land on `/` (Today).
- [ ] Sidebar shows a "Campaigns" item with a megaphone icon, between Seeder and Prospects.

## List page (`/campaigns`)

- [ ] Click "Campaigns" in the sidebar. URL becomes `/campaigns`. Page title is "Campaigns".
- [ ] If you have no campaigns: empty state shows "No active campaigns. Create your first…"
- [ ] If you have campaigns: they render as a 1/2/3-column responsive grid of cards.
- [ ] Tabs: "Active" (default) and "All (incl. archived)". Switching tabs reloads the list.

## Create

- [ ] Click "New campaign". Dialog opens with the form.
- [ ] Submit with empty name. Inline error: "Name is required". No request fired.
- [ ] Fill: name "Test India fintech", description "Quick e2e check", channel "whatsapp", language "en", country "IN". Submit.
- [ ] Toast: "Campaign created". Dialog closes. New card appears at the top of the list.
- [ ] Card shows the name, description (truncated to 2 lines), and badges: `whatsapp`, `en`, `IN`.

## Validation

- [ ] Reopen "New campaign". Try language "english" → error "Use ISO code, e.g. 'en' or 'pt-BR'".
- [ ] Try country "India" → error "Use ISO 2-letter code…".
- [ ] Try language "pt-BR" → accepted.
- [ ] Cancel out of the dialog.

## Detail page

- [ ] Click the campaign name on the card. URL becomes `/campaigns/<uuid>`.
- [ ] Header shows name, description, badges. Stats card shows Prospects: 0, Created date, Updated date.
- [ ] Click "Back to campaigns" — URL returns to `/campaigns`.

## Edit

- [ ] On the detail page, click "Edit". Dialog opens, form pre-filled with current values.
- [ ] Change description. Click "Save changes".
- [ ] Toast: "Campaign updated". Dialog closes. Detail page reflects the new description.

## Archive / Unarchive

- [ ] On detail page, click "Archive". Toast: "Archived". Page now shows "Archived" badge.
- [ ] Click "Unarchive". Toast: "Unarchived". Badge disappears.
- [ ] Archive again, then go back to `/campaigns`. Card is hidden under "Active" tab. Switch to "All" — it appears with a red "Archived" badge and an "Unarchive" button.

## Delete

- [ ] On detail page, click "Delete". Alert dialog: "Delete campaign? This action cannot be undone." (or, if prospects exist: "This campaign has N prospect(s). They will not be deleted; their campaign association will be cleared.")
- [ ] Cancel — dialog closes, no change.
- [ ] Click "Delete" again, then "Delete" in the alert. Toast: "Campaign deleted". Browser navigates back to `/campaigns`. Card is gone.

## Auth & errors

- [ ] In a separate tab, hit `/api/auth/logout`. Reload the dashboard tab. You should be redirected to `/login`.
- [ ] Try to fetch a non-existent campaign by editing the URL: `/campaigns/00000000-0000-0000-0000-000000000000`. Page shows the back button + "Campaign not found" or similar error message.

## Network audit (DevTools → Network)

While clicking through the page, verify:

- [ ] `GET /api/campaigns` fires on list load. Returns 200 with array.
- [ ] `GET /api/campaigns?includeArchived=true` fires when the "All" tab is active.
- [ ] `POST /api/campaigns` fires on create with JSON body.
- [ ] `PATCH /api/campaigns/<id>` fires on edit save.
- [ ] `POST /api/campaigns/<id>/archive` fires on archive.
- [ ] `POST /api/campaigns/<id>/unarchive` fires on unarchive.
- [ ] `DELETE /api/campaigns/<id>` fires on delete confirm.
- [ ] All requests include the session cookie (no Authorization header needed).

## Console

- [ ] No red errors during normal use.
- [ ] No warnings about uncontrolled form inputs, missing keys, or hydration mismatches.

---

## If anything fails

Paste back:
1. Which step failed
2. The exact UI behavior (or error toast text)
3. The relevant Network request: method, URL, status, response body
4. Browser console errors if any

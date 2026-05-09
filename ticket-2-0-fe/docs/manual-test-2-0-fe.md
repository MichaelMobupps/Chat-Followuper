# Manual test — Ticket 2.0-FE (Nav restructure)

Pure frontend. No backend touched. No Apollo touched. No spend.

## Pre-flight

- [ ] FE-A is applied (Campaigns page exists at /campaigns).
- [ ] Sign in. Dashboard loads.

## Sidebar

- [ ] Below "Campaigns" you see 4 new entries in this order:
  - Prospect: WhatsApp
  - Prospect: Telegram
  - Follow-up: WhatsApp
  - Follow-up: Telegram
- [ ] Old "Seeder", "Prospects", "Followups" entries still visible (intentionally — they retire in later tickets).
- [ ] No console errors when sidebar renders.

## Each new page

For each of the 4 new entries:

- [ ] Click. URL updates to `/prospect/whatsapp` (etc).
- [ ] Page title renders ("Prospect contacts via WhatsApp", etc).
- [ ] Breadcrumb-style header shows phase + channel icon + channel name.
- [ ] Body card shows "Coming in ticket 2.X" and the description of what's planned.
- [ ] No console errors.

Specific to **Prospect: WhatsApp**:
- [ ] "Open Seeder (legacy)" button present at the bottom of the card.
- [ ] Clicking it goes to `/seeder` and the legacy single-prospect flow works as before.

## Existing flows still work

- [ ] `/` (Today) — unchanged.
- [ ] `/seeder` — single-prospect flow still works end-to-end. Test with one quick dry-run.
- [ ] `/campaigns` — campaigns list loads. Create + view + archive still work.
- [ ] `/prospects` (legacy placeholder) — still resolves, shows whatever it showed before.
- [ ] `/followups` (legacy placeholder) — still resolves.
- [ ] `/activity`, `/accounts` — unchanged.

## Navigation behavior

- [ ] Clicking a new nav item highlights it (active state in sidebar).
- [ ] Browser back/forward works between new pages.
- [ ] Deep-linking to any of `/prospect/whatsapp`, `/prospect/telegram`, `/followup/whatsapp`, `/followup/telegram` works (paste into address bar, page loads).
- [ ] Logged-out user hitting `/prospect/whatsapp` directly is redirected to `/login`.

## Console

- [ ] No red errors during normal use.
- [ ] No "Cannot find module" for the 4 new page imports.

---

## If anything fails

Paste:
1. Step where it broke
2. Console errors
3. Screenshot of sidebar if the nav order looks wrong

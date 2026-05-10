# Ticket sidebar-cleanup — drop legacy menu items

Trims the sidebar from 11 items to 7. Removes:

- **Seeder** → `/seeder` (old single-prospect prospector — replaced by Prospect: WhatsApp / Prospect: Telegram bulk flows)
- **Campaigns** → `/campaigns` (placeholder)
- **Prospects** → `/prospects` (placeholder, 240-byte stub)
- **Followups** → `/followups` (placeholder)

Keeps:

| | |
| --- | --- |
| Today | dashboard home |
| Prospect: WhatsApp | bulk WhatsApp prospect (just shipped in 2.3-FE) |
| Prospect: Telegram | bulk Telegram prospect (placeholder, future) |
| Follow-up: WhatsApp | follow-up via WhatsApp |
| Follow-up: Telegram | follow-up via Telegram |
| Activity | activity log |
| Accounts | accounts/settings |

## What this changes

One file, two anchored edits:

1. `artifacts/dashboard/src/components/layout.tsx` imports — drops 4 unused lucide-react icons (Sprout, Users, ListChecks, Megaphone)
2. Same file, NAV_ITEMS array — drops 4 nav entries

**Routes are NOT touched.** `/seeder`, `/campaigns`, `/prospects`, `/followups` still resolve to whatever components are registered in App.tsx. This protects:

- Any "Open Seeder (legacy)" button surfaces that may still link directly
- Any deep-linked workflows (e.g. browser bookmarks)
- Backend handlers that may construct full URLs to these paths

If you later want to fully delete the routes too, that's a separate ticket. This one is sidebar-only.

## How to ship

```bash
chmod +x ticket-sidebar-cleanup/apply.sh
ticket-sidebar-cleanup/apply.sh
# Then refresh the browser — Vite HMR has already picked it up
```

## Verification

After apply.sh exits 0:

1. Refresh the dashboard tab in your browser (workspace OR prod, depending where the Vite dev server is reachable from)
2. Sidebar should show 7 items in this order: Today, Prospect: WhatsApp, Prospect: Telegram, Follow-up: WhatsApp, Follow-up: Telegram, Activity, Accounts
3. Click "Prospect: WhatsApp" — should still load the bulk page from 2.3-FE
4. Click "Today" — should still load home

For prod: republish the deployment.

## Replit Agent prompt

```
Apply ticket-sidebar-cleanup from the uploaded zip. This drops 4
legacy menu items from the dashboard sidebar (Seeder, Campaigns,
Prospects, Followups). Routes are not touched; only the sidebar
NAV_ITEMS array and 4 unused lucide-react icon imports.

Steps:

1. Unzip.
   Command: rm -rf ticket-sidebar-cleanup && unzip -o ticket-sidebar-cleanup.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-sidebar-cleanup/apply.sh

3. Run apply.sh.
   Command: ticket-sidebar-cleanup/apply.sh

   3-step script: applies patch (2 anchored edits in layout.tsx),
   runs dashboard typecheck, syncs source-code mirror. NO build step
   (per Defect #11; Vite HMR picks up the change automatically).
   Idempotent.

4. Refresh the workspace dashboard URL in the browser. Confirm the
   sidebar shows 7 items: Today, Prospect: WhatsApp, Prospect: Telegram,
   Follow-up: WhatsApp, Follow-up: Telegram, Activity, Accounts. The
   removed items (Seeder, Campaigns, Prospects, Followups) should no
   longer appear.

5. Report back:
   - apply.sh exit code + last 10 lines
   - Sidebar item count after refresh (should be 7)
   - Any TS errors during typecheck

6. Do NOT republish to prod yet. Wait for Michael's confirmation that
   the workspace sidebar looks right.

Hammer-vs-nail: do not modify any source files yourself.
```

## Audit (Beautiful-Squidward, 9-pass)

Small ticket, but the audit happens regardless.

| Pass | Finding |
| --- | --- |
| 1. Imports correctness | Removed 4 icons; remaining 5 (CalendarClock, Activity, Settings, MessageCircle, Send) are all still referenced in NAV_ITEMS ✓ |
| 2. NAV_ITEMS shape | TypeScript NavItem type unchanged; 7 entries match the type ✓ |
| 3. Route preservation | App.tsx and routes are not touched ✓ |
| 4. isActive() compatibility | Function uses `startsWith(href + "/")`; removed paths still detect correctly if accessed directly ✓ |
| 5. Idempotency | Markers (`CalendarClock,\n  Activity,` and `icon: CalendarClock },\n  { label: "Prospect: WhatsApp"`) are unique to post-patch state; re-runs SKIP ✓ |
| 6. Brace/punctuation balance | Both old and new blocks are syntactically self-contained ✓ |
| 7. Responsive layout | No structural changes to nav element; padding/spacing unchanged ✓ |
| 8. Accessibility | No aria/role changes ✓ |
| 9. Convention check | NAV_ITEMS still uses the same `{ label, href, icon }` shape ✓ |

No issues.

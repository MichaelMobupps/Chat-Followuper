# Ticket prospect-detail — `/prospects/:id` detail page

Adds the per-prospect detail page that completes the list-detail navigation
pattern from the prospects-list ticket. List rows become clickable; clicking
a row navigates to the detail page for that prospect.

## What's in this bundle

```
ticket-prospect-detail/
├── apply.sh                                 5-step idempotent ship script
├── README.md                                this file
├── docs/
│   └── manual-test-prospect-detail.md       walkthrough scenarios
├── patches/
│   ├── patch-app-route.mjs                  App.tsx — route + import
│   └── patch-list-clickable.mjs             ProspectsListTable.tsx — clickable rows
└── new-files/
    └── pages/prospect-detail.tsx            the detail page (single file)
```

## What the page renders

| Section | Content |
| --- | --- |
| Header | Back link + name + company/title + status badge |
| Top action row | Open WhatsApp (if ready & whatsapp channel) · Regenerate message · Delete |
| Prospect data | Read-only fields: name, company, title, country, language, phone, channel, source mode, LinkedIn, Apollo IDs, Telegram, dates |
| Phone reveal | Only shown for non-trivial states (pending / blocked / no_match). Status, audit phoneNumber, status-specific copy explaining what's happening |
| First message | Read-only view + copy-to-clipboard button (server rejects firstMessageBody PATCH; "edit message" defers to a future ticket) |
| Research brief | Collapsed by default. When expanded: pretty-printed view of all brief fields (country, scale tier, daily volume, primary event, hooks, why/validation/how arguments, market context, tangible reasons, competitors, generator metadata) |

## Action behavior

- **Open WhatsApp** → reuses `useWhatsappLink` from 2.3-FE / list page. Opens wa.me link in a new tab, popup-blocker fallback toast.
- **Regenerate message** → calls `generateMessage(id)` (existing endpoint). Disabled if `researchBrief` is null (route returns 409 otherwise; we surface that via tooltip).
- **Delete** → confirmation dialog → `deleteProspect(id)` (existing endpoint) → navigate back to /prospects.

## Explicit v1 deferrals

These were considered and pushed to future tickets to keep this ticket
focused:

- **Edit message manually**. The route's `UpdateProspectInput` rejects `firstMessageBody` (system-only field). To allow edits we'd need a backend relaxation. Future ticket.
- **Re-research per prospect**. Would solve the bulk-flow stub-brief quality issue, but needs a new BE endpoint (research currently SSE-streams in the seeder create flow). Future ticket — most-pull-through follow-up to this one.
- **Mark sent manually**. Minor extension; defer.
- **Activity log per prospect**. Needs new BE endpoint scoped to one prospect. Future ticket.
- **Edit prospect fields** (company, title, etc). Existing PATCH supports it; UI not built in v1.

## How to ship

```bash
chmod +x ticket-prospect-detail/apply.sh
ticket-prospect-detail/apply.sh
# Vite HMR picks up changes — refresh browser
# When ready, republish prod
```

## Audit (Beautiful-Squidward, 9-pass)

| Pass | Finding |
| --- | --- |
| 1. Imports correctness | All imports resolve to either existing files or libraries; `useParams`, `useLocation`, `Link` from wouter are standard ✓ |
| 2. Route order | `/prospects/:id` registered after `/prospects` in App.tsx; wouter Route patterns are exact, no conflict ✓ |
| 3. Status semantics parity with list page | `computeStatus` here exactly mirrors the BE `computeProspectStatus` and FE list-page logic ✓ |
| 4. Auth scoping | All hooks / mutations route through existing API client which sends cf_session cookie; auth-gate is server-side per existing routes ✓ |
| 5. Convention check (route paths in routes/prospects.ts) | This ticket touches NO backend routes; existing GET/PATCH/DELETE/:id already use the correct `/prospects/:id` path. **Defect #12 doesn't apply here** — no new BE routes added. ✓ |
| 6. Click-target isolation in list rows | The action button cell is marked `data-action="true"`; row-click handler walks up the event target and skips clicks that originated inside such a cell. Other cells (name, company, status) bubble up correctly ✓ |
| 7. Empty/loading/error states | All three branched in the page; isError surfaces the error code/message; loading shows spinner ✓ |
| 8. Cache invalidation on mutations | Regenerate invalidates both `["prospect", id]` and `["prospects-list"]`; Delete invalidates the list and navigates away ✓ |
| 9. Hammer-vs-nail on lib/api/prospects.ts | This ticket only READS from the existing API client; no new exports, no patches. ✓ |

No issues found.

## Replit Agent prompt

```
Apply ticket-prospect-detail from the uploaded zip. Adds /prospects/:id
detail page (view, regenerate, delete, open WhatsApp). Wires list rows to
navigate to it.

Steps:

1. Unzip.
   Command: rm -rf ticket-prospect-detail && unzip -o ticket-prospect-detail.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-prospect-detail/apply.sh

3. Run apply.sh.
   Command: ticket-prospect-detail/apply.sh

   5-step script: 2 anchored patches (App.tsx, ProspectsListTable.tsx) +
   copy 1 new file + dashboard typecheck + sync. NO build (Defect #11).
   Idempotent.

4. After apply.sh exits 0, refresh the dashboard tab in browser.

5. Click "Prospects" in sidebar. If you have prospects in the DB,
   click any row — should navigate to /prospects/<id>.

6. Walk through scenarios in docs/manual-test-prospect-detail.md.

7. Report back:
   - apply.sh exit code + last 10 lines
   - dashboard typecheck output
   - Whether row-click navigation works
   - First-render result for /prospects/:id

8. Do NOT republish to prod yet.

Hammer-vs-nail: do not modify any source files yourself.
```

## What this unblocks

- **Re-research per prospect** is now a small follow-up: add a backend endpoint, add a button to this page. The page surface is in place.
- **Edit message** likewise: small route relaxation + textarea swap-in on this page.
- **Per-prospect activity log** can drop into a new card on this page.
- **Mark sent**: same.

The detail page is the foundation for all per-prospect actions going forward.

# Ticket prospects-list — `/prospects` list page + `GET /api/prospects`

Replaces the 240-byte placeholder at `/prospects` with a real list view.
Adds the `GET /api/prospects` backend endpoint that the file's own
header comment said would ship with this ticket.

## What's in this bundle

```
ticket-prospects-list/
├── apply.sh                                 9-step idempotent ship script
├── README.md                                this file
├── docs/
│   └── manual-test-prospects-list.md        9-scenario walkthrough
├── patches/
│   ├── patch-be-prospects-list.mjs          drizzle imports + GET / endpoint
│   ├── patch-fe-prospects-types.mjs         list types + listProspects fn
│   └── patch-sidebar-readd-prospects.mjs    re-add Prospects nav entry
└── new-files/
    ├── hooks/use-prospects-list.ts          tanstack-query hook
    ├── components/prospects-list/
    │   ├── ProspectsListFilters.tsx         filter bar
    │   └── ProspectsListTable.tsx           table + pagination + actions
    └── pages/prospects.tsx                  page-level composition
```

## Status semantics — single source of truth (server-side)

The server computes status from prospect row state. FE renders the
labels but never recomputes:

| Status | Rule |
| --- | --- |
| `sent` | `firstMessageSentAt` is set |
| `phone-blocked` | webhook returned geo-block (terminal) |
| `phone-no-match` | webhook returned no_match (terminal) |
| `phone-pending` | phone is null and no terminal webhook outcome |
| `ready` | phone set AND firstMessageBody set |
| `draft` | phone set AND no firstMessageBody |

Order of checks matters: `sent` dominates everything else, then
terminal failures, then phone presence, then message presence.

## Endpoint shape

```
GET /api/prospects
  ?page=1
  &perPage=25                                     # max 100
  &status=ready|draft|phone-pending|sent|...      # optional
  &channel=whatsapp|telegram|teams                # optional
  &country=IN                                     # optional, ISO 2-letter
  &search=hello                                   # optional, matches name+company
  &sortBy=createdAt|updatedAt|prospectName        # default createdAt
  &sortDir=asc|desc                               # default desc

→ 200 {
    prospects: ProspectListItem[],
    total: number,
    page: number,
    perPage: number
  }
```

Auth-gated, scoped by userId.

## How to ship

```bash
chmod +x ticket-prospects-list/apply.sh
ticket-prospects-list/apply.sh
# Then restart the api-server workflow (Defect #7)
# Dashboard picks up via HMR — no workflow restart needed
```

## Scope notes

- **No new schema columns.** Uses existing `prospects` table fields only.
- **No new ACTION_TYPES.** Read-only endpoint.
- **No backend tests.** The route reuses patterns from the existing CRUD handlers; add to `tests-shared-session-helper` backlog if more coverage is wanted.
- **Sidebar entry returns.** This patch re-adds the "Prospects" nav item that `sidebar-cleanup` removed. Idempotent regardless of whether cleanup was applied — if cleanup wasn't applied, the patch is a no-op for the sidebar.
- **Action button (per row) only handles WhatsApp ready state.** Telegram and Teams adapters are stubs; their rows show a disabled action. SDR can still see them in the list with status badges.

## Audit (Beautiful-Squidward, 9-pass)

| Pass | Finding |
| --- | --- |
| 1. BE imports correctness | New drizzle imports (`asc`, `count`, `desc`, `ilike`, `isNotNull`, `isNull`, `ne`, `or`) all referenced in the new handler ✓ |
| 2. BE schema validation | `listProspectsQuerySchema` covers all filters with sane defaults; `z.coerce.number()` handles string-from-querystring numbers ✓ |
| 3. BE status filter equivalence | SQL predicates exactly mirror the JS `computeProspectStatus` order — both check sent first, then terminal failures, then phone presence, then message presence. Verified by comparing the two functions case-by-case ✓ |
| 4. BE auth scoping | `eq(prospectsTable.userId, user.id)` is the FIRST filter; cannot be bypassed by query params (no way to inject userId externally; Zod schema doesn't accept it) ✓ |
| 5. FE-BE type parity | FE `ProspectStatus` enum exactly matches BE `PROSPECT_STATUSES` array; FE `ProspectListItem` matches the BE response shape ✓ |
| 6. FE pagination correctness | Total page count `Math.max(1, Math.ceil(total / perPage))` handles total=0; prev/next disabled at boundaries; "Showing X–Y of Z" math correct (verified for edge cases: total=0, total=1, total=perPage, total=perPage+1) ✓ |
| 7. FE filter UX | Changing any filter resets to page 1 (avoids being stranded on a now-empty page 5); sortBy/sortDir/page changes do NOT reset ✓ |
| 8. FE empty/loading/error states | All three branched in `ProspectsListTable`; `keepPreviousData` prevents flash-empty between filter transitions ✓ |
| 9. Sidebar idempotency | Patch checks marker (the literal nav line text); SKIPs if cleanup not applied (entry already there); APPLYs if cleanup was applied (entry needs re-adding) ✓ |

No issues found.

## Replit Agent prompt

```
Apply ticket-prospects-list from the uploaded zip. This adds the
GET /api/prospects backend endpoint and replaces the /prospects
placeholder page with a real list view (filters, sort, pagination,
status badges, action buttons).

Steps:

1. Unzip.
   Command: rm -rf ticket-prospects-list && unzip -o ticket-prospects-list.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-prospects-list/apply.sh

3. Run apply.sh.
   Command: ticket-prospects-list/apply.sh

   9-step script: 3 patches (BE routes, FE prospects.ts, sidebar layout)
   + copies 4 new files (hook, 2 components, page) + root typecheck +
   api-server build + sync. Idempotent.

4. After apply.sh exits 0, restart the api-server workflow (Defect #7).
   Dashboard picks up via Vite HMR — no dashboard workflow restart needed.

5. Refresh the dashboard tab. Click "Prospects" in the sidebar (it
   should now appear if it was missing after sidebar-cleanup).

6. Walk through scenarios in docs/manual-test-prospects-list.md.

7. Report back:
   - apply.sh exit code + last 20 lines
   - api-server build size
   - Whether the Prospects sidebar entry is visible
   - Whether the list page renders (with real prospects from prior
     bulk-flow tests, or empty state if no prospects exist yet)
   - Manual test pass count (scenarios 1-9)

8. Do NOT republish to prod yet. Wait for Michael's confirmation.

Hammer-vs-nail: do not modify any source files yourself.
```

## What this unblocks

- Mailgun reminder emails (backlog #6) can link into `/prospects?status=ready` and `/prospects?status=phone-pending`
- Per-prospect detail page (`/prospects/:id`) becomes a natural follow-up — clicking a row could navigate there
- Re-engagement workflows: filter to `sent`, sort by `firstMessageSentAt`, decide on follow-up cadence
- Phone-pending visibility: SDR can see which "maybe" reveals are still in flight without remembering them from the bulk batch

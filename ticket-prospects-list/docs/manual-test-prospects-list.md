# Manual test — Ticket prospects-list

The list page is at `/prospects`. Scenarios assume you have at least
some prospects in the DB (from prior bulk-flow tests). If the DB is
empty, only scenarios 1, 2, 8 are meaningful.

## Scenarios

### 1. Sidebar entry visible

**Action**: Refresh the dashboard.

**Expected**: Sidebar shows "Prospects" between "Follow-up: Telegram"
and "Activity". 8 items total (or 9 if all original items including
this one).

### 2. First render — empty or populated

**Action**: Click "Prospects" in the sidebar.

**Expected**: Page titled "Prospects" loads. Either:
- **If DB has prospects**: filter card + table with rows + pagination at bottom
- **If DB is empty**: filter card + empty-state card saying "No prospects yet"

Subtitle shows total count: "N total." (N can be 0).

### 3. Status badges render with correct colors

Find rows of each status type. Expected color coding:
- `Ready` (green)
- `Sent` (blue)
- `Draft` (gray/muted)
- `Phone pending` (amber/orange)
- `Geo-blocked` (red)
- `No phone` (red)

If you don't have rows of every type, that's OK — just verify the
ones present render with color-coded badges and the right icon.

### 4. Filter by status

**Action**: Pick "Ready" from the Status dropdown.

**Expected**:
- Table refreshes (with brief loading spinner; old data may briefly
  remain due to `keepPreviousData`)
- Only rows with `Ready` badge visible
- Total count in subtitle updates
- Page resets to 1 if you were on a later page

**Action**: Pick "Phone pending".

**Expected**: Same behavior, only phone-pending rows visible.

**Action**: Click "Clear filters" link.

**Expected**: All filters reset, table shows all prospects again.

### 5. Search

**Action**: Type a fragment of a known prospect's name or company in
the Search box.

**Expected**:
- Table narrows to rows where prospectName OR company contains the
  fragment (case-insensitive)
- Total count updates
- Search is debounced at the URL layer (each keystroke triggers a new
  query — fine for <1000 prospects; we'll add debouncing if needed)

### 6. Country filter

**Action**: Type "US" or another 2-letter country code in the Country
input.

**Expected**: Only rows with that country show. Empty result if no
prospects in that country.

### 7. Sort

**Action**: Change "Sort by" from "Created" to "Name". Click the
direction button to toggle ↓/↑.

**Expected**:
- Table re-sorts. Note: prospect names with `null` may sort differently
  by DB collation; this is acceptable.
- Direction toggle visually flips the arrow
- Pagination preserved (you stay on the page you were on)

### 8. Empty state

**Action 8a (if DB has prospects)**: Apply a filter that returns no
results (e.g., country "ZZ").

**Expected**: Empty-state card: "No prospects yet — Create some via
the Prospect: WhatsApp or Prospect: Telegram pages. Or adjust your
filters above."

**Action 8b (if DB has 0 prospects)**: Just visit /prospects.

**Expected**: Same empty state without filters applied.

### 9. Action button — Open WhatsApp on Ready row

**Pre-req**: At least one prospect in `Ready` state with channel =
`whatsapp`.

**Action**: Click the "Open" button on its row.

**Expected**:
- New tab opens to `https://wa.me/<phone>?text=<message>`
- If browser blocks the popup, a destructive toast appears

For non-WhatsApp ready rows (Telegram/Teams), button shows
"Open (telegram)" or similar but is disabled. Acceptable v1 limitation.

For non-Ready rows, action column shows "—".

### 10. Pagination

**Pre-req**: More than 25 prospects total.

**Action**: Use the "Next" / "Prev" buttons at the bottom of the
table.

**Expected**:
- Each click changes the page; URL doesn't change (filter state is
  component-local for v1)
- "Showing X–Y of Z" updates correctly
- "1 / N" page indicator updates
- "Prev" disabled on page 1, "Next" disabled on last page

### 11. Filter + pagination interaction

**Action**: Go to page 3 (or last page). Apply a filter that narrows
the result set significantly.

**Expected**: Page resets to 1 automatically (avoids being stranded
on a now-empty page).

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Sidebar still missing "Prospects" entry | `sidebar-readd-prospects.mjs` patch SKIPed because cleanup wasn't applied AND the layout was modified manually | Inspect layout.tsx; revert to a known state, re-run apply.sh |
| GET /api/prospects returns 401 | Session cookie expired | Refresh the page, log in again |
| GET returns 500 with "ne" undefined | Drizzle import edit didn't pick up `ne` | Check the patched routes/prospects.ts imports section; rerun apply.sh; check evidence output |
| Table renders but action button is missing for ready rows | Channel field is null on those rows | Check the prospect's `firstMessageChannel` in DB; the bulk-flow setter should have stamped `whatsapp` |
| Status filter returns wrong rows | `statusSqlFilter` SQL doesn't match `computeProspectStatus` | Compare the two functions in routes/prospects.ts case-by-case; should be identical logic |
| Page numbers go backwards | `keepPreviousData` isn't holding old data, causing a flash that triggers the page-reset effect | Check tanstack-query version; should be 5.x; verify `keepPreviousData` import |

## When something is wrong

Don't try to patch components yourself. Pull the affected component
file, paste in chat, describe symptom. Targeted hotfix bundle is the
legitimate path.

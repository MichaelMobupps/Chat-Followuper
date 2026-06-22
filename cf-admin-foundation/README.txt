Chat Followuper - Admin foundation (api-server only)
====================================================

The secure backend for the manager console, deployed before the screen that
sits on it. No new dependencies, no database migration.

WHAT THIS ADDS
  new files:
    src/lib/admin.ts        admin allowlist from the ADMIN_EMAILS setting
    src/routes/admin.ts     GET /api/admin/whoami  (any signed-in user)
                            GET /api/admin/activity (admin only)
  edited:
    src/middlewares/auth.ts  adds requireAdmin (403 for non-admins)
    src/routes/index.ts      registers the admin router

HOW ADMIN IS DECIDED
  The ADMIN_EMAILS setting (comma-separated) lists the admins, mirroring how
  ALLOWED_LOGIN_DOMAINS lists who may log in. No role column, no migration.
  Everyone not listed is a salesperson and stays isolated to their own data.

WHAT THE FEED RETURNS
  GET /api/admin/activity returns every salesperson grouped, each with their
  recent activity, per-event cost where recorded, and a total spend pulled
  from the daily usage rollup, plus grand totals. It is the only place the
  per-user isolation is crossed for reads, and it is reachable only behind
  requireAdmin.

RUN (from your monorepo root)
  bash cf-admin-foundation/apply.sh

  It validates the edits, swaps in the new files, typechecks (halting only if
  a file this bundle touches has an error), and runs the esbuild build.

SET THE ADMIN (Secrets pane)
  ADMIN_EMAILS = michael@mobupps.com
  (comma-separate to add more admins later)

AFTER APPLY
  Restart, then Republish.

NEXT
  The visible Activity screen, a frontend deploy that reads this feed and
  shows it grouped by salesperson with the cost columns and filters. Then the
  pause-another-rep control, and the Accounts settings screen.

AUDIT (v2)
  Verified: the gate is airtight and fails closed. requireAdmin needs a real
  signed-in session and an allowlisted email; the feed sits behind both
  requireAuth and requireAdmin; a non-admin gets 403; an unset ADMIN_EMAILS
  makes no one an admin rather than everyone. The email comes from the signed
  session and the verified Google login, so it cannot be forged. whoami
  returns only the caller's own status. The feed extracts the cost number
  from each event and never the rest of the metadata, so no prospect names,
  phones, or message bodies pass through it. Spend totals come from the
  authoritative daily rollup, so the accountant figure is exact.

  Fixed in v2: each rep now carries an accurate all-time totalEventCount,
  separate from recentEventCount and the windowed events list, so the manager
  numbers are not understated when the recent window is crowded by another
  rep's activity.

BLAST RADIUS
  Additive and read-only. New /api/admin/* endpoints with no route collision,
  a new requireAdmin export that leaves requireAuth and loadUser untouched,
  and a new pure helper file. No schema change, migration, or dependency. The
  feed only reads; the cross-user write, pausing another rep, is deliberately
  not in this bundle and gets its own pass. esbuild bundles the new files
  through the existing entry. Existing routes and behavior are unchanged.

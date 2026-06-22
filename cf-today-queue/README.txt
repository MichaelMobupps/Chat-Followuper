Chat Followuper - Today daily queue (dashboard only)
====================================================

Replaces the empty "Today" placeholder with the real daily queue: the
WhatsApp follow-ups that are due now, each showing the message, an Edit
button, and a one-click Open in WhatsApp. The rep presses send in WhatsApp,
same manual-send principle as the rest of the app.

WHAT THIS CHANGES
  one file: dashboard .../pages/today.tsx (placeholder -> real queue)
  no new files, no new dependencies. Reuses the existing follow-up list
  hook, the send hook, and the edit dialog that power the Follow-up screen.

SCOPE
  Shows WhatsApp follow-ups due now (next scheduled time has passed, prospect
  not paused and not replied), soonest first. Telegram joins this screen once
  its send path is built, which is a separate task.

RUN (from your monorepo root)
  bash cf-today-queue/apply.sh

  It backs up today.tsx, swaps in the new screen, typechecks (halting only if
  the new file itself has an error), and runs the vite build that produces the
  deployable assets.

AFTER APPLY
  Restart, then Republish, to put the new "Today" screen on your live URL.

NEXT SCREENS (not in this bundle)
  Activity log and the Accounts/settings screen, on your word.

AUDIT (v2)
  Verified: a send and an edit both invalidate the whole followups cache, so
  this screen drops sent items and reflects edited messages with no stale
  state; the data shapes, hooks, and edit dialog are wired correctly; the
  server's not_yet_sent filter already excludes paused and replied.

  Fixed in v2: the list is server-paginated and ordered by updated time while
  "due now" is filtered on the client, so a large queue could hide due items
  on a later page. The fetch now pulls the server's maximum page of 100,
  which covers any realistic queue. The complete fix, when a rep ever exceeds
  100 unsent prospects, is a backend query that returns due follow-ups
  ordered by scheduled time. That is a separate small task.

  Consistent with the existing Follow-up screen, not introduced here: the
  open-in-WhatsApp action runs window.open after the send call resolves, so a
  strict popup blocker can suppress the tab; and clicking it records the send,
  the same manual-send model the rest of the app uses.

BLAST RADIUS
  Replaces the Today placeholder only. Adds one call to the existing
  GET /api/followups on view, and uses the existing send and edit endpoints.
  No new files, dependencies, routes, backend, or schema changes. A send or
  edit here refreshes all follow-up lists, which is the app's existing and
  intended behavior.

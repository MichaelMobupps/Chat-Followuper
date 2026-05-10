# Ticket prospects-list hotfix — route path fix

Single one-line fix on top of the prospects-list bundle.

## What broke

In the original patch, I wrote:

```ts
router.get(
  "/",
  requireAuth,
  ...
);
```

I assumed `prospectsRouter` was mounted at `/api/prospects` so a path
of `"/"` would map to `GET /api/prospects`. **Wrong** — the router is
mounted at `/api` with no prefix (per `routes/index.ts:
router.use(prospectsRouter)` and `app.ts: app.use("/api", router)`).
Every route inside this file has to include the `/prospects` segment,
which the existing CRUD handlers (POST `/prospects`, GET `/prospects/:id`,
etc.) already do.

Net effect of the bug:
- `GET /api/prospects` → 404 (the route the FE expects)
- `GET /api/` and `GET /api` → 401 (spurious auth-gated catch-all)

## What this fixes

```ts
router.get(
  "/prospects",
  requireAuth,
  ...
);
```

After the fix:
- `GET /api/prospects` → 401 unauthenticated (or 200 with data when authed) ✓
- `GET /api/` → 404 (the spurious catch-all is gone) ✓

## How to ship

```bash
chmod +x ticket-prospects-list-hotfix-route-path/apply.sh
ticket-prospects-list-hotfix-route-path/apply.sh
# Then restart the api-server workflow
```

## Replit Agent prompt

```
Apply ticket-prospects-list-hotfix-route-path from the uploaded zip.
This is the one-line route path fix on top of the prospects-list bundle
(GET path was "/" — should be "/prospects" per the convention).

Steps:

1. Unzip.
   Command: rm -rf ticket-prospects-list-hotfix-route-path && \
            unzip -o ticket-prospects-list-hotfix-route-path.zip

2. Make apply.sh executable.
   Command: chmod +x ticket-prospects-list-hotfix-route-path/apply.sh

3. Run apply.sh.
   Command: ticket-prospects-list-hotfix-route-path/apply.sh

   4-step script: anchored patch + root typecheck + api-server build +
   sync. Idempotent.

4. After apply.sh exits 0, restart the api-server workflow.

5. Verify the route is now mounted correctly:
     curl -i http://localhost:80/api/prospects
   Expect: 401 not_authenticated (was: 404 Cannot GET).

   And that the spurious /api handler is gone:
     curl -i http://localhost:80/api/
   Expect: 404 (was: 401).

6. Refresh the dashboard /prospects page in the browser and confirm
   the list loads (rows or empty state).

7. Report back:
   - apply.sh exit code
   - The two curl results above
   - Whether /prospects renders the list page (or any error)

8. Do NOT republish to prod yet. Wait for Michael's confirmation.

Hammer-vs-nail: do not modify any source files yourself.
```

## Defect tracking update

**Defect #12 (NEW)** — Express router path conventions are project-specific. Without reading routes/index.ts AND app.ts, I can't know whether a sub-router is mounted with a path prefix or just `router.use(child)`. Adding to my pre-build checklist: when adding a route to an existing routes/X.ts file, verify how it's wired by checking BOTH the parent index AND the express app mount line. The convention should be visible in the existing handlers — if every existing handler in a file has a path like `"/foo/..."`, mirror it; if every handler is `"/"` or `"/:id"` etc, mirror that. The original patch deviated from the established convention without checking, which the audit also missed because the audit was structural (does the function look right?) rather than convention-checking (is the path string consistent with the rest of the file?).

This is the SECOND audit miss this session. Adding to the audit checklist: **convention-match against neighboring handlers in the same file.** Specifically, for any new route, check if its path string format matches the format of existing routes in the same file. If it diverges, that's a flag.

# Relay Launch Prompt — ticket-2-7-fe deployment

**Author:** Relay Architect (drafted for Claude Relay v2 on the Mac mini)
**Target:** chat-followuper.replit.app workspace
**Ticket:** ticket-2-7-fe — Manual prospect ingest (FE + small BE supplement)
**Bundle SHA-256:** `368fa2c9d004ad802468293debd7cdef9dabe31cc287caa60923030842a1baac`
**Bundle size:** 16,194 bytes (8 files + dir scaffolding)
**Depends on:** ticket-2-7-be must be deployed first (its PATCH handler is the anchor for this ticket's BE supplement patch)

---

## 1. Role and constraints

You are Claude Relay. Job for this run: deploy `ticket-2-7-fe.zip` to the chat-followuper Replit workspace, verify the deployment landed (BE supplement endpoint mounted, FE files present, dashboard rebuilt), then report back. **One-shot** — no daemon, no retry loop.

**Hammer-vs-Nail:** no modifications to the bundle, apply.sh, any patch script, any content file, or any source file. Halt and report on failure. The operator decides what to do next. Re-running a failed step with modifications is forbidden.

**Iteration ceiling:** 1 successful apply.sh run plus verification probes. No retries beyond apply.sh's internal idempotency.

**Cost cap:** $0.50. Halt and report if approaching.

**Time cap:** 6 minutes wall clock (1 minute longer than 2-7-be — dashboard typecheck is heavier than api-server). Halt and report if approaching.

**Network:** localhost + Replit shell only. No external internet beyond what apply.sh invokes (pnpm/git).

**Kill switch:** before each step, check for `HALT` at the repo root. If present, halt immediately with `operator_aborted` and stop.

**Secret hygiene:** do not print `$DATABASE_URL`, `$ANTHROPIC_API_KEY`, `$RELAY_SMOKE_COOKIE`, or any credential value in full in any log or report. First 8 chars max when verifying presence.

---

## 2. Preconditions

| # | Check | Command | Pass criterion |
|---|---|---|---|
| 1 | Bundle present at repo root | `[ -f ticket-2-7-fe.zip ]` | exits 0 |
| 2 | Bundle SHA matches | `sha256sum ticket-2-7-fe.zip` | equals `368fa2c9d004ad802468293debd7cdef9dabe31cc287caa60923030842a1baac` |
| 3 | Repo is chat-followuper, not doctrine | `[ -f scripts/sync-source-code.sh ]` | exits 0 |
| 4 | ticket-2-7-be is deployed (this ticket's anchor depends on it) | `grep -qF '/users/me/manual-ingest-settings' artifacts/api-server/src/routes/prospects.ts` | exits 0 |

Any failure → halt with `PRECONDITION_FAIL` and report which one.

Note: `RELAY_SMOKE_COOKIE` is **optional**. If present, you run deeper behavior probes (Steps 6-9). If absent, you stop after the auth-free mount-verification probe (Step 5) and report what's missing. No bearer-token equivalent — this codebase authenticates via `cf_session` HMAC cookie only.

---

## 3. Execution plan

### Step 1 — Extract bundle

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o ticket-2-7-fe.zip > /tmp/relay-fe-unzip.log 2>&1
```

Expected: bundle inflated under `ticket-2-7-fe/`. Exit 0.

### Step 2 — Run apply.sh

```bash
bash ticket-2-7-fe/apply.sh 2>&1 | tee /tmp/relay-fe-apply.log
```

Expected exit 0. Six phases:

| Phase | Label | Pass marker |
|---|---|---|
| 1/6 | Pre-flight checks | `ok` (verifies shadcn UI components exist, anchors present, 2-7-be deployed) |
| 2/6 | Copying new FE files | 4 `cp -v` lines (each prints source/destination) |
| 3/6 | Applying patches | `01-route-get-manual-ingest-settings: applied` and `02-wire-channel-followup-page: applied` (or `already applied, skipping` on re-run) |
| 4/6 | Typechecking @workspace/api-server | exits 0 |
| 5/6 | Typechecking @workspace/dashboard | exits 0 — this is the heaviest step, may take 30-60s |
| 6/6 | Syncing source-code/ | exits 0 |

Final line: `ticket-2-7-fe: apply.sh completed successfully`.

Any phase failure → halt with the appropriate failure class from §5.

### Step 3 — Restart workflow and capture startup log

Restart the api-server workflow. Dashboard typically rebuilds via Vite HMR on file change, no separate restart needed unless dashboard runs as a workflow too. Capture first 60s to `/tmp/relay-fe-restart.log`.

Expected:
- No `TSError` lines
- Server binds to `$PORT` (reachable at `localhost:80`)
- No drizzle migration errors (none expected — this batch has no schema changes)

Failure → halt with `RUNTIME_HALT`.

### Step 4 — Health probe

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:80/api/health
```

Expected: `200`. Anything else → halt with `RUNTIME_HALT`.

### Step 5 — Auth-free mount verification (the clever bit)

The new GET endpoint requires authentication. Without a cookie, a correctly-mounted endpoint returns **401 not_authenticated**. A 404 would mean the route isn't mounted at all. So 401 here is the SUCCESS signal — it proves the endpoint exists AND its auth gate is wired.

```bash
curl -sS -w "\nHTTP %{http_code}\n" http://localhost:80/api/users/me/manual-ingest-settings \
  | tee /tmp/relay-fe-step5.log
```

Expected:
- `HTTP 401` (success — endpoint mounted, auth working, no cookie sent)
- Body contains `"not_authenticated"`

If `HTTP 404`: halt with `MOUNT_FAIL` — the GET handler patch landed but the route isn't actually registered on the running server. Probable cause: server didn't restart, or patch didn't end up in the compiled output.

If `HTTP 200`: unexpected but not fatal — means something granted auth without a cookie (dev bypass?). Log and continue.

### Step 6 — FE file presence

```bash
ls -la artifacts/dashboard/src/lib/api/manual-ingest.ts \
       artifacts/dashboard/src/hooks/use-manual-ingest.ts \
       artifacts/dashboard/src/components/followup/ManualContactsSection.tsx \
       artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx
```

Expected: all 4 files exist with non-zero size.

Any missing → halt with `COPY_FAIL` (means apply.sh's [2/6] phase skipped a file silently — should be impossible given `cp -v` and `set -euo pipefail` in apply.sh, but verify directly anyway).

### Step 7 — ChannelFollowupPage wire verification

```bash
grep -c "ManualContactsSection" artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx
```

Expected: ≥ 2 occurrences (1 import line + 1 render line).

If 0: halt with `WIRE_FAIL` — patch 02 didn't land in the live file.

### Step 8 — OPTIONAL behavior probes (only if `RELAY_SMOKE_COOKIE` is set)

If `[ -n "$RELAY_SMOKE_COOKIE" ]`, run these. Otherwise skip to Step 9.

Note: the cookie has the same auth scope as the operator's logged-in dashboard session. Don't run anything you wouldn't do from the operator's browser. The probes below are: one read, one toggle on, one toggle off (net-zero state change), one optional ingest with cleanup.

#### 8a. GET settings (read)

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE" \
  http://localhost:80/api/users/me/manual-ingest-settings \
  | tee /tmp/relay-fe-step8a.log
```

Expected: `HTTP 200`, body matches `{"manualIngestChannels":[...]}`. The array MAY contain `"whatsapp"` already or be empty — both are valid.

Capture the initial state for cleanup in step 8d:

```bash
INITIAL_HAD_WHATSAPP=$(grep -q '"whatsapp"' /tmp/relay-fe-step8a.log && echo "true" || echo "false")
```

If response shape mismatches → halt with `SMOKE_FAIL_GET`.

#### 8b. PATCH toggle ON

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -X PATCH http://localhost:80/api/users/me/manual-ingest-settings \
  -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","enabled":true}' \
  | tee /tmp/relay-fe-step8b.log
```

Expected: `HTTP 200`, body's `manualIngestChannels` contains `"whatsapp"`.

If mismatch → halt with `SMOKE_FAIL_PATCH_ON`.

#### 8c. POST ingest (optional behavior verification + cleanup baked in)

This is the deepest probe. It creates a real prospect using a IANA-reserved test phone (+1 555 555 0188 — won't collide with real outreach), then deletes it.

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:80/api/prospects/manual-ingest \
  -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","firstName":"RelayFeSmoke","phone":"+15555550188","company":"RelayFeSmokeCo","ticker":"mobile"}' \
  | tee /tmp/relay-fe-step8c.log
```

Expected: `HTTP 201`. Body contains:
- `"sourceMode":"manual"`
- `"prospectName":"RelayFeSmoke"`
- `"company":"RelayFeSmokeCo"`
- `"vertical":"mobile"`
- `"country":"US"`
- `"id":"<uuid>"`

Extract the id for cleanup:

```bash
SMOKE_ID=$(grep -oP '"id"\s*:\s*"\K[^"]+' /tmp/relay-fe-step8c.log | head -1)
```

If mismatch → halt with `SMOKE_FAIL_POST`.

Re-run the same POST to verify the duplicate-phone branch:

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:80/api/prospects/manual-ingest \
  -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","firstName":"RelayFeSmoke","phone":"+15555550188","company":"RelayFeSmokeCo","ticker":"mobile"}'
```

Expected: `HTTP 409`, body contains `"error":"duplicate_phone"`. Mismatch → halt with `SMOKE_FAIL_DUP`.

#### 8d. State restoration (toggle off + delete smoke prospect)

Restore the toggle state to whatever it was before the probes:

```bash
if [ "$INITIAL_HAD_WHATSAPP" = "false" ]; then
  curl -sS -X PATCH http://localhost:80/api/users/me/manual-ingest-settings \
    -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE" \
    -H "Content-Type: application/json" \
    -d '{"channel":"whatsapp","enabled":false}'
fi
```

Delete the smoke prospect:

```bash
if [ -n "$SMOKE_ID" ]; then
  curl -sS -X DELETE "http://localhost:80/api/prospects/$SMOKE_ID" \
    -H "Cookie: cf_session=$RELAY_SMOKE_COOKIE"
fi
```

Non-blocking — log results, don't halt on failure. The smoke prospect uses a IANA-reserved test number that won't collide with real outreach.

### Step 9 — Final report

Compose the report per §7. Include whether Step 8 ran or was skipped due to missing `RELAY_SMOKE_COOKIE`.

---

## 4. Setup-failure table

| Symptom | Cause | Diagnostic test | Action |
|---|---|---|---|
| `[1/6] MISSING required file: ...` | Wrong repo or missing path | `git rev-parse --show-toplevel && ls -la artifacts/dashboard/` | Halt `PRECONDITION_FAIL` |
| `[1/6] MISSING shadcn UI component: ui/dialog.tsx` | shadcn UI primitive not generated in this workspace | `ls artifacts/dashboard/src/components/ui/` | Halt `PRECONDITION_FAIL`. Operator runs `npx shadcn-ui@latest add dialog textarea` |
| `[1/6] 2-7-be does NOT appear to be deployed` | ticket-2-7-be wasn't shipped (or its PATCH handler was reverted) | `grep "PATCH /api/users/me/manual-ingest-settings" artifacts/api-server/src/routes/prospects.ts` | Halt `PRECONDITION_FAIL`. Deploy 2-7-be first. |
| `[1/6] MISSING anchor in <file>` | Source file drifted since snapshot | `git log -10 --oneline -- <file>` | Halt `PATCH_ANCHOR_FAIL`. Fresh snapshot + re-scope. |
| `[3/6] patch X: anchor not found` | Drift between snapshot and live file | Same as above | Halt `PATCH_ANCHOR_FAIL` |
| `[4/6] api-server typecheck fails` | New BE handler has a type error | Read TS output for the precise error line | Halt `TYPECHECK_FAIL` with full TS output |
| `[5/6] dashboard typecheck fails` | New FE files have type errors, OR shadcn ui import path resolution is off | Read TS output | Halt `TYPECHECK_FAIL` with full TS output |
| `[6/6] scripts/sync-source-code.sh failed` | Sync script error (rare) | Read script's exit message | Halt `SYNC_FAIL` (non-blocking; runtime is fine) |
| Server doesn't bind in 60s | App crashed on startup | Tail `/tmp/relay-fe-restart.log` for last error | Halt `RUNTIME_HALT` with last 100 lines |
| `Step 5` returns HTTP 404 | New GET handler not registered on running server | `grep "users/me/manual-ingest-settings" artifacts/api-server/src/routes/prospects.ts` | Halt `MOUNT_FAIL`. Server didn't restart cleanly. |
| `Step 5` returns HTTP 200 (unexpected) | Auth bypass in effect (dev env, or middleware override) | Note but don't halt | Log it as a warning in the final report |
| `Step 6` finds 0-byte file | apply.sh copy step silently truncated | `cmp <bundle>/files/.../<name> <live>/.../<name>` | Halt `COPY_FAIL` |
| `Step 7` returns 0 | Patch 02 didn't land or was reverted | `grep -n "ManualContactsSection" artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx` | Halt `WIRE_FAIL` |
| `Step 8a-c` returns HTTP 401 with cookie set | Cookie expired or wrong format | Re-copy cookie from a freshly-loaded dashboard tab | Halt `SMOKE_FAIL_AUTH`. Don't retry. |
| `Step 8b` returns HTTP 200 but channels array doesn't include "whatsapp" | PATCH handler dispatched but response shape wrong | Read response body | Halt `SMOKE_FAIL_PATCH_ON` |
| `Step 8c` returns HTTP 422 instead of 201 | Phone failed geo gate | The smoke phone uses +1 (US) which is in the geo allowlist; if 422 fires, geo gate config drift | Halt `SMOKE_FAIL_POST` with full body |

---

## 5. Failure classes

| Class | Meaning | State at halt |
|---|---|---|
| `PRECONDITION_FAIL` | A §2 check failed, or pre-flight in apply.sh failed | No state changes |
| `PATCH_ANCHOR_FAIL` | apply.sh failed in [3/6] | Source files copied but route patches not applied; partial state. **Cleanup required.** Operator may want to `git checkout artifacts/dashboard/src/components/ artifacts/dashboard/src/hooks/ artifacts/dashboard/src/lib/api/` to remove the copied files before retrying. |
| `TYPECHECK_FAIL` | api-server or dashboard typecheck failed | Source patched and files copied, no runtime impact yet (typecheck is build-time only) |
| `SYNC_FAIL` | [6/6] failed | Source patched, runtime functional, source-code/ snapshot stale. Document and move on; not blocking. |
| `RUNTIME_HALT` | Server didn't restart cleanly OR health probe failed | Code shipped, app not serving |
| `MOUNT_FAIL` | GET endpoint not reachable (404) | Code shipped but server didn't pick up the new handler. Probable: server needs another restart. Halt and report; don't auto-retry restart. |
| `COPY_FAIL` | Step 6 found a missing or empty FE file | apply.sh phase [2/6] should have caught this; if it didn't, something is wrong with the bundle or the FS |
| `WIRE_FAIL` | Step 7 found no `ManualContactsSection` references in ChannelFollowupPage | Patch 02 didn't land. Halt and report patch 02 output verbatim. |
| `SMOKE_FAIL_*` | A specific Step 8 behavior probe failed | Cookie-auth state depends on the step; see §3 step 8d cleanup |
| `operator_aborted` | `HALT` file at repo root | State as of halt step |

---

## 6. Diagnostic bundle (on any halt)

```bash
DIAG_DIR=/tmp/relay-fe-diag-$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$DIAG_DIR"
git diff > "$DIAG_DIR/repo-diff.patch" 2>&1
git status > "$DIAG_DIR/repo-status.txt" 2>&1
git log -5 --oneline > "$DIAG_DIR/recent-commits.txt" 2>&1
[ -d ticket-2-7-fe ] && cp -r ticket-2-7-fe "$DIAG_DIR/bundle-as-extracted/"
[ -f /tmp/relay-fe-apply.log ]   && tail -200 /tmp/relay-fe-apply.log   > "$DIAG_DIR/apply-tail.log"
[ -f /tmp/relay-fe-restart.log ] && tail -200 /tmp/relay-fe-restart.log > "$DIAG_DIR/restart-tail.log"
for f in /tmp/relay-fe-step*.log; do
  [ -f "$f" ] && cp "$f" "$DIAG_DIR/"
done
# Capture the live state of the files this ticket touched
[ -f artifacts/api-server/src/routes/prospects.ts ] && \
  cp artifacts/api-server/src/routes/prospects.ts "$DIAG_DIR/live-prospects.ts"
[ -f artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx ] && \
  cp artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx "$DIAG_DIR/live-ChannelFollowupPage.tsx"
tar -czf "$DIAG_DIR.tgz" -C /tmp "$(basename "$DIAG_DIR")"
echo "Diagnostic bundle: $DIAG_DIR.tgz"
```

Include path in halt report.

---

## 7. Output format

### On success (without RELAY_SMOKE_COOKIE)

```
DEPLOY_OK ticket-2-7-fe (deployment-only — cookie-auth probes skipped)
apply.sh:        exit 0, phases [1-6] all green
restart:         server bound to :80 in <N>s, no errors
health:          200 OK
mount_probe:     401 not_authenticated (endpoint mounted, auth wired)
fe_files:        all 4 present, non-zero sizes
fe_wire:         ManualContactsSection references found in ChannelFollowupPage (N occurrences)
verification:    BE side verified end-to-end; FE side verified at file-present level only
remaining:       human visual smoke from logged-in dashboard (see §10)
elapsed:         <N>m <N>s
cost:            $<X.XX>
tokens:          in=<N>, out=<N>
```

### On success (with RELAY_SMOKE_COOKIE)

```
DEPLOY_OK ticket-2-7-fe (full smoke with cookie auth)
apply.sh:        exit 0, phases [1-6] all green
restart:         server bound to :80 in <N>s, no errors
health:          200 OK
mount_probe:     401 not_authenticated (endpoint mounted, auth wired)
fe_files:        all 4 present, non-zero sizes
fe_wire:         ManualContactsSection references found in ChannelFollowupPage (N occurrences)
smoke 8a GET:    200, initial channels=[...]
smoke 8b ON:    200, channels=[..., "whatsapp", ...]
smoke 8c POST:   201, prospect id=<id>, all 6 fields verified
smoke 8c DUP:    409 duplicate_phone
smoke 8d:        toggle restored to initial state, smoke prospect deleted (HTTP <code>)
elapsed:         <N>m <N>s
cost:            $<X.XX>
tokens:          in=<N>, out=<N>
```

### On halt

```
DEPLOY_HALTED ticket-2-7-fe
failure_class:        <class from §5>
last_successful_step: <Step # from §3>
halt_step:            <Step # from §3>
diagnostic_bundle:    <path from §6>

──── verbatim_output ────
<captured logs from each step run, in order, unmodified>
──── end verbatim ────

elapsed: <N>m <N>s
cost:    $<X.XX>
tokens:  in=<N>, out=<N>
```

---

## 8. What you may NOT do

- Modify the bundle, apply.sh, any patch script, or any source file
- Re-run a failed step with modifications, env tweaks, or "let me just try X" reasoning
- Roll forward past a halt condition
- Delete `lib/db/dist/` or `lib/db/tsconfig.tsbuildinfo` (per G2 from the post-2.6 handoff). Note: this ticket has no schema changes so `tsc -b lib/db` is not invoked anyway, but the rule stands.
- Run `pnpm --filter @workspace/dashboard run build` (per G3: needs workflow env)
- Print `$DATABASE_URL`, `$ANTHROPIC_API_KEY`, `$RELAY_SMOKE_COOKIE`, or any secret in full in any log
- Re-run Step 8c (POST manual-ingest) more than once during a single Relay execution — each successful POST creates a real DB row, and the test phone (+15555550188) only has one slot before duplicate_phone fires

## 9. What you MAY do

- Re-read files for diagnosis
- Run additional read-only HTTP probes against unauthenticated endpoints (`/api/health`, mount-probe-style 401 checks on the new endpoints)
- Run read-only DB queries via `psql "$DATABASE_URL"` (SELECT only, no DDL/DML) — useful for confirming a smoke prospect persisted before deletion
- Print first 8 chars of secrets when verifying presence
- Re-execute idempotent steps that already report `already applied, skipping` — no-ops

---

## 10. Post-deploy reporting

After `DEPLOY_OK`, the deployment is verified for both sides:
- **BE supplement:** verified end-to-end via mount probe (Step 5) — endpoint mounted, auth wired. If `RELAY_SMOKE_COOKIE` was provided, Step 8 verified behavioral correctness too.
- **FE side:** verified at the file-present level (Step 6) and the wire-into-page level (Step 7). The dashboard typecheck (apply.sh [5/6]) also confirms the new code compiles without type errors.

Items the agent cannot verify (human task):

1. **Visual rendering of the Manual Contacts section** on `/followup/whatsapp` in the logged-in dashboard
2. **Ignite glow appearance** — color, shadow, transition (a screenshot diff against the Beacon spec, if you maintain one)
3. **Add Contact dialog UX** — opens, fields validate, disclosure expands, submit fires, toast appears
4. **End-to-end ingest** — submit a real (test-phone) contact, verify it shows up in the main follow-up table after the BE pipeline runs

These are listed in the final report as `remaining: human visual smoke from logged-in dashboard`. The operator (you) handles them.

---

**End of launch prompt.** Operator drops `ticket-2-7-fe.zip` at repo root, optionally sets `RELAY_SMOKE_COOKIE` Replit Secret (paste the `cf_session` value from a logged-in browser tab), then pastes this prompt into the Relay UI.

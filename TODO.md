# TODO - Chat Followupper

## Open items

1. **`lib/api-client-react` hardcodes `/api` and is outside Bundle 1's scope.**
   `lib/api-client-react/src/generated/api.ts:35,111,187` emit `/api/healthz`,
   `/api/auth/me` and `/api/auth/logout` as literals, generated from
   `lib/api-spec/orval.config.ts:29` (`baseUrl: "/api"`). The dashboard's
   `useCurrentUser` / `AuthGate` runs through this client, so under a non-root
   `BASE_PATH` the session check would call the wrong path and every page would
   read as unauthenticated. Confirmed present in the built bundle
   (`"/api/auth/me"` survives as a single literal). Bundle 1's scope was
   `artifacts/dashboard/` and `artifacts/api-server/`; this lives in `lib/` and
   is codegen output. **Bundle 2 must make the orval `baseUrl` prefix-aware and
   regenerate**, or the base-path switch ships broken auth.
   **RESOLVED 2026-07-30 by Bundle 2 — without regenerating.** The prescription
   above turned out to be unnecessary. `custom-fetch.ts` already exposed
   `setBaseUrl()`, which prepends a base to any request path starting with
   "/", so `artifacts/dashboard/src/main.tsx` now calls
   `setBaseUrl(ROUTER_BASE)` before `createRoot`. orval's `baseUrl` stays
   `"/api"`, no generated file changed, no codegen ran, and no dependency was
   added. Proved end to end by bundling the real chain (config → setBaseUrl →
   generated `getCurrentUser` → custom-fetch) with `import.meta.env.BASE_URL`
   defined as Vite defines it: `/api/auth/me` dark, `/chat/api/auth/me` lit.
   Pinned by 7 unit tests in `lib/api-client-react/src/custom-fetch.test.ts`
   that assert against the exact literals orval emits today.

2. **`lib/db` test suite fails on pre-existing schema/database drift.**
   `pnpm --filter @workspace/db run test` fails with
   `column "microsoft_refresh_token" of relation "users" does not exist`. The
   Drizzle schema (`lib/db/src/schema/users.ts:96`, last changed in `ce8657b`,
   well before this bundle) declares columns the provisioned Postgres does not
   have. Bundle 1 changed no file under `lib/` and ran no migration, so this
   predates the bundle.
   **RESOLVED 2026-07-30 by Maintenance M1.** The diagnosis was corrected
   first: this was never a missing-migration problem — there were zero
   unapplied migrations, and the repo and database are on two different
   lineages. Fixed by hand-writing one additive-only migration
   (`0008_additive_schema_reconciliation`) that adds the five items the repo
   schema declared and the live database lacked. Test gate now passes 3/3.
   The underlying lineage divergence is **not** resolved — see open item 5.

3. **Stale `.bak` files hold pre-centralization copies of edited files.**
   e.g. `artifacts/api-server/src/routes/index.ts.bak.20260622-170802`,
   `artifacts/dashboard/src/lib/api/prospects.ts.bak.20260622-091752`. Not
   compiled and not imported, so harmless, but they still contain hardcoded
   `/api` paths and will read as false positives in future URL audits. Left
   untouched (the rules forbid deleting files).

4. **`pnpm run build` cannot be run bare from a shell.**
   `artifacts/dashboard/vite.config.ts` hard-requires `PORT` and `BASE_PATH`,
   which the artifact runner injects from `artifact.toml`. Running
   `pnpm run build` without them fails at config load. Pre-existing; the
   working invocation is `PORT=23183 BASE_PATH=/ pnpm run build`.
   **PARTLY RESOLVED 2026-07-31 by CP1.** `BASE_PATH` is no longer required —
   it defaults to `/`, which is what let its `artifact.toml` pin be removed.
   `PORT` is still required, so the bare invocation still fails; the working
   one is now `PORT=23183 pnpm run build`. Making `PORT` optional was not in
   CP1's scope: it is only used by `server`/`preview`, never by a build, so a
   build requiring it is pure friction — but it is also the one thing keeping
   a mistyped port from silently binding somewhere else in dev, so the change
   deserves its own decision rather than a drive-by.

5. **DEFERRED: investigate the divergent migration lineage.** (M1 option 4,
   deferred by decision on 2026-07-30.)
   M1 fixed the *symptom* additively. The *cause* is untouched: this database
   was not built by this repo's migration chain, and nobody knows what built
   it. Until that is understood, `drizzle-kit generate` and `push` cannot be
   trusted in this repo, and the same class of drift will recur.

   Three findings to chase:

   **(a) Two applied migration files were edited after they ran.** sha256 of
   the file on disk vs the hash recorded when it was applied:

   | file | repo sha256 | recorded sha256 | |
   |---|---|---|---|
   | 0000_worried_the_anarchist | `26c32a9e61e3019a…` | `26c32a9e61e3019a…` | match |
   | 0001_living_mantis | `f4974a208ca34729…` | `7a37ada64acc4660…` | **MISMATCH** |
   | 0002_broken_toxin | `358aa53154b39eed…` | `358aa53154b39eed…` | match |
   | 0003_confused_tarantula | `1750f3b3343a78bc…` | `1750f3b3343a78bc…` | match |
   | 0004_loud_triton | `e1d77d9333df2dd8…` | `e1d77d9333df2dd8…` | match |
   | 0005_early_green_goblin | `b956e4d4789ce279…` | `b956e4d4789ce279…` | match |
   | 0006_extend_stage_timing_with_doctrine_variant | `b69a488d423ccf00…` | `b69a488d423ccf00…` | match |
   | 0007_manual_ingest_columns | `3929a1c86eac4b3e…` | `6bddb1c57029709c…` | **MISMATCH** |

   **(b) 14 applied migrations have no file in this repo.** Rows 9–22 of
   `drizzle.__drizzle_migrations`. Rows 9–16 carry implausibly round
   `created_at` values (1778700000000, 1778780000000, 1778860000000,
   1778940000000, 1779020000000, 1779100000000, 1779180000000, 1779260000000)
   which drizzle-kit does not generate — hand-authored, or written by another
   runner. Rows 17–22 carry realistic timestamps (1783545124180, 1783546850280,
   1783626809056, 1784103497961, 1784104112221, 1784106433067). A `find` across
   the whole workspace turns up no other `_journal.json` or `drizzle/*.sql`, so
   those files are not here at all.

   **(c) 22 live-only items the repo schema does not describe**, left
   deliberately untouched by M1 and still undescribed: table `llm_calls`
   (12 columns), `daily_usage.pushover_sent`, and nine `users` columns
   (`pushover_days`, `pushover_hour_local`, `pushover_quiet_hour_start`,
   `pushover_quiet_hour_end`, `pushover_user_key`, `digest_days`,
   `followups_paused`, `message_template`, `preferred_channel`). The
   `pushover_*` group is notable: Bundle 1 searched for Pushover callbacks and
   found no Pushover code in either artifact, yet the database carries a full
   Pushover configuration surface. That is a strong hint that this database was
   shaped by a **different, more advanced version of this application**.

   Suggested first step: ask whoever ran Replit Agent on this project, and
   check whether a sibling repo or an older Repl holds the missing 14
   migrations.

6. **CUTOVER BLOCKER: the artifact router still has to be told about the
   prefix.** (Found by Bundle 2; outside its scope, which is application code.)
   Bundle 2 makes the *application* fully correct under `BASE_PATH`, and both
   smoke runs prove it. But in this workspace the request never reaches the
   app until Replit's artifact router routes it, and that routing is static
   TOML which cannot read an env var:

   - `artifacts/api-server/.replit-artifact/artifact.toml` has
     `paths = ["/api"]`. It will not match `/chat/api/...`.
   - `artifacts/dashboard/.replit-artifact/artifact.toml` has `paths = ["/"]`
     with `serve = "static"` and a `/*` → `/index.html` rewrite, and
     `[services.env] BASE_PATH = "/"`.

   `replit.md` says artifact.toml routing is "handled by the artifact tooling,
   not by hand", so Bundle 2 changed none of it. Michael's decision was that
   the **api-server** serves the SPA under the prefix, which means at cutover
   the api-server's `paths` must gain the prefix (e.g. `["/api", "/chat"]` —
   additive, so `/` and `/api` keep routing exactly as they do today and dark
   stays dark). The evidence that the router forwards the prefix rather than
   stripping it is the sibling `mockup-sandbox` artifact, which runs at
   `paths = ["/__mockup"]` with its own `BASE_PATH = "/__mockup"`.

   Until that is settled, Bundle 2 is correct but unreachable in a deployed
   Replit environment. It is fully reachable when the process is addressed
   directly, which is what both smoke runs did. **Resolve this before the
   cutover step, not during it.**

   **RESOLVED 2026-07-30 by Cutover prep C1**, for the api-server half, which
   is the half the decision made load-bearing. `paths = ["/api"]` became
   `paths = ["/api", "/chat"]` — one line, additive. `/api` still matches
   first and unchanged, so nothing the app receives today routes differently;
   the addition only makes the router hand `/chat/*` to the api-server, which
   answers 404 for all of it while `BASE_PATH` is unset.

   **Caveat (a) was expected to be unverifiable here — it turned out not to
   be, and it is now verified in development.** The workspace's own artifact
   router picked the change up live, with no restart. On the proxy at `:80`,
   `/chat` and `/chat/anything` are answered by the api-server (`X-Powered-By:
   Express`, 404 while `BASE_PATH` is unset), while the control paths
   `/chatter`, `/chat.html` and `/login` still reach the dashboard's Vite
   server with 200. So the router does honour a second entry in `paths`, it
   matches on whole path segments rather than a raw string prefix, and the
   api-server's `/chat` claim takes precedence over the dashboard's `/`.
   That is exactly the behavior Bundle 2 was built against.
   **Still to confirm at cutover:** the production router is a separate code
   path from the development one, configured from the same file. The evidence
   above is strong but is not proof for production — check `/chat/api/healthz`
   first if anything 404s after the env vars go on. (b) artifact.toml is
   system-managed (`replit.md`: "handled by the artifact tooling, not by
   hand"). The tooling may rewrite or revert this file on its own schedule.
   Re-check the line is still there immediately before cutover.
   **Re-checked 2026-07-31 by CP1's lineage check: still there.** It survived
   the `4d28466` Replit deployment commit and a full workspace restart, and
   CP1 changed nothing in that file — its `git diff` is empty. CP1 also
   observed the other half of the tooling's behavior: editing the
   *dashboard's* artifact.toml did not restart that service, so these files
   appear to be read passively rather than watched. One more re-check
   immediately before cutover is still the right move.
   **And one addition to the "check `/chat/api/healthz` first" advice:** since
   CP1, `/api/healthz` answers too, on both sides of the switch. If the
   prefixed health path 404s but the unprefixed one answers, the app is up and
   the *router* is the problem; if neither answers, the app never started.

7. **The dashboard's production static serving is bypassed under a prefix.**
   Consequence of item 6 and of the decision that the api-server serves the
   SPA. `[services.production] serve = "static"` with
   `publicDir = artifacts/dashboard/dist/public` would 404 every asset under a
   prefix anyway: Vite writes assets to `dist/public/assets/` while the built
   `index.html` references `/chat/assets/…`. The api-server's
   `express.static` mount at `BASE_PATH` resolves that correctly (verified —
   zero 404s), so under a prefix the dashboard's static service becomes
   redundant rather than broken. Decide at cutover whether to leave it serving
   `/` or retire it. No code change is needed either way.

   **DECIDED 2026-07-30 by Cutover prep C1: the dashboard artifact keeps
   serving `/` for now; retiring it is deferred.** Its artifact.toml was not
   touched — `paths = ["/"]`, `serve = "static"` and the `/*` → `/index.html`
   rewrite all stand exactly as they were. Consequence to be aware of: once
   `BASE_PATH` is set, `/chat/*` is served by the api-server and `/` continues
   to be served by the dashboard's static service off the same build output,
   so the app is reachable at **both** addresses on the origin, with only the
   prefixed one correct (at `/` the built `index.html` would reference
   `/chat/assets/…`, which the static service cannot resolve). That is
   harmless while the gateway only ever sends `/chat`, and it is what makes
   rollback instant — unset the env vars and `/` is correct again. Retire or
   redirect the `/` service only after the prefixed address has run quietly,
   per the roadmap's two-day rule.

   **Mechanism corrected 2026-07-31 by CP1.** The conclusion above is right;
   the reason given for it is not. At `/` the assets **do** resolve: the built
   `index.html` references `/chat/assets/…`, and `/chat` is claimed by the
   api-server (C1), whose `express.static` serves them correctly — C1 verified
   the router hands `/chat/*` to the api-server on whole-segment matches. So
   the shell and its assets both load at `/`. What breaks is one level up: the
   SPA boots with a wouter router base of `/chat` while `window.location` is
   `/`, so no route matches and the page renders empty. Same conclusion — only
   the prefixed address is correct — but if anyone debugs a blank page at `/`
   after cutover, it is a router-base mismatch, not a 404 storm.

   **FIRED IN PRODUCTION AND FIXED 2026-08-02 (post-cutover repair).** The
   blank page happened exactly as predicted: after cutover,
   `https://chat-followuper.replit.app/` (the address everyone had) served the
   prefixed build at the root and rendered black. Fix is client-side, because
   the dashboard's static service — not the api-server — answers `/`, so no
   server can redirect it: `outOfBaseRedirectTarget()` in `basePath.ts` (both
   copies, still byte-identical, pinned by the shared tests) computes the same
   path under the base, and `main.tsx` calls `location.replace()` with it
   *before* mounting — `/` → `/chat/`, `/login?e=x` → `/chat/login?e=x`,
   `/prospects/42` → `/chat/prospects/42`. Query and fragment ride along;
   containment is case-insensitive and segment-aware (`/chatter` is outside);
   the target is same-origin by construction (base first). Dark: the helper
   returns null for every address at the root base, so the app boots exactly
   as before — pinned by the new DARK test. Requires a republish to reach
   production.

8. **CUTOVER: once `BASE_PATH` is set, the whole unprefixed `/api` surface
   404s except health.** (Found by CP1, audit round 2. Outside its scope,
   which was the three named findings.)
   Verified against the LIT run: with `BASE_PATH=/chat/`, `/api/healthz` and
   `/api/health` answer 200 — that is CP1's finding-1 mount, and it is
   deliberate — while `/api/auth/me`, `/api/prospects`,
   `/api/auth/google/start` and `/api/followups/open/:id` all return 404,
   because the API router now sits at `/chat/api`.

   That is correct and expected for anything the dashboard calls, since the
   dashboard calls the prefixed paths. It matters for exactly one surface:
   **`/api/followups/open/:id` is the link already sitting in reps' inboxes.**
   Every digest email sent so far contains
   `https://chat-followuper.replit.app/api/followups/open/<id>?t=<token>`.
   The moment `BASE_PATH` goes on, that URL 404s — mail that cannot be
   recalled, pointing at a dead path. This is the concrete mechanism behind
   external registration 3 below, which recorded the risk but not how it
   fires.

   Three ways to handle it, to be decided at cutover, not now: (a) make the old
   address a permanent redirect that preserves the path — the roadmap's step 7
   already calls for this, and it is the only option that fixes already-sent
   mail; (b) mount `followupOpen` unprefixed the way CP1 mounted health, which
   is a two-line change but widens the "unmoved by configuration" surface from
   a health probe to a token-authenticated redirect and should not be done
   casually; (c) accept the breakage for links older than the cutover. Note
   that (a) is the only one that survives retiring this origin entirely.

   **RESOLVED 2026-08-02 with option (a) (post-cutover repair).** `app.ts`
   mounts a **307** redirect at `PLATFORM_API_BASE_PATH` that maps
   `/api/<anything>` onto `API_BASE_PATH` with method and query preserved —
   `/api/followups/open/42?t=abc` → 307 → `/chat/api/followups/open/42?t=abc`,
   verified in the lit run. Mounted *after* the platform health router, so
   `/api/healthz` and `/api/health` keep answering 200 directly and the
   startup probe never depends on a redirect; gated on `IS_PREFIXED`, because
   at the default base the two mount points are the same string and a redirect
   would loop — the dark run confirms `/api` still answers directly with zero
   redirects, so rollback stays intact. This same redirect also un-breaks the
   Google OAuth callback (external registration 1): `GOOGLE_OAUTH_REDIRECT_URI`
   still names the unprefixed `/api/auth/google/callback`, which had been
   404ing — the browser now follows the 307 and the token exchange still sends
   the byte-identical registered URI, so nothing at Google needs to change
   (though re-registering the prefixed URI remains the cleaner end state). The
   Apollo webhook (external registration 2) cannot rely on a redirect —
   webhook senders do not reliably follow 3xx on POST — so its legacy address
   is a first-class second mount of the same router, before `express.json` so
   raw-body HMAC capture holds, also gated on `IS_PREFIXED`; verified
   byte-identical behavior on both mounts. Requires a republish to reach
   production.

9. **`artifacts/mockup-sandbox/vite.config.ts` has the same unvalidated
   `base` that CP1 fixed in the dashboard.** (Found by CP1, audit round 3.)
   `vite.config.ts:22-31` reads `process.env.BASE_PATH` and passes it straight
   to `base`, with no validation — the exact script-injection path CP1's
   finding 3 closed. Left untouched: CP1's step 5 names the dashboard's build
   config, and mockup-sandbox is a different artifact (a design canvas
   template, per `replit.md`, not part of the app).
   Reachability is currently nil: its `artifact.toml` pins
   `BASE_PATH = "/__mockup"` in its own `[services.env]`, which beats the
   environment, so a workspace-level `BASE_PATH` cannot reach it. That pin is
   the mirror image of the one CP1 removed from the dashboard — here it is
   load-bearing, because this artifact really does always live at `/__mockup`.
   Fix it if mockup-sandbox is ever promoted past template status, or when a
   sibling app's canvas is migrated.

10. **An unmatched API path returns an HTML 404, not a JSON one.**
    (Found by CP1, smoke. Pre-existing; not introduced by any bundle.)
    `GET /api/<unknown>` returns Express's default
    `text/html` `Cannot GET …` page, dark and lit alike. Bundle 2's ledger
    described this as "a JSON 404", and the CP1 order asked to verify one;
    both were describing the property that actually holds and actually
    matters — that the SPA catch-all never answers an API miss with
    `index.html`, which is verified and true. A client that parses every
    response as JSON still gets a parse error rather than a typed error body.
    Not fixed here: adding a JSON 404 handler over `API_BASE_PATH` would
    change the dark response, so it cannot ship inside an order whose whole
    premise is that dark stays byte-identical. It wants its own small bundle,
    and it should land **before** the cutover if it lands at all, so the
    change is observed at the old address rather than blamed on the new one.

11. **RESOLVED 2026-08-02 17:51 by ROADMAP v3, which arrived on its own.** The
    canonical roadmap ("Version 3, last updated 2026-08-02. This file is
    canonical. Copy it into every repo in the project") replaced this repo's
    2026-07-30 copy in the working tree twelve minutes after L1a closed, and
    was committed by the owner's publish `5c72224`. It carries a **Git safety
    rules** section whose rule 1 is *already* the directional form this order
    asked for — "does another branch hold content main lacks? Answer it with
    `git diff <branch> main`. Do not use tree equality between branches as the
    test; it goes stale the moment main takes a commit that branch lacks" —
    plus five further rules L1a could not have known to write, including rule 6
    on the transient push failure L1a hit and recorded independently. **Nothing
    needed rewording, and the decision not to author the section from the order
    alone was the right one**: an invented version would have carried one rule
    where the canonical text carries six, and would have had to be reverted.
    The finding below is kept as the record of what was true until 17:51.

    **The original finding (accurate as of 2026-08-02 17:20, superseded):** The
    order asked to correct
    `ROADMAP.md`'s Git safety rule 1 — worded as a tree-equality check between
    branches, which goes stale as soon as `main` takes a commit another branch
    lacks and produces false STOPs — into the directional form: *does another
    branch hold content `main` lacks*, answered with `git diff <branch> main`.
    **There is no Git safety section, and no numbered git rules, in
    `ROADMAP.md`.** Verified with a case-insensitive search for "safety" across
    `ROADMAP.md` on **all 18 refs** in this repo (9 local branches, 9 remotes,
    including `gitsafe-backup/main`) — zero hits on every one; `ROADMAP.md` has
    been touched by exactly one commit, `0c5c8cf`, and its sections are Goal,
    Architecture, Status board, Migration order, The per-app migration cycle,
    Smoke checklist, Standing bundle ritual, TODO.md ledger, What never moves.
    `replit.md` and `CLAUDE_CODE_BUNDLE2.md` carry no such rule either; the only
    git rules in this repo are `CLAUDE_CODE_BUNDLE2.md`'s "Hard rules" (no
    destructive git, no force-push), which are unrelated. **Nothing was
    reworded and nothing was invented** — writing a governance rule that the
    owner did not author, into the file that governs every app in this
    migration, is not a documentation fix. The rule presumably lives in the
    canonical `ROADMAP.md` held elsewhere (this copy is dated 2026-07-30 and has
    never been updated since). To land here it needs either that copy synced
    into this repo, or the owner's go-ahead to author the section fresh. The
    correction itself, for whoever applies it: tree equality between two
    branches is not the question — `git diff <branch> main` answers the one that
    matters, *does `<branch>` hold content `main` lacks*, and stays true after
    `main` moves ahead.

12. **RESOLVED 2026-08-02 17:51 by ROADMAP v3.** Both "permanent redirect"
    lines are gone, replaced by a mandatory **Redirect convention** that says
    what this finding asked for and more: use 307 for every legacy-to-prefixed
    redirect; never 308 or 301 ("a cached entry survives an env-unset rollback
    and bounces clients to a path that no longer exists"); never 302 (POST
    downgrade); preserve the query string and **prove the method arrives intact
    from the server's own access log rather than asserting it**; prefer a
    first-class mount over a redirect for webhook senders; and pin the status
    code with a boot-level test (see open item 13). The three sibling apps are
    therefore no longer at risk of shipping the same 308.
    The original finding is kept below as the record.

    **The original finding (superseded):** `ROADMAP.md` prescribes "permanent
    redirects" for old addresses, which is what produced the 308 that L1a had
    to undo. (Found by L1a, audit round 1.)
    Architecture bullet 3 ("Old addresses become permanent redirects") and the
    migration cycle's step 7 ("Convert the old address into a permanent
    redirect") both predate the discovery that permanence and the one-minute
    rollback of step 8 are in direct conflict: a cached permanent redirect
    outlives the deployment that issued it, so it survives the rollback that is
    supposed to undo it. Open item 8's option (a) above inherits the same
    wording. The distinction the roadmap is missing is **when**: during the
    migration window, while unsetting the env vars is still the rollback, the
    hop must be temporary (307); a permanent redirect is only safe once the old
    address is being retired for good and rollback is no longer the plan.
    Left untouched — `ROADMAP.md` governs all four apps and rewording it is the
    owner's call, and L1a's scope was one status code. It should be reworded
    before the Prospector, Email Followupper and Leadfinder cutovers, or each
    will ship the same 308.

13. **RESOLVED 2026-08-02 by L1b.** `artifacts/api-server/src/app.test.ts`
    boots the built artifact lit and dark and asserts all four properties
    listed below; `package.json`'s `test` script runs it, so it is a gate.
    Proved to bite by four mutations of `app.ts` (308, 302, 301, and removing
    the `IS_PREFIXED` gate), each failing the suite — see the L1b ledger entry
    for which assertion fires for which mutation. `app.ts` itself was restored
    byte-identical. **The original finding:**

    **The 307 is not pinned by a test, which ROADMAP v3 now requires.**
    (Raised by v3's arrival, 2026-08-02 17:51, immediately after L1a closed.)
    v3's redirect convention rule 6: "Pin the status code with a test that
    boots the app, so a future edit fails a gate rather than passing silently."
    L1a shipped without one and said so at close — the status code is proved by
    the lit smoke, which is a manual run, not a gate. Nothing in `pnpm test`
    would fail if someone put the 308 back; the only defenses are the comment
    and this ledger. v3's status board shows the sibling Email Followupper
    already carrying an **L1b (test only)** for exactly this, so the shape of
    the work exists next door.
    What it needs: a test that boots the app with `BASE_PATH` set on a free
    port and asserts (a) a POST to a legacy `/api/...` path answers **307**,
    (b) the `Location` is the same path under `API_BASE_PATH` with the query
    intact, (c) the request that arrives at the prefixed mount is still a
    **POST**, and (d) with `BASE_PATH` unset the legacy mount does not exist at
    all, so the rollback state stays dark. Not done inside L1a: v3 landed after
    that order closed, and adding a test file was outside its "change nothing
    else" scope. **This is the natural L1b for this repo** and wants its own
    order.

14. **PA-1 (2026-08-05): main was reset to the June-22 tree on 2026-07-27;
    140 commits of July work (2026-07-03 → 2026-07-27, ~60,133 lines, 1,344
    paths) are absent from HEAD and from production.** The reset commit is
    `cd89a49` ("latest") = June-22 publish tree `e9ed33c` + 4 lines. The July
    lineage survives ONLY as local branch `audit/godlike-fixes` (tip
    `96f8f34`, itself a "Published your App" commit — this content WAS in
    production until 2026-07-30 23:00) and on the `gitsafe-backup` remote
    (git://gitsafe:5418/backup.git, main = `96f8f34`). GitHub (`origin`) does
    NOT hold it, and no bundle/zip/backup captures it. First step of any
    restoration order: push `audit/godlike-fixes` to origin under its own
    name before touching anything (ROADMAP git-safety rule 2). This also
    resolves open item 5's mystery: the 14 applied-but-fileless migrations
    are July's `lib/db/drizzle/0008–0021`, present at `96f8f34`. Full
    evidence and the restoration prescription: PA-1 ledger entry, 2026-08-05.

## External registrations discovered

Recorded per Bundle 1's mandate. **None of these were changed** — how each
registers is untouched.

1. **Google OAuth redirect URI** — registered in the Google Cloud Console,
   supplied to the app as `GOOGLE_OAUTH_REDIRECT_URI`.
   Read at `artifacts/api-server/src/routes/google-auth.ts:49` (authorization
   request) and `:135` (token exchange). It is also persisted per-nonce into
   `oauth_nonces.redirectUri` at `:56`. The registered value must point at
   `<public address>/api/auth/google/callback`; a base-path move requires
   adding the new URI in the Google console **before** cutover.
   **Bundle 2 update:** both read sites now go through
   `googleOAuthRedirectUri()` in `appConfig.ts`. The env var still wins
   wherever it is set, so nothing about the registration changed. When it is
   absent the URI derives from `PUBLIC_URL` as
   `<PUBLIC_ORIGIN>/chat/api/auth/google/callback`. At cutover, either
   register that value at Google and drop the env var, or keep the env var and
   set it to the new address — both work, but the value sent and the value
   registered must match exactly.

2. **Apollo phone-reveal webhook URL** — registered in the Apollo dashboard,
   supplied to the app as `APOLLO_WEBHOOK_URL`.
   Read at `artifacts/api-server/src/services/apollo.ts:238-241`; the missing
   case throws `ApolloMissingWebhookUrlError`
   (`artifacts/api-server/src/services/apollo.ts:129-134`), surfaced as
   `apollo_webhook_url_not_configured` at
   `artifacts/api-server/src/routes/apollo.ts:104-106`. The receiving endpoint
   is `POST /api/apollo/webhook/phone-reveal`
   (`artifacts/api-server/src/routes/apolloWebhook.ts:50`, mounted in
   `artifacts/api-server/src/app.ts:41`). Apollo must be re-pointed at the new
   address at cutover.

3. **App public address used in outgoing email** — `APP_PUBLIC_URL`, currently
   `https://chat-followuper.replit.app` in this workspace's environment.
   Not a third-party registration, but it is this app's address baked into
   already-sent digest emails, so changing it strands links in mail that is
   already in reps' inboxes. Read (now via the config module) at
   `artifacts/api-server/src/services/followupDigest.ts:44` and
   `artifacts/api-server/src/routes/followupOpen.ts:12`.
   **CP1 update:** the stranding is not hypothetical and does not require
   changing this variable at all — simply setting `BASE_PATH` moves the API
   off `/api`, so the `…/api/followups/open/<id>?t=<token>` links already in
   inboxes 404 on the origin they were sent for. Verified in CP1's LIT run.
   See open item 8 for the three ways out.

Searched for and **not found**: Telegram bot webhook registration (Telegram is
deep-link only via `t.me`, no bot token, no `setWebhook`), Pushover callbacks
(no Pushover code exists in either artifact, though the `users` table does
carry `pushover_*` columns), and any other outbound registration of this app's
own URL.

## Ledger

### 2026-08-05 — CF-R1: restore the July lineage (IN PROGRESS)

Branch: `cf-r1-restore-july`. Scope: restore the 140-commit July lineage lost
by the 2026-07-27 reset (`cd89a49`), by merge, while preserving every piece of
post-reset migration work. Order CF-R1, executing PA-1's step-22 prescription.

**Prerequisite reading note:** the order names `PHASE3_PLAN.md` as required
reading. That file does not exist on any of the 24 refs in this repo and was
never added by any commit (verified by `git ls-tree` across every ref and
`git log --all --diff-filter=A`). Recorded rather than invented, per the open
item 11 precedent; presumably it lives with the owner or in a sibling repo.
Proceeding on TODO.md's PA-1 entry, `PROVENANCE_AUDIT_PA1.md` and ROADMAP v3,
which carry the full evidence base.

**BLAST RADIUS (written before any edit)**

Files to be touched: this is a restoration merge, not a surgical bundle — the
touch surface is the full `git diff audit/godlike-fixes main` extent: 1,540
files (+60,133/−12,857 from main's side: 1,345 files restored that main lacks,
154 files modified on one or both sides, 41 files main-only). Expected
conflict surface, from PA-1 and the both-modified list:
`artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`,
`artifacts/api-server/build.mjs`, `artifacts/dashboard/vite.config.ts`,
`artifacts/dashboard/src/main.tsx`, `.env.example`, `replit.md`,
`pnpm-lock.yaml`, `package.json` files, and `lib/db/drizzle/meta/_journal.json`
(the 0008 collision). Also committed on this branch first: PA-1's TODO.md
entry and `PROVENANCE_AUDIT_PA1.md`, both left uncommitted by that read-only
order.

Behaviors affected: application behavior returns to the July tip — the LLM
router/ledger/spend-cap, kill switch, Speed pass, LinkedIn channel, seed
classifier, first-message flow, pushover stack, Contacts/reminders pages, 27
smoke scripts, vitest/Playwright infra, migrations 0008–0021. Routing, base
paths, redirects and the health mount keep the post-reset behavior (they are
load-bearing in production today): Bundle 1/2 config, C1 artifact routing,
CP1 platform health + hardened build config, the post-cutover legacy-address
repairs, L1a's 307, L1b's pinning test. Conflict rule, per the order: the
migration work wins on routing/base-path/redirect/health; July wins on
application behavior; every such decision recorded here.

Worst realistic failure: (a) the merge silently drops July content — defended
by the close-out check that every one of PA-1's 182 app-source paths exists on
the branch, plus survival verification of each migration-work commit's
content; (b) the reconciled migration journal leaves a state where a future
startup or drizzle-kit run would re-apply already-applied SQL against the live
database — defended by Phase C's rule that the restored journal must describe
the database that already exists, verified read-only against
`drizzle.__drizzle_migrations` before and after; (c) restored July code
misbehaves against the live schema in ways the suite misses — defended by the
restored test infrastructure, the M1 harness, and both smoke runs; (d) a red
gate is merged anyway — forbidden by the order's hard rule 1: main is not
touched until every gate passes, else stop and report.

Rollback path: branch `cf-r1-restore-july`; `main` untouched until the ritual
closes clean. Nothing is published or deployed by this order; the live
database is read from, never written; the running workflow is never touched
(smoke runs boot children on free ports). The July lineage is already durable
on origin (`origin/audit/godlike-fixes` = `96f8f34`, tag
`july-tip-2026-07-27`), verified by `git ls-remote` before any edit.

**PHASE A — THE TRUE TARGET, confirmed from refs, not memory.**

- Merge base of `main` (`e3f7480`) and `audit/godlike-fixes` (`96f8f34`):
  `e9ed33c`, the June-22 publish. `git rev-list --count`: **140** commits on
  the July side main lacks; **32** commits on main the July side lacks.
- `git diff --shortstat audit/godlike-fixes main`: 1,540 files, +12,857,
  −60,133 — matching PA-1 exactly.
- **No third ref holds content either side lacks.** `git rev-list --objects
  --all --not main audit/godlike-fixes` returns exactly two objects: the
  annotated tag object `july-tip-2026-07-27` (whose target `96f8f34` is the
  July tip itself) and one 19-byte git-notes blob (`refs/notes/commits`)
  containing the string "Published your App". `replit-agent`'s 348 unique
  commits contribute zero unique file content — its tip tree is byte-identical
  to publish `5c72224`'s tree (`49e035e`), and the only files where it differs
  from both sides are ones where main is strictly newer (L1b's three files).
- **Migration-work commits on main whose content must survive**, verified at
  close by content, not assumed from the merge:

  | hash | subject | load-bearing content |
  |---|---|---|
  | `0c5c8cf` | governance files | ROADMAP/TODO structure (v1; v3 arrives in `5c72224`) |
  | `41c7639` | Bundle 1 | `appConfig.ts` / `config.ts` URL centralization |
  | `ba77d90` | M1 halt record | diagnosis that repo/DB lineages diverged |
  | `e91bdc1` | M1 | `0008_additive_schema_reconciliation.sql` + db test gate |
  | `2b6076b` | Bundle 2 | switchable base path, dark by default; `basePath.ts` ×2 |
  | `05caad5` | C1 | api-server `artifact.toml` `paths = ["/api", "/chat"]` |
  | `7d61732` | CP1 | platform health mount, unpinned dashboard base, hardened `vite.config.ts` |
  | `dcfd116` | Published your App 2026-08-02 07:21 | **post-cutover repairs**: legacy `/api` redirect mount, Apollo webhook legacy first-class mount, `outOfBaseRedirectTarget()` |
  | `7689f50` | L1a | legacy redirect 308 → 307 |
  | `5c72224` | Published your App 2026-08-02 17:56 | ROADMAP v3 (canonical) |
  | `679ec7d` | L1b | `app.test.ts` boot-level 307 pinning test + gate wiring |

  (The other 21 of the 32 are merges, ledger-only commits, publishes carrying
  no unique surviving content, and the reset commit `cd89a49` itself.)

### 2026-08-05 — Provenance audit PA-1 (CLOSED, read-only): content HAS been lost

Diagnostic order PA-1. Read-only; the only file changed by this order is this
TODO.md (recording mandated by the order itself), left uncommitted. Nothing
was restored, committed, deployed or published.

**VERDICT (step 21): content has been lost.** On 2026-07-27 18:32:55 main was
reset to the June-22 tree, and every commit and every publish since — Bundle
1/2, M1, C1, CP1, L1a/L1b, and all six "Published your App" commits from
2026-07-30 23:00 through 2026-08-02 17:56 — is built on June-22 code. 140
commits of July work (2026-07-03 09:17 → 2026-07-27 15:21) are absent from
HEAD and from production.

**THE RESET EVENT.** Commit `cd89a49` ("latest", 2026-07-27 18:32:55, author
MichaelMobupps) has parent `e9ed33c` ("Published your App", 2026-06-22
18:03:45), and `git diff e9ed33c cd89a49` is **one file, 4 lines**
(`artifacts/dashboard/test-results/.last-run.json`). So "latest" is the
June-22 publish tree, byte-for-byte, plus one Playwright status file. Three
hours earlier the platform had published `96f8f34` ("Published your App",
2026-07-27 15:21:38) from the July lineage; `git diff 96f8f34 cd89a49` is
1,516 files, +8,323/−60,086 (the +8,323 is June-era content the July work had
changed or deleted, e.g. `.bak.20260622-*` files and the pre-rewrite
`channelRegister.ts`). This is the same failure mode ROADMAP v3's git-safety
section records for a sibling repo on 2026-07-31 — "a workspace sitting on a
stale branch was snapshotted and published" — discovered here only by this
audit.

**WHERE THE JULY WORK SURVIVES.** Exactly three artifacts, all git refs to the
same commit `96f8f34` (tree of the 2026-07-27 15:21 publish):
- local branch `audit/godlike-fixes` (140 commits not on main; `git rev-list
  --count main..audit/godlike-fixes` = 140; merge-base with main = `e9ed33c`),
- local branch `replit-agent` (the platform's publish ledger; contains
  `96f8f34` in its ancestry; its tip `fcb6fc1` tree = the deployed `5c72224`
  tree `49e035e`),
- remote `gitsafe-backup` (git://gitsafe:5418/backup.git), whose `main` =
  `96f8f34` (verified reachable by `git ls-remote` on 2026-08-05).

**GitHub does NOT have it**: `git ls-remote origin` (2026-08-05) lists main,
the five bundle/cutover branches, maintenance-m1-db-drift and
snapshot-2026-07-30 — all post-reset lineage — and no ref containing the July
work. No bundle, patch zip, backup directory or attached_assets file captures
any July content either (full-tree scan; newest archive anywhere is dated
2026-06-22, and attached_assets spans only 2026-04-30 → 2026-05-13). One
dropped-stash WIP commit pair and two dangling blobs from 2026-08-02 were
inspected: near-duplicates of committed content, nothing unique beyond
`96f8f34`.

**WHAT PRODUCTION RAN AND RUNS (steps 9–11).** Production ran the July
lineage until at least the 2026-07-27 15:21 publish (`96f8f34`), then the
2026-07-30 23:00 publish (`4d28466`, post-reset lineage) shipped the June-22
code back. The live deployment today was built from publish `5c72224`
(2026-08-02 17:56:38, tree `49e035e`, identical to the platform ledger tip
`fcb6fc1`); verified live on 2026-08-05 07:06 UTC: GET
https://chat-followuper.replit.app/api/version → 307, `location:
/chat/api/version`, no cache-control — the L1a signature that exists only in
trees at/after 2026-08-02 17:36 — and `/api/healthz` → 200 direct (the compat
mount, app.ts:91). `git diff 5c72224..HEAD` touches only TODO.md,
`app.test.ts` and one package.json script line, so production ≡ HEAD in
behavior. Per-artifact: the api-server dist on disk (2026-08-05 06:53) is a
compile of HEAD (all 69 sourcemap-embedded sources byte-identical to the
working tree; exactly one `redirect(307, ...)`). The dashboard dist on disk
(2026-08-02 18:11) is built from the newest dashboard source (`dcfd116`
fingerprints present) but with BASE_PATH unset (a dev build); the deployed
dashboard was built in the deploy pipeline with BASE_PATH=/chat and is not
that file. What the repo cannot show: the deployment's own build log and
timestamp — that lives in the Replit Publishing/Deployments pane → History /
Build logs (deploy target `gce`, .replit:5). The app exposes no
version/build/commit info on any endpoint probed.

**WHAT WAS LOST (steps 5–8).** `git diff audit/godlike-fixes HEAD`: 1,540
files, +12,857/−60,133 — sixty thousand lines at the July tip absent at HEAD.
Per top-level dir (files / lines HEAD lacks): artifacts 198 / 23,005; lib
62 / 11,610; source-code 101 / 11,187; godlike-audit 45 / 7,917 (audit docs +
writer benches); parts_followup 1,105 files; three exemplar/competitor .jsonl
data files (3,644 lines); .grok 8 / 361; RUN-THIS-BEFORE-PUBLISH.sql;
debug-special-cases-prompt-v2.md. Directional diffs of every other ref and
all three dangling commits found no other ref holding content HEAD lacks
beyond this lineage (largest: snapshot-2026-07-30 = `cd89a49` itself).

Path census (step 6): 2,372 paths have ever existed on any ref; 608 exist at
HEAD; 1,790 are missing. Of those, **1,344 are disappearances** (present in
the `96f8f34` tree, never deleted by any commit on main — main simply never
contained them) and 446 are earlier deliberate deletions (ticket-*/group-b5
work dirs and .bak files removed by named cleanup commits on main in May–June,
e.g. `7fef4a3`, `29e7a3c`, `a8b1617`). The 1,344 = 1,105 parts_followup +
45 godlike-audit + 8 .grok + 4 root data files + **182 app-source files**
(excluding `.bak.*`), listed in full:

```
artifacts/api-server/src/lib/apolloRevealCap.ts
artifacts/api-server/src/lib/appPublicUrl.ts
artifacts/api-server/src/lib/dbErrors.ts
artifacts/api-server/src/lib/doctrine/researchPrompts/searchDirective.ts
artifacts/api-server/src/lib/doctrineVariant.ts
artifacts/api-server/src/lib/exemplars/competitors.ts
artifacts/api-server/src/lib/exemplars/loader.ts
artifacts/api-server/src/lib/exemplars/select.ts
artifacts/api-server/src/lib/featureFlags.ts
artifacts/api-server/src/lib/llm/gemini.ts
artifacts/api-server/src/lib/llmLedger.ts
artifacts/api-server/src/lib/llm/router.ts
artifacts/api-server/src/lib/llmSpendCap.ts
artifacts/api-server/src/lib/llm/thinking.ts
artifacts/api-server/src/lib/messageTemplate.ts
artifacts/api-server/src/lib/pushoverQuietHours.ts
artifacts/api-server/src/lib/pushoverSchedule.ts
artifacts/api-server/src/lib/senderName.ts
artifacts/api-server/src/lib/smtpConfigured.ts
artifacts/api-server/src/lib/usageBucket.ts
artifacts/api-server/src/routes/followupFallback.ts
artifacts/api-server/src/routes/notificationSettings.ts
artifacts/api-server/src/routes/prepareFirstMessage.ts
artifacts/api-server/src/routes/testChannelLink.ts
artifacts/api-server/src/routes/userExtras.ts
artifacts/api-server/src/scripts/benchWriterQuality.ts
artifacts/api-server/src/scripts/smokeAdminRoutes.ts
artifacts/api-server/src/scripts/smokeAudit2.ts
artifacts/api-server/src/scripts/smokeBulk.ts
artifacts/api-server/src/scripts/smokeChatFollowupTests.ts
artifacts/api-server/src/scripts/smokeClassify.ts
artifacts/api-server/src/scripts/smokeContactGenerate.ts
artifacts/api-server/src/scripts/smokeDeliveryFlow.ts
artifacts/api-server/src/scripts/smokeDraftIngest.ts
artifacts/api-server/src/scripts/smokeFollowupFlow.ts
artifacts/api-server/src/scripts/smokeFollowupProgress.ts
artifacts/api-server/src/scripts/smokeGeneratorParity.ts
artifacts/api-server/src/scripts/smokeKillSwitch.ts
artifacts/api-server/src/scripts/smokeLlmChain.ts
artifacts/api-server/src/scripts/smokeLlmLedger.ts
artifacts/api-server/src/scripts/smokePregenerate.ts
artifacts/api-server/src/scripts/smokePrepareProgress.ts
artifacts/api-server/src/scripts/smokePricing.ts
artifacts/api-server/src/scripts/smokeRegenerate.ts
artifacts/api-server/src/scripts/smokeReminders.ts
artifacts/api-server/src/scripts/smokeResearchDirective.ts
artifacts/api-server/src/services/backgroundPrepare.ts
artifacts/api-server/src/services/channels/linkedin.ts
artifacts/api-server/src/services/digestScheduler.ts
artifacts/api-server/src/services/firstMessageDrafts.ts
artifacts/api-server/src/services/followupMessageService.ts
artifacts/api-server/src/services/followupPregenerate.ts
artifacts/api-server/src/services/followupScheduler.ts
artifacts/api-server/src/services/manualContactPrepare.ts
artifacts/api-server/src/services/prepareProgress.ts
artifacts/api-server/src/services/previewFirstMessage.ts
artifacts/api-server/src/services/pushoverDigest.ts
artifacts/api-server/src/services/pushoverDueNotifier.ts
artifacts/api-server/src/services/pushoverNudges.ts
artifacts/api-server/src/services/pushover.ts
artifacts/api-server/src/services/seedClassifier.ts
artifacts/api-server/src/services/weeklyDigest.ts
artifacts/dashboard/e2e/contacts-generate.spec.ts
artifacts/dashboard/playwright.config.ts
artifacts/dashboard/public/manifest.json
artifacts/dashboard/src/components/accounts/HealthCheckPanel.tsx
artifacts/dashboard/src/components/accounts/UserPreferencesPanel.tsx
artifacts/dashboard/src/components/followup/AddManualContactDialog.test.tsx
artifacts/dashboard/src/components/followup/EditFirstMessageDialog.tsx
artifacts/dashboard/src/components/followup/FirstMessagePreviewDialog.test.tsx
artifacts/dashboard/src/components/followup/FirstMessagePreviewDialog.tsx
artifacts/dashboard/src/components/followup/PrepareProgressBar.tsx
artifacts/dashboard/src/components/prospects/ProspectTimeline.tsx
artifacts/dashboard/src/components/PushoverSettings.tsx
artifacts/dashboard/src/components/SendConfirmDialog.tsx
artifacts/dashboard/src/components/TestChannelMessage.tsx
artifacts/dashboard/src/components/WeekdayPicker.tsx
artifacts/dashboard/src/hooks/use-live-progress.test.ts
artifacts/dashboard/src/hooks/use-live-progress.ts
artifacts/dashboard/src/hooks/use-prepare-progress.test.tsx
artifacts/dashboard/src/lib/api/notification-settings.ts
artifacts/dashboard/src/lib/api/test-channel.ts
artifacts/dashboard/src/lib/api/user-extras.ts
artifacts/dashboard/src/lib/calendarLink.ts
artifacts/dashboard/src/lib/duplicateContactToast.ts
artifacts/dashboard/src/lib/messageLint.ts
artifacts/dashboard/src/pages/admin-ops.tsx
artifacts/dashboard/src/pages/contacts.tsx
artifacts/dashboard/src/pages/followup/linkedin.tsx
artifacts/dashboard/src/pages/reminders.tsx
artifacts/dashboard/src/test/setup.ts
artifacts/dashboard/vitest.config.ts
lib/api-zod/src/generated/types/apiError.ts
lib/api-zod/src/generated/types/channelLinkResponse.ts
lib/api-zod/src/generated/types/notificationSettingsPatch.ts
lib/api-zod/src/generated/types/notificationSettings.ts
lib/api-zod/src/generated/types/postTestPushover200.ts
lib/api-zod/src/generated/types/prepareFirstMessageRequestChannel.ts
lib/api-zod/src/generated/types/prepareFirstMessageRequest.ts
lib/api-zod/src/generated/types/prepareFirstMessageResponseStatus.ts
lib/api-zod/src/generated/types/prepareFirstMessageResponse.ts
lib/api-zod/src/generated/types/testChannelLinkRequestChannel.ts
lib/api-zod/src/generated/types/testChannelLinkRequest.ts
lib/api-zod/src/generated/types/testChannelLinkResponseChannel.ts
lib/api-zod/src/generated/types/testChannelLinkResponse.ts
lib/db/drizzle/0008_pushover_user_key.sql
lib/db/drizzle/0009_pushover_sent.sql
lib/db/drizzle/0010_user_preferences.sql
lib/db/drizzle/0011_fk_covering_indexes.sql
lib/db/drizzle/0012_followup_channel_stage_unique.sql
lib/db/drizzle/0013_prospect_identity_unique.sql
lib/db/drizzle/0014_weekly_digest_week_unique.sql
lib/db/drizzle/0015_drop_magic_link_tokens.sql
lib/db/drizzle/0016_drop_dormant_channel_columns.sql
lib/db/drizzle/0017_add_linkedin_unique_index.sql
lib/db/drizzle/0018_icy_the_enforcers.sql
lib/db/drizzle/0019_late_thor_girl.sql
lib/db/drizzle/0020_worthless_daimon_hellstrom.sql
lib/db/drizzle/0021_fluffy_spirit.sql
lib/db/drizzle/meta/0015_snapshot.json
lib/db/drizzle/meta/0016_snapshot.json
lib/db/drizzle/meta/0017_snapshot.json
lib/db/drizzle/meta/0018_snapshot.json
lib/db/drizzle/meta/0019_snapshot.json
lib/db/drizzle/meta/0020_snapshot.json
lib/db/drizzle/meta/0021_snapshot.json
lib/db/src/schema/llm_calls.ts
lib/db/src/test/globalSetup.ts
source-code/src/lib/admin.ts
source-code/src/lib/apolloRevealCap.ts
source-code/src/lib/appPublicUrl.ts
source-code/src/lib/dbErrors.ts
source-code/src/lib/doctrineVariant.ts
source-code/src/lib/exemplars/competitors.ts
source-code/src/lib/exemplars/loader.ts
source-code/src/lib/exemplars/select.ts
source-code/src/lib/featureFlags.ts
source-code/src/lib/followupLinkToken.ts
source-code/src/lib/llm/gemini.ts
source-code/src/lib/llm/router.ts
source-code/src/lib/llmSpendCap.ts
source-code/src/lib/messageTemplate.ts
source-code/src/lib/pushoverQuietHours.ts
source-code/src/lib/pushoverSchedule.ts
source-code/src/lib/smtpConfigured.ts
source-code/src/lib/usageBucket.ts
source-code/src/routes/admin.ts
source-code/src/routes/followupFallback.ts
source-code/src/routes/followupOpen.ts
source-code/src/routes/notificationSettings.ts
source-code/src/routes/prepareFirstMessage.ts
source-code/src/routes/testChannelLink.ts
source-code/src/routes/userExtras.ts
source-code/src/scripts/benchWriterQuality.ts
source-code/src/scripts/sendFollowupDigests.ts
source-code/src/scripts/smokeAudit2.ts
source-code/src/scripts/smokeBulk.ts
source-code/src/scripts/smokeChatFollowupTests.ts
source-code/src/scripts/smokeClassify.ts
source-code/src/scripts/smokeContactGenerate.ts
source-code/src/scripts/smokeDeliveryFlow.ts
source-code/src/scripts/smokeFollowupFlow.ts
source-code/src/scripts/smokeFollowupProgress.ts
source-code/src/scripts/smokeLlmChain.ts
source-code/src/scripts/smokePrepareProgress.ts
source-code/src/scripts/smokeReminders.ts
source-code/src/scripts/sweepReveals.ts
source-code/src/services/channels/linkedin.ts
source-code/src/services/digestScheduler.ts
source-code/src/services/followupDigest.ts
source-code/src/services/followupMessageService.ts
source-code/src/services/followupScheduler.ts
source-code/src/services/mailer.ts
source-code/src/services/manualContactPrepare.ts
source-code/src/services/phoneRevealSweep.ts
source-code/src/services/prepareProgress.ts
source-code/src/services/pushoverDigest.ts
source-code/src/services/pushoverDueNotifier.ts
source-code/src/services/pushoverNudges.ts
source-code/src/services/pushover.ts
source-code/src/services/seedClassifier.ts
source-code/src/services/weeklyDigest.ts
```

Features these carry, all absent at HEAD (step 8 spot-verified by grep at
HEAD vs `96f8f34`): the LLM router/ledger/spend-cap (`lib/llm/router.ts`,
`llmLedger.ts`, `llmSpendCap.ts`, schema `llm_calls.ts`), the per-user
follow-up kill switch enforced at 11 send paths (`0845f3c`) + admin ops page,
the Speed pass (`6bd382b`: `backgroundPrepare.ts`, `followupPregenerate.ts`,
`prepareProgress.ts`), the LinkedIn channel (`beb866e`/`6780dd5`:
`services/channels/linkedin.ts`, `pages/followup/linkedin.tsx`), the seed
classifier, first-message draft/preview flow, the entire pushover
notification stack, the Contacts page (`contacts.tsx`, 658 lines), reminders
page, 27 smoke scripts, the vitest/Playwright test infrastructure, and
**Drizzle migrations 0008–0021 with their meta snapshots**.

That last item resolves open item 5's mystery: the "14 applied migrations
with no file in this repo" (rows 9–22 of `drizzle.__drizzle_migrations`) are
exactly `lib/db/drizzle/0008_pushover_user_key.sql` …
`0021_fluffy_spirit.sql`, present at `96f8f34`. The live database was built
by the lost July lineage; the repo and database were never on "two different
lineages" — the repo lost its own. Note the collision: post-reset M1 created
a *different* 0008 (`0008_additive_schema_reconciliation`), so the migration
journals of the two lineages now genuinely conflict and reconciliation is
part of any restoration.

Peak line counts (step 7, HEAD vs maximum ever, all peaks at the July tip):
`pages/today.tsx` 196 vs 799; `pages/contacts.tsx` 0 vs 658;
`routes/prospects.ts` 1,623 vs 1,990; `routes/followups.ts` 752 vs 997;
`services/prospectResearch.ts` 564 vs 788; `services/messageGenerator.ts`
1,218 vs 1,312. (`channelRegister.ts` is 1,276 at HEAD vs 676 at the July
tip — larger because the July rewrite deliberately removed the Teams/Slack
501 stubs; larger is not newer.)

**SYMPTOM ANCHORS (steps 17–20).**
- *July channel-register work*: NOT present at HEAD.
  `artifacts/api-server/src/lib/channelRegister.ts` at HEAD is byte-identical
  to the June-22 tree (`git diff e9ed33c HEAD -- <file>` empty): 1,276 lines,
  16 rule constants for WhatsApp/Telegram/Teams/Slack, header "All four
  channels (WhatsApp, Telegram, Teams, Slack)". The newest version ever
  (July 8: `996f1f9` removed Teams/Slack, `beb866e` added LinkedIn, `6780dd5`
  completed threading; carried through `96f8f34`) is 676 lines with four
  `TELEGRAM_*` and four `LINKEDIN_*` rule constants and the removed-channels
  comment at line 20 ("Teams and Slack were removed (never built past a 501
  stub)"). Value history: created 2026-04-30 `1852e2b`; Telegram rules
  2026-05-11 `7f1fe56`; Slack 2026-05-11 `74bbfdb`; all-four 2026-05-11
  `46016ea`; July-8 rewrite as above. Today's value is the pre-July-8 one;
  the newer version was removed by the 2026-07-27 reset (`cd89a49`), not by
  any commit that edited the file.
- *Prospect and follow-up generation stages*: NOT the newest. The July
  services directory holds 36 entries vs 23 at HEAD; the 13 absent ones are
  the generation/scheduling stages named above, and the shared stages that
  exist on both sides are the June versions at HEAD (line counts above; HEAD
  == June-22 for each, modulo the July-30 URL-centralization edits).

**BUNDLE INVENTORY (steps 13–16).** No *-backup or .backups directories
exist. Dated inventory:

| Archive | Internal dates | Added by commit |
|---|---|---|
| attached_assets/chat-followuper-plan_1777567460931.zip | 2026-04-30 16:40 | (untracked asset) |
| attached_assets/* (~80 ticket zips, 14 prompt txts, 4 relay mds) | 2026-04-30 → 2026-05-13 | various/untracked |
| url-input-prereq.zip | 2026-05-10 14:39 | 2555e35 2026-05-10 |
| cf-reveal-expiry-v2.zip | 2026-06-22 09:13 | a8b1617 2026-06-22 |
| cf-followup-digest-v2.zip | 2026-06-22 10:22 | a8b1617 2026-06-22 |
| cf-today-queue-v2.zip | 2026-06-22 16:41 | 2b6f962 2026-06-22 |
| cf-admin-foundation-v2.zip | 2026-06-22 17:06 | 1b507c7 2026-06-22 |
| cf-whatsapp-test-v2.zip | 2026-06-22 17:18 | e9ed33c 2026-06-22 |

The cf-* directories at root are byte-identical extractions of their zips.
All five June bundles were mined: every payload file and all 18 patch markers
are present at HEAD; the only two divergences (`followupDigest.ts`
`appBaseUrl()` removal, `followupOpen.ts` `dashboardFallback()` rewrite) are
places where HEAD is *newer* (Bundle 1/2, `41c7639`/`2b6076b`, 2026-07-30).
The May toggle-race zip's atomic-UPDATE patch is present at HEAD (applied by
`ec83e10`). So the bundles prove the June-and-earlier lineage is intact at
HEAD — the loss is exclusively the July lineage, for which no archive exists.
Incidental finding: the founding plan docs (`CHAT_FOLLOWUPER_BUILD_PLAN.md`,
`PHASE_1_TICKETS.md`, `PHASE_1_AMENDMENTS.md`, `README.md`) exist ONLY inside
the April zip — never committed on any ref.

**ENV VARS THAT COULD MIMIC A ROLLBACK (step 12).** Full inventory in the
PA-1 report; the flagged ones: `DASHBOARD_DIST_DIR` (routes/spa.ts:45 —
points the server at an arbitrary frontend build: the exact "interface
current, behavior old" mechanism); `BASE_PATH` (baked into the dashboard at
build time — rollback requires republish); `PROSPECTOR_SONNET_MODEL`
(model-name override, default claude-sonnet-4-6);
`FOLLOWUP_<stage>_MIN/MAX_DAYS`, `SEND_HOUR_START/END` (scheduling window);
`FOLLOWUP_LINK_TTL_HOURS` (default 336); `REVEAL_PENDING_MAX_AGE_HOURS`
(default 72); `ADMIN_EMAILS` (empty = no admins); `ALLOWED_LOGIN_DOMAINS`;
`DATABASE_URL`; `SESSION_SECRET`. `.env.example` lists `MAILGUN_*` and
`PUBLIC_BASE_URL` which nothing at HEAD reads.

**SMALLEST SAFE RESTORATION (step 22 — NOT executed by this order).**
1. First, durability: push `audit/godlike-fixes` to origin under its own name
   (ROADMAP git-safety rule 2). Until then the July work exists only on this
   workspace's disk and the gitsafe daemon.
2. Restore by **merge, not reset**: `git merge audit/godlike-fixes` into main
   (merge-base is `e9ed33c`, so July changes and post-reset changes are
   mostly disjoint; expected conflict surface: `app.ts`, `routes/index.ts`,
   `build.mjs`, `vite.config.ts`, `.env.example`, `replit.md`,
   `pnpm-lock.yaml`, and the Drizzle journal). Resolve in favor of July
   content, then re-apply the post-reset invariants on top: Bundle 1/2 URL
   centralization (`appConfig.ts` imports in the restored files), the C1/CP1
   config, and L1a's 307 + L1b's boot test (the gate will fail until the
   restored `app.ts` carries the 307).
3. Reconcile migrations explicitly: keep July's 0008–0021 files (already
   applied to the live DB as journal rows 9–22), renumber or fold M1's
   additive `0008_additive_schema_reconciliation` (applied as id 23), and
   verify with the schema diff harness from M1 before any drizzle-kit run.
4. Republish only after the L1b gate and the M1 test gate pass on the merged
   tree, per cutover rules (one app per hour, 307 verified from the access
   log).

**What would settle the one open question** (whether the 2026-08-02 17:56
publish actually built and deployed rather than an older image serving): the
Replit Publishing/Deployments pane → History and Build logs. Everything else
above rests on commit hashes, diffs, live probes and command output recorded
in this entry.


### 2026-08-02 — Cutover L1b: pin the legacy redirect status code (CLOSED, ritual clean)

Branch: `cutover-l1b-pin-status`. Scope: resolve open item 13 — ROADMAP v3's
redirect rule 6, "Pin the status code with a test that boots the app, so a
future edit fails a gate rather than passing silently." **Test-only. No
production code changes, and nothing to publish.**

**WHY.** L1a proved the 307 with a lit smoke, which is a manual run by a human
who chose to do it. Nothing in `pnpm test` fails today if someone puts the 308
back — the only defenses are a code comment and this ledger, and both are
advisory. The gate is what makes the status code hold when nobody is looking.

**LINEAGE CHECK (before any edit)**

- **Git.** Working tree clean. `HEAD` = `cutover-l1b-pin-status`, cut from
  `main` = `86e208c`, which contains L1a's merge and the owner's publish
  `5c72224` (ROADMAP v3). `origin/main` = `86e208c`, in sync.
- **The property to pin is live.** `app.ts:125` reads `res.redirect(307, …)`;
  its sha256 is recorded here as
  `1d684ae2d5901774dbb3286c52b00ed28a70b188160269be0ffec804b5e874da` (blob
  `11e7823`) and must be byte-identical at close, since step 3 of this order
  deliberately edits it and puts it back.
- **How this artifact tests.** Node's built-in runner over TypeScript with
  native type stripping, no framework, no dependency:
  `node --test src/lib/basePath.test.ts`. Two `.mjs` integration scripts sit in
  `tests/` unwired to any script; they are not touched.
- **The app cannot be imported in-process.** `node` resolves ESM strictly:
  `import router from "./routes"` is a directory import, so
  `import("./src/app.ts")` fails with `ERR_UNSUPPORTED_DIR_IMPORT`. Verified,
  not assumed. The test must therefore boot the **built** artifact — which is
  the better subject anyway: it pins the bundle that actually ships, not a
  re-assembled approximation of it.
- **A boot needs `DATABASE_URL`.** `lib/db/src/index.ts:7` throws at import
  without it. The existing `lib/db` suite already runs against the live
  database, so this is the environment every gate in this repo already assumes;
  no probe in this test reaches a query (all four answer before the DB).

**BLAST RADIUS (written before any edit)**

Files to be touched (3):

- `artifacts/api-server/src/app.test.ts` — NEW. Boots the built artifact twice,
  lit and dark, on OS-assigned free ports, and asserts the four properties of
  open item 13.
- `artifacts/api-server/package.json` — the `test` script gains the new file.
  Test wiring, not production code; it is the one line that turns the file into
  a gate.
- `TODO.md` — this entry, and open item 13 closed out.

Files deliberately NOT touched: **`artifacts/api-server/src/app.ts`** — it is
edited three times in step 3 to prove the test bites, and restored to the byte
recorded above; the close-out check is `git diff` empty plus a sha256
comparison against the recorded blob. Also untouched: every other production
file, `tests/*.mjs`, `basePath.ts` and its mirror, both `basePath.test.ts`
copies, `lib/`, migrations, secrets, `.replit`, `artifact.toml`,
`pnpm-lock.yaml`. **No dependency added** — no supertest, no framework; the
test uses `node:test`, `node:assert`, `node:child_process`, `node:net` and
`fetch`.

Behaviors affected:

- **The api-server test gate only.** It grows from 18 assertions to 18 plus
  four HTTP-level ones, and from ~0.2s to a few seconds, because it builds the
  artifact and boots it twice. Nothing the app does at runtime changes.
- **`dist/` is rebuilt when the suite runs.** The test builds before booting,
  on purpose: a test that boots a stale `dist` would pass while the source said
  308, which is the exact failure this order exists to prevent. That rebuild
  writes the same directory the workflow's already-running process was started
  from — harmless, since Node has the bundle in memory and nothing restarts it,
  and identical to what the build gate already does.

Worst realistic failure:

- (a) **The test is flaky and someone deletes it**, leaving the status code
  unpinned again with a ledger claiming otherwise. Mitigated by OS-assigned
  ports rather than fixed ones, by waiting on a real health response rather
  than a timer, and by killing both children in an `after` hook that runs even
  when a test fails.
- (b) **The test passes for the wrong reason** — asserting on a redirect that
  is not the one under test, or on a server that never booted. Mitigated by
  step 3: three deliberate mutations (308, 302, 301), each recorded with which
  assertions fail. A test that does not fail on all three is not pinning
  anything.
- (c) **The step-3 mutations are left in the tree.** Mitigated by restoring
  from git and proving byte-identity against the recorded sha256, not by eye.
- (d) **The gate needs a database it does not have elsewhere.** Recorded above,
  not defended against: it is the same assumption `lib/db`'s suite already
  makes in this repo.

Rollback path: git branch `cutover-l1b-pin-status`; `main` untouched until the
ritual closes clean. Nothing deployed, restarted or published — and unlike
L1a, nothing here needs a publish at all, since no shipped byte changes. The
running workflow is never touched: every boot is a child process on an
OS-assigned free port, killed by its own PID.

**WHAT SHIPPED — 3 files predicted, 3 files touched. The blast radius held
exactly.** One new file (`artifacts/api-server/src/app.test.ts`), one line of
test wiring (`artifacts/api-server/package.json`), and this ledger. **No
dependency added** (`pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`
all diff empty) — the test is `node:test`, `node:assert`, `node:child_process`,
`node:net` and `fetch`. **`app.ts` is byte-identical to `HEAD`** after being
mutated four times: sha256
`1d684ae2d5901774dbb3286c52b00ed28a70b188160269be0ffec804b5e874da`, the value
recorded before any edit, and `git diff` on it is empty. Both `basePath.ts`
copies and both `basePath.test.ts` copies are still byte-identical. The
shipped bundle does not contain the test: zero occurrences of the probe path
in `dist/index.mjs`, because `build.mjs` bundles from `src/index.ts` and
nothing imports a test.

**THE TEST.** `src/app.test.ts` builds the artifact with the artifact's own
`build.mjs` — not a second copy of the esbuild config — then boots
`dist/index.mjs` twice on OS-assigned free ports, lit and dark, and kills both
children in `after`. It rebuilds every run **on purpose**: a test that booted a
stale `dist` could pass while the source said 308, which is the exact failure
it exists to prevent. `NODE_ENV=production` is set for the children for one
reason — it switches pino from the pretty transport to one JSON object per
line, which is what makes property 3 a parse of the access log rather than a
guess. Four tests, one per property of open item 13:

1. a POST to a legacy `/api/...` path answers **307**;
2. `Location` is that path under `/chat/api` with the query byte-intact,
   checked both as a string and by resolving it with the WHATWG `URL` parser
   (v3 ritual step 4: a parser as the oracle, never string shape) — origin,
   pathname and search each asserted;
3. following the hop, **the access log shows `POST` arriving at the prefixed
   mount**, not GET;
4. with `BASE_PATH` unset the legacy mount does not exist: the request is
   answered, no `Location`, nothing in the log with a 3xx.

**PROOF THAT THE TEST BITES — four mutations of `app.ts`, each run in full,
each restored from `HEAD`'s blob rather than by eye.**

| mutation | test 1 (307) | test 2 (Location) | test 3 (method) | test 4 (dark) | suite |
|---|---|---|---|---|---|
| `res.redirect(308` | FAIL `308 !== 307` | FAIL `308 !== 307` | FAIL `308 !== 307` | pass | exit 1, 19/3 |
| `res.redirect(302` | FAIL `302 !== 307` | FAIL `302 !== 307` | **FAIL `'GET' !== 'POST'`** | pass | exit 1, 19/3 |
| `res.redirect(301` | FAIL `301 !== 307` | FAIL `301 !== 307` | **FAIL `'GET' !== 'POST'`** | pass | exit 1, 19/3 |
| `IS_PREFIXED` gate removed | pass | pass | pass | **FAIL "it answered 307"** | exit 1, 21/1 |

Two things that table says and a bare "the test fails" would not. First, under
**302 and 301 the failure is the method itself** — `'GET' !== 'POST'`, read
out of the server's own access log, which is the harm those codes do rather
than a proxy for it; under **308 the method survives** (308 preserves it too)
and what fails is the recorded status. The suite distinguishes the two failure
modes instead of lumping them. Second, the fourth mutation exists because
tests 1–3 all pass when the redirect is ungated, so without it there would be
no evidence that test 4 asserts anything at all; ungating the mount makes dark
answer 307 to a path it must answer itself, and test 4 — alone — catches it.

*A note on the first mutation pass, which was discarded.* Its 302 run was
invalid: a concurrent git process held `.git/index.lock`, the `git checkout`
restore silently failed, and the perl replacement then found no `307` to
rewrite, so that run re-tested 308 while claiming to test 302. Caught by the
mutation count printed for each run. The harness was rewritten to restore from
a byte copy of `HEAD`'s blob with no git involved, and all four mutations were
re-run from scratch; the table above is that pass. Recorded because a harness
that can silently test the wrong thing is exactly what this order is about.

**GATES — all pass.**

- **Typecheck:** `pnpm run typecheck` clean across all four projects. The test
  file is inside `tsconfig`'s `include`, so it is typechecked like production
  code.
- **Tests:** 50/50 — `api-server` **22/22** (18 unit + 4 new HTTP),
  `dashboard` 18/18, `api-client-react` 7/7, `db` 3/3. The api-server suite
  was run **three times consecutively**, 22/22 every time, as a flake check;
  it takes ~3.4s, up from ~0.2s, because it builds and boots the artifact.
- **Build:** `PORT=23183 pnpm run build` clean; `dist` carries one
  `res.redirect(307` and zero `308`, and the dashboard build stayed dark.

**GODLIKE AUDIT — 6 rounds, closed clean, with one in-scope finding fixed in
round 1 and re-proved afterwards.**

- Round 1 (technical): **one finding, fixed.** The first draft asserted `401`
  from `POST /api/campaigns`, which couples this gate to that endpoint's auth
  behavior — a future refactor there would fail this test for a reason with
  nothing to do with the status code, and a gate that cries wolf gets deleted.
  The property belongs to the *mount*, which answers before routing, so the
  three mount-level tests now use a path no router claims,
  `/api/__l1b_status_probe__`, and assert the API's own 404 at the far end.
  The mutation table above was re-run in full against the fixed file.
  A second, smaller finding from the same round: test 3 originally asserted the
  recorded status before the method, so a 302 failed on the status line and
  masked the downgrade. The assertions were reordered so each test fails on the
  property it owns — which is what produced the `'GET' !== 'POST'` evidence.
- Round 2 (security): clean. The test authenticates nothing and sends no
  credentials; pino's existing redaction covers `authorization` and `cookie`
  either way. The children inherit the environment exactly as the app does,
  including `DATABASE_URL`, and no probe reaches a query. Each child binds an
  OS-assigned ephemeral port for a few seconds and is killed by its own PID —
  no fixed port, no pattern kill, nothing that could reach the workflow.
- Round 3 (end-user, meaning the next maintainer): clean. Every assertion
  carries a message that says *why* — the 307 message names the cache-survives-
  rollback failure and the POST-to-GET downgrade, so a failure explains itself
  without archaeology through this ledger.
- Round 4 (sweep): clean. Exactly three files touched, no dependency, no
  generated file, no `lib/`, no migration, no secret, no `artifact.toml`, no
  `.replit`. The two `tests/*.mjs` integration scripts are untouched and remain
  unwired. `mockup-sandbox` untouched.
- Round 5 (tree and process state): clean. `app.ts` byte-identical to `HEAD`,
  no stray child processes (`dist/index.mjs` shows the workflow's own `sh`
  wrapper and its node process, nothing else), and `:8080` answering 200
  throughout. The workflow processes have been at their **17:51:43–47** start
  times since before this order began — they were restarted by the platform
  when ROADMAP v3 landed, not by L1b's builds or test runs, which touched no
  fixed port.
- Round 6 (final read-through): clean, no finding. Ritual closed.

**No smoke run, deliberately.** ROADMAP v3's ritual step 5 asks for a smoke
"where a switch is involved". Nothing shipping changed here — `app.ts` is
byte-identical and the dashboard is untouched — so there is no new behavior to
smoke and nothing to publish. The four HTTP tests *are* the lit and dark runs,
now permanent and automatic.

**OUT-OF-SCOPE FINDINGS — none.**

**Not deployed, not published, not restarted.** Nothing about the running app
changed, so no publish is needed at all.

### 2026-08-02 — Cutover L1a: legacy `/api` redirect 308 → 307 (CLOSED, ritual clean)

Branch: `cutover-l1a-307`. Scope: one status code, plus the comment and
documentation lines that name it. Nothing else.

**WHY.** The legacy redirect shipped in the post-cutover repair below as a
**308 Permanent Redirect**, which is permanent by name and heuristically
cacheable by definition (RFC 7538 §3). Rollback in this project is "unset
`BASE_PATH` and `PUBLIC_URL`, redeploy" — one minute, no code change
(ROADMAP, per-app migration cycle, step 8), and the entire migration rests on
that guarantee. A client holding a cached 308 keeps rewriting `/api/...` to
`/chat/api/...` *by itself*, without asking this origin; the moment the prefix
is withdrawn, `/chat/api/...` 404s and that client is broken by the very
action that was supposed to repair it. No server-side change can reach a cache
entry a client already holds — which is exactly why the code must stop
creating new ones. **307 Temporary Redirect makes the identical guarantee
about preserving the request method and body** (RFC 7231 §6.4.7 — the reason
this mount is not a 301/302 in the first place), preserves the query string
the same way, and is not cacheable unless a `Cache-Control` header says so,
which this response does not send. The permanence was never load-bearing; the
method preservation was.

**302 is excluded on purpose**, here and anywhere on this path: it permits a
client to downgrade a POST to a GET, which is the one thing this redirect
exists to prevent.

**LINEAGE CHECK (before any edit)**

- **Git.** Working tree clean at branch point. `HEAD` = `cutover-l1a-307`, cut
  from `main` = `4376b2e` ("Published your App"). `origin/main` is one commit
  behind at `3a33203`; the newest Replit deployment commit `4376b2e` is local
  only, and this branch's push would carry it (see the push note at the end of
  this entry — it could not be pushed).
- **The change under repair is deployed.** Unlike the sibling apps, where the
  same finding was caught before publish, this 308 is *live*: `main` carries
  it, and the four "Published your App" commits dated 2026-08-01/02 sit on top
  of the post-cutover repair. See the exposure note below.
- **The running baseline.** The api-server on `:8080` (pid 356) was built from
  `main` at workspace boot — its `dist/index.mjs` contains exactly one
  `res.redirect(308` — and runs with `BASE_PATH` and `PUBLIC_URL` unset
  (`APP_PUBLIC_URL` only). It is therefore a valid **`main` baseline in the
  rolled-back state**, which is exactly what a dark run has to match. Its
  24-probe transcript (the 17 baseline probes plus 7 prefix-surface probes)
  was recorded **before any edit**, twice, diffing empty between the two
  recordings, and is the reference for the dark smoke below.
- Nothing near `lib/db` — open item 5's migration lineage is untouched and
  still deferred.

**BLAST RADIUS (written before any edit)**

Files to be touched (2):

- `artifacts/api-server/src/app.ts` — the status code in the legacy redirect
  (one argument), and the comment block above it, which names 308 and argues
  for its permanence
- `TODO.md` — this entry, plus the open item 8 resolution text, which names
  308 three times in the live open-items section

Files deliberately NOT touched: `spa.ts`'s bare-prefix `res.redirect(302, …)`
(a different mount, guarded to GET/HEAD, pre-existing — see the audit note);
every other `res.redirect(302, …)` in the tree (login, OAuth error, follow-up
fallback — all GET-only browser navigations, all pre-existing); the Apollo
webhook's legacy first-class mount (it deliberately does not rely on a
redirect at all); `basePath.ts` and its mirror; `appConfig.ts`; every
`artifact.toml`; `lib/`, migrations, secrets, `.replit`, `pnpm-lock.yaml`,
`package.json`. No dependency added.

A third file was predicted by the order — `ROADMAP.md`, to correct a "Git
safety rule 1" worded as a tree-equality check between branches. **That rule
does not exist in this repo's copy of ROADMAP.md**, on any ref. Verified
before any edit and recorded as open item 11 rather than invented; ROADMAP.md
is left untouched.

Behaviors affected:

- **The legacy `/api/*` redirect, and only it.** Under a prefix the response
  status line changes from `308 Permanent Redirect` to `307 Temporary
  Redirect`. The `Location` header, the method, the body and the query string
  are unchanged: both codes are defined to preserve the method, and the target
  is built by the same one line of string arithmetic. The redirect stays
  mounted after the platform health router and stays gated on `IS_PREFIXED`.
- **Dark: nothing at all.** The mount is inside `if (IS_PREFIXED)`, so with
  `BASE_PATH` unset this code never runs. The dark run must be byte-identical
  to the recorded baseline, and that is the point: dark is the rollback state.

Worst realistic failure:

- (a) **A client caches the 307 anyway.** Some intermediaries cache 307 when
  told to; this response carries no `Cache-Control`, so nothing tells them to.
  Bounded and self-limiting in a way 308 is not.
- (b) **The status is changed in the code but a doc line keeps saying 308**,
  and the next person "restores consistency" by putting the permanence back.
  Mitigated by treating the comment and the open-item text as part of the
  change, and by this entry.
- (c) **Someone reads "temporary" as "may drop the method"** and later
  downgrades it to 302. Mitigated by the comment rewrite, which states the
  method-preservation requirement first and 302's downgrade explicitly.

Rollback path: git branch `cutover-l1a-307`; `main` untouched until the ritual
closes clean. Nothing deployed, restarted or published; no secret written; the
running workflow is never touched — every boot is on a free port
(`:8123`/`:8124`), and `:8080` is only ever read from.

**THE CACHED 308 THAT CANNOT BE RECALLED — recorded honestly**

This is the material difference from the sibling apps, where the same finding
was raised before anything shipped. Here the 308 was written, published and
served. **Any client that has already followed it holds a cached permanent
redirect, and no server-side change can clear that entry** — not this one, not
a redeploy, not the rollback. Changing the code stops *new* cache entries from
being created; it cannot revoke the ones already handed out.

The exposure is bounded, and worth stating precisely:

- It covers only clients that **actually hit a legacy `/api/...` path since
  the cutover** — in practice, browsers following the emailed
  `/api/followups/open/<id>?t=…` links, and the Google OAuth callback hop from
  `GOOGLE_OAUTH_REDIRECT_URI`. A client that never touched a legacy path
  cached nothing.
- The dashboard is not exposed: it calls the prefixed paths directly.
- The Apollo webhook is not exposed: its legacy address is a first-class mount
  of the same router, not a redirect, so Apollo was never handed a 3xx to
  cache.
- Browsers key such an entry per exact URL. A `/api/followups/open/42?t=…`
  link is single-use in practice, so the cached hop is mostly re-followed only
  for the OAuth callback path and any repeated legacy URL.
- The window is from the cutover publish to the publish that carries this
  change.

The residual, stated plainly: **if a rollback happens, the clients inside that
window may still bounce to a 404 until their cache entry expires or is
cleared, and the only remedies are client-side.** After this change ships, the
population stops growing.

**WHAT SHIPPED — 2 files predicted, 2 files touched. The blast radius held
exactly.** `git status` reads two modified files and zero untracked files:
`artifacts/api-server/src/app.ts` (one argument, `308` → `307`, plus the
comment block above it) and `TODO.md` (this entry, the open item 8 text, the
supersession note on the entry below, and out-of-scope open items 11 and 12).
No dependency, no generated file, no `lib/` file, no migration, no secret, no
`artifact.toml`, no `.replit`, no `pnpm-lock.yaml`. `basePath.ts` and
`basePath.test.ts` are still byte-identical between the two artifacts (`diff`
empty on both pairs). `ROADMAP.md` untouched — see open item 11.

**GATES — all pass.**

- **Typecheck:** `pnpm run typecheck` — `tsc --build` for the libs plus all
  four projects (`api-server`, `dashboard`, `mockup-sandbox`, `scripts`),
  clean.
- **Tests:** 46/46 across the four packages that have a suite —
  `api-server` 18/18, `dashboard` 18/18, `api-client-react` 7/7, `db` 3/3.
  No test pinned the old status code, so none needed changing; the redirect
  has no unit test at either code, and its behavior is pinned by the smoke.
- **Build:** `PORT=23183 pnpm run build` — clean. The emitted
  `artifacts/api-server/dist/index.mjs` contains exactly one
  `res.redirect(307` and zero `res.redirect(308`. The dashboard rebuilt to the
  same asset hashes it already had (`index-DLG9_phr.js`,
  `index-BQ1Hep_e.css`) with zero `/chat` in `index.html`, so the tree's dark
  build is unchanged.

**GODLIKE AUDIT — 6 rounds, clean in scope from the first, closed on a clean
round with no in-scope finding in any of them.**

- Round 1 (technical, the diff and the whole tree): clean. The only surviving
  `308` in tracked code is in the new comment, twice, both times telling the
  next reader not to go back to it — which is the point. `git grep 308` finds
  nothing else outside this ledger. **One out-of-scope finding** (open item 12,
  the roadmap's "permanent redirects" wording — the source of the 308).
- Round 2 (security, hostile request lines through the legacy mount, lit on
  `:8125`): clean, with evidence rather than assertion. Nine hostile spellings
  — `/api//evil.example`, `/api/\evil.example`, `//api/evil.example`,
  `/api/%2f%2fevil.example`, `/api/..//evil.example`,
  `/api/x?next=//evil.example`, a CRLF-bearing path, an absolute-form request
  line naming `evil.example`, and a POST variant — produce a `Location` that
  begins `/chat/api` in every case that redirects at all (`//api/…` does not
  match the mount and 404s). None is protocol-relative, none is absolute, and
  the CRLF stays percent-encoded: no injected header appears in the response.
  The same-origin-by-construction claim in the comment holds under the new
  status code, unchanged. The response carries **no `Cache-Control`, no
  `Expires`, no `Surrogate-Control`** — only `Vary: Accept` — so nothing tells
  any cache to store the hop, which is the whole point of the change.
- Round 3 (end-user, lit on `:8126`): clean. The two flows that actually
  matter, followed the way a browser follows them:
  **the emailed link** `/api/followups/open/42?t=TOKEN` → 307 →
  `/chat/api/followups/open/42?t=TOKEN` → 302 → the WhatsApp fallback, token
  intact across the hop; **the Google OAuth callback**
  `/api/auth/google/callback?code=X&state=Y` → 307 →
  `/chat/api/auth/google/callback?code=X&state=Y` → 302 →
  `/chat/login?error=oauth_state_invalid`, which is the correct answer for a
  callback presented without the state cookie and proves the handler is
  reached with its query intact. (Note for the record: the first flow's last
  hop is an absolute `https://tools.mobupps.net/chat/...` URL, so that one
  GET left the sandbox to the live gateway. Read-only, and the app's own
  address.)
- Round 4 (mount boundary and methods, lit): clean. `/api` → `/chat/api` and
  `/api/` → `/chat/api/` (empty suffix is handled); `/apiary` and `/apiary/x`
  are **not** redirected — the mount is segment-bounded, so the `/apiary`
  observation from the post-cutover repair still holds. Every method that can
  carry a body is preserved: GET, HEAD, POST, PUT, PATCH and DELETE all answer
  307 with the same `Location`. `OPTIONS` answers `204` directly from the
  `cors()` middleware ahead of the mount rather than redirecting — pre-existing
  and correct, since browsers do not follow redirects on a preflight. Uppercase
  `/API/campaigns` redirects too, matching Express's case-insensitive routing
  and `isApiPath`'s deliberately case-insensitive guard; pre-existing.
- Round 5 (tree and process state): clean. Exactly the two predicted files
  modified, zero untracked files anywhere, both mirror pairs still identical,
  the dark build still in the tree, and all eleven workflow processes still at
  their original 17:16:20–17:16:24 start times. `:8080` answers
  `/api/healthz` 200 throughout. Every port I opened (`:8123`–`:8126`) is free
  again; each server was killed by its own PID, never by name or pattern.
- Round 6 (final read-through after the out-of-scope items were written):
  clean, no finding. Ritual closed.

**SMOKE — two runs, on free ports, against the built artifact; the running
workflow on `:8080` was only ever read from.**

*The recorded baseline.* The api-server on `:8080` (pid 356, started 17:16:24)
was built from `main` at workspace boot — one `res.redirect(308` in its
`dist` — with `BASE_PATH` and `PUBLIC_URL` unset. That is `main` in the
rolled-back state, which is exactly what a dark run must match. Its 24-probe
transcript (status, content-type, `Location`, `Set-Cookie` and body per probe,
with the OAuth `state` nonce and any hex token redacted) was recorded **before
any edit**, twice, and the two recordings diffed empty.

*DARK RUN (`BASE_PATH` and `PUBLIC_URL` unset), `:8124` — 24/24
byte-identical.* The transcript **diffed empty** against the recorded
baseline. No `301`, `307` or `308` appears anywhere in it; the three `302`s
are the pre-existing GET-only ones (`GET /api/auth/logout` → `/login`, the
OAuth start, the follow-up fallback) and they are byte-identical to baseline,
`Set-Cookie` and all. The boot log shows `Server listening` and **no**
"Serving dashboard under base path" line, so the SPA is still inert and
`/chat`, `/chat/`, `/chat/login`, `/chat/api/healthz` and `/chat/assets/x.js`
all still 404 exactly as they do on `main`. **The rollback path is intact and
unchanged by this order.**

*LIT RUN (`BASE_PATH=/chat/`, `PUBLIC_URL=https://tools.mobupps.net/chat`, set
for the spawned process only, never written to Replit Secrets), `:8123` — run
twice, output identical across both runs (PIDs aside).*

- **A POST to a legacy path answers 307.** `POST /api/campaigns` →
  `HTTP/1.1 307 Temporary Redirect`, `Location: /chat/api/campaigns`.
- **The method actually arrives as POST at the prefixed path — from the
  server's own access log, not asserted.** pino-http logs every completed
  request with its method and path. Following the hop with `curl -L` produced
  two consecutive log entries:

  ```
     4  POST   /api/campaigns                 -> 307
     5  POST   /chat/api/campaigns            -> 401
  ```

  The second line is the server recording that what reached the prefixed mount
  was a **POST**, not a GET. The client side agrees: `curl -v` shows
  `> POST /api/campaigns` with `Content-Length: 15`, then
  `> POST /chat/api/campaigns` with `Content-Length: 15` — the body was
  re-sent on the redirected request — and the chain ends `401
  {"error":"not_authenticated"}` at
  `http://127.0.0.1:8123/chat/api/campaigns`, which is the right answer for an
  unauthenticated POST that arrived intact. A 302 here would have produced
  `GET /chat/api/campaigns` on line 5; that is the failure this order exists to
  keep out of the code.
- **The query string survives.** `GET /api/followups/open/42?t=abc123` → 307 →
  `Location: /chat/api/followups/open/42?t=abc123`.
- **Zero 308s and zero 302s on any legacy `/api` path** across the whole run,
  counted from the access log.
- **Ordering intact.** `/api/healthz` and `/api/health` answer `200
  {"status":"ok"}` **directly**, with no hop — the startup probe never depends
  on a redirect, which is what the mount order after the platform health
  router buys.
- **The Apollo webhook is still first-class at both addresses.** `POST
  /api/apollo/webhook/phone-reveal` and `POST
  /chat/api/apollo/webhook/phone-reveal` both answer `401
  {"error":"invalid_signature"}` — the legacy webhook is a real mount, not a
  redirect, so nothing about it depends on a sender following a 3xx on POST.
- **The prefixed surface is unchanged.** All 15 prefixed API probes answer
  status-for-status exactly as the dark baseline does at the unprefixed
  address; the SPA probes under `/chat/` behave as they did after the
  post-cutover repair (`/chat` → 302 → `/chat/`, `/chat/` and `/chat/login` →
  200), and `/no-such-path-xyz` still 404s. The dashboard was served from the
  existing dark build via `DASHBOARD_DIST_DIR` — this order changes no
  dashboard code, so no prefixed dashboard build was needed and the repo's
  `dist` stayed dark throughout.

**OUT-OF-SCOPE FINDINGS — 2, both recorded, neither touched:** open item 11
(the Git safety rule this order was asked to reword does not exist in this
repo's `ROADMAP.md`, on any ref) and open item 12 (`ROADMAP.md` still
prescribes *permanent* redirects for old addresses, which is what produced the
308 in the first place and will produce it again on the next three apps).

**Not deployed, not published, not restarted.** Production still serves the
308 until someone republishes; publishing is Michael's call.

**MERGED AND PUSHED — both branches, after a transient auth failure worth
recording.** `cutover-l1a-307` is committed at `7689f50`, merged into `main` at
`123c1fa` with `--no-ff`, and this close-out note follows in `3f822e2` /
`096eb1f`. The directional check `git diff cutover-l1a-307 main` is **empty**,
so `main` holds everything the branch holds.

The first push attempt on **both** refs failed with

```
remote: Invalid username or token. Password authentication is not supported
        for Git operations.
fatal: Authentication failed for
       'https://github.com/MichaelMobupps/Chat-Followuper/'
```

— the same message CP1 hit on 2026-07-31, which is why that order never
pushed. It is **not** a permanent condition: retried unchanged, `git push
origin main` succeeded (`3a33203..096eb1f`) and `git push origin
cutover-l1a-307` succeeded on its own retry (`* [new branch]`). `GIT_ASKPASS`
is Replit's helper and evidently returns a stale credential until it
refreshes. **Worth knowing for every future order: an auth failure here is
worth one retry before it is recorded as blocked.** The one deployment commit
that was still local, `4376b2e`, went up with this push.

Confirmed on the remote: `refs/heads/main` = `096eb1f`,
`refs/heads/cutover-l1a-307` = `3f822e2`. Nothing was force-pushed; nothing
was mirrored to `gitsafe-backup`.

**AFTER THE CLOSE — ROADMAP v3, the publish, and production verified
(2026-08-02, 17:51–17:58).** Recorded here because it lands on top of this
order and changes what is true about it.

- **17:51:20 — ROADMAP v3 appeared in the working tree**, replacing the
  2026-07-30 copy this order audited. It is the canonical cross-app roadmap
  ("This file is canonical. Copy it into every repo in the project"). Not
  written by this order; found by a background search that was still running
  from L1a's pre-edit lineage check and finished after the merge. See open
  items 11 and 12, both resolved by it.
- **17:56:38 — the owner published.** Replit Agent commit `5c72224`
  ("Published your App") committed ROADMAP v3 and deployed. **L1a did not
  deploy or publish anything**; it stopped at ready-to-publish as ordered, and
  the publish came 17 minutes later from the Replit UI. The published tree
  carries `res.redirect(307` — verified in the commit itself, not inferred.
- **17:57 — production verified, read-only.**
  `GET https://chat-followuper.replit.app/api/auth/me` (unauthenticated, not
  followed) answers **`HTTP/2 307`** with `location: /chat/api/auth/me` and
  **no `cache-control`**. `/chat/api/healthz` answers 200 on the origin and
  200 through `tools.mobupps.net`. **The 308 is off production**, and the
  cached-308 window recorded above is now closed at both ends: it ran from the
  cutover publish to `5c72224`.
- **v3 confirms, independently, three conclusions this order reached on its
  own**: 307 is now the mandatory redirect status project-wide with 308/301
  and 302 both banned; Git safety rule 1 is exactly the directional form the
  order asked to be written; and Git safety rule 6 records the transient
  "Invalid username or token" push failure L1a hit and documented an hour
  earlier.
- **One new gap, from v3's redirect rule 6** (pin the status code with a
  boot-level test): L1a has no such test and said so. Recorded as open item 13
  — the L1b for this repo.

**AUDIT ADDENDUM — round 2 re-verified under v3's oracle rule.** v3's ritual
step 4 now says "Use a URL parser as the oracle, never string-shape checks."
L1a's round 2 predates that line and used string-shape checks on the `Location`
header, so it was re-run with the WHATWG `URL` parser as the oracle against a
lit server on `:8127`: **12 hostile spellings, every one resolving to the
request origin under the API mount** — including a raw `https://evil.example`
suffix, the backslash form (folded to `/` by the parser, still under
`/chat/api/`), and the percent-encoded double slash. No `x-injected` header
appears on any of them, and no response carries `cache-control`, `expires` or
`surrogate-control`. The three dot-segment forms are the one nuance worth
writing down: `/chat/api/..//evil.example` and its deeper variants resolve to
`/chat//evil.example` and `//evil.example` **on the request origin** — the
resolved path can leave the API mount and land on the SPA catch-all, but it
cannot leave the origin, so it is not an open redirect. Browsers normalize dot
segments before sending, so these only arise from a hand-crafted request line.
Pre-existing and unchanged by the status code; the same-origin-by-construction
claim in `app.ts` holds under a real parser.

### 2026-08-02 — Post-cutover repair: black screen at the old addresses (CLOSED)

> **Superseded in part by L1a (above), same day: the redirect status code
> recorded below as 308 is now 307.** The prose is left as the record of what
> actually shipped that day; the code says 307 and must not be moved back.

Reported live: `https://chat-followuper.replit.app/` renders a black page.
Root cause is open item 7's predicted router-base mismatch, now fired in
production — the cutover env vars are on (`BASE_PATH=/chat`,
`PUBLIC_URL=https://tools.mobupps.net/chat`), the prefixed surface at
`/chat/` and on the gateway is fully healthy, but every *pre-cutover* address
broke: `/` and old deep links render empty (item 7), the emailed
`/api/followups/open/<id>` links 404 (item 8), the OAuth callback registered
at Google 404s (registration 1 — login was down entirely), and Apollo's
webhook address 404s (registration 2).

Three changes, all dark by construction and pinned by tests:

1. **Client**: `outOfBaseRedirectTarget()` added to `basePath.ts` (both
   copies, byte-identical, md5-verified; 6 new shared tests, 18/18 pass in
   each artifact) and called from `main.tsx` before mount —
   `location.replace()` onto the same path under the base. Fixes item 7 for
   `/` and every stale deep link.
2. **Server**: 308 method/query-preserving redirect `/api/*` →
   `API_BASE_PATH/*`, mounted after the platform health router, gated on
   `IS_PREFIXED`. Fixes item 8 (emailed links) and registration 1 (OAuth
   callback — the token exchange still sends the registered URI, so the
   Google console is untouched).
3. **Server**: legacy first-class mount of the Apollo webhook router at the
   unprefixed address, before `express.json` (raw-body HMAC), gated on
   `IS_PREFIXED`. Fixes registration 2 without trusting POST
   redirect-following.

Audit: typecheck clean both artifacts; lit run on `:8123` (health direct 200,
legacy 308s carry query+method, webhook byte-identical on both mounts,
prefixed surface unchanged, `/apiary` and non-prefix paths untouched); dark
run on `:8124` (zero redirects, no SPA mount, `/chat` 404s — rollback
intact); lit dashboard build carries the redirect, dark build restored in the
tree. Open-redirect review: both redirect targets are same-origin by
construction (normalized base/API mount first, request-controlled suffix
after). **Not deployed by this change — republish to take effect.** Cleaner
end state, later: re-register the prefixed OAuth URI and update
`GOOGLE_OAUTH_REDIRECT_URI`, re-point Apollo's webhook URL, then retire the
legacy webhook mount.

### 2026-07-31 — Cutover prep CP1: three sibling-app findings (CLOSED, ritual clean)

Branch: `cutover-cp1-prep`. Ordered scope: the bundles in this repo predate
three findings made later on sibling apps. Apply all three, each dark by
construction — (1) the platform startup health check must answer regardless of
`BASE_PATH`, because unsetting the env vars is the rollback and the rolled-back
state must stay healthy; (2) the dashboard's `BASE_PATH` must not be pinned in
`artifact.toml` or the deployment environment can never set it; (3) the
dashboard's build config stamps `BASE_PATH` into asset URLs unvalidated, which
is a script-injection path.

**LINEAGE CHECK (before any edit)**

- **Git.** Working tree clean. `HEAD` = `main` = `4d28466`, which descends from
  `snapshot-2026-07-30`. All four prior branches (`bundle-1-url-centralization`,
  `bundle-2-base-path`, `maintenance-m1-db-drift`, `cutover-c1-artifact-routing`)
  are ancestors of `main`. `origin/main` is one commit behind at `564ee85` — the
  Replit deployment commit `4d28466` ("Published your App", `.replit` +
  `CLAUDE_CODE_BUNDLE2.md`) was never pushed. CP1's push will carry it.
- **C1's change survived that deployment commit.** `artifacts/api-server/.replit-artifact/artifact.toml`
  still reads `paths = ["/api", "/chat"]`. The system-managed-file risk C1
  recorded has not fired.
- **Bundle 2's invariants hold.** `basePath.ts` and `basePath.test.ts` are still
  byte-identical between the two artifacts (`diff` empty in both cases), and
  `routes/spa.ts` / `dashboard/src/lib/config.ts` are present.
- **The Bundle 1/2 baseline process is GONE.** Those bundles diffed against
  pid 373, which had pre-Bundle-1 code in memory. This workspace restarted at
  2026-07-31 18:37; the api-server now running on `:8080` (pid 362) was built
  from `main` at boot. It is therefore a valid **`main` baseline** — which is
  exactly what CP1's dark run must match — but it is no longer a pre-Bundle-1
  baseline, and nothing in this workspace can produce one again. The 17-probe
  transcript was re-recorded from it before any edit and is the recorded
  baseline for this order.
- **Migration lineage** (open item 5) is untouched and still deferred. This
  order goes nowhere near `lib/db`.
- **Env lineage.** The running api-server has `BASE_PATH` and `PUBLIC_URL`
  unset (`APP_PUBLIC_URL` only) — dark. The running dashboard Vite server has
  `BASE_PATH=/` injected from its `artifact.toml`, which is the pin step 4
  removes.

**BLAST RADIUS (written before any edit)**

Files to be touched (9):

- `artifacts/api-server/src/app.ts` — mount the health router a second time, at
  the literal unprefixed API base
- `artifacts/api-server/src/lib/appConfig.ts` — the literal-base constant, tied
  by comment to `artifact.toml`'s health path
- `artifacts/api-server/src/lib/basePath.ts` — harden `normalizeBasePath`
- `artifacts/dashboard/src/lib/basePath.ts` — the byte-identical mirror
- `artifacts/api-server/src/lib/basePath.test.ts` — pin the hardened behavior
- `artifacts/dashboard/src/lib/basePath.test.ts` — the byte-identical mirror
- `artifacts/dashboard/vite.config.ts` — default `BASE_PATH` to `/` when unset;
  resolve `base` through the shared validator instead of stamping it verbatim
- `artifacts/dashboard/.replit-artifact/artifact.toml` — delete the single line
  `BASE_PATH = "/"` from the unscoped `[services.env]`
- `TODO.md` — this entry

Files deliberately NOT touched: `artifacts/api-server/.replit-artifact/artifact.toml`
(step 2 is **already satisfied** — C1 made `paths = ["/api", "/chat"]`, so the
additive claim exists and re-editing it would violate "change nothing else");
its `[services.production.health.startup] path = "/api/healthz"` (step 3 says
leave it); `artifacts/mockup-sandbox/.replit-artifact/artifact.toml` and its
`vite.config.ts` (a different artifact, out of scope — see the finding below);
every generated file, `lib/api-spec/orval.config.ts`, `lib/db`, migrations,
secrets, `.replit`, `pnpm-lock.yaml`, `package.json`.

*One deliberate widening of step 5, stated up front.* Step 5 asks for the
server's `normalizeBasePath` validation to be mirrored into the vite config.
It is instead **imported** into it — `vite.config.ts` calls the same
`src/lib/basePath.ts` the app uses — and the hardening lands in that shared
module rather than in a private copy inside the build config. Reason: a
hardened copy in `vite.config.ts` beside an unhardened original in
`basePath.ts` would mean the build and the server disagree about what the base
*is* (the build would resolve `//evil.example/` to `/`, the server to
`/evil.example`), which is precisely the drift Bundle 2's byte-identical-copy
design exists to prevent. The consequence is that the server's resolution is
hardened too, which additionally closes a same-class defect on the server side:
`normalizeBasePath` collapses `//` but does nothing about a backslash, so
`BASE_PATH=/\evil.example` made `appPath("/login")` return `/\evil.example/login`,
which browsers fold to `//evil.example/login` — an open redirect off this
origin, in the same `res.redirect` call the Bundle 1 audit hardened against
`//`. Dark by construction either way: only values that are already broken
change.

Behaviors affected:

- **Health.** `/api/health` and `/api/healthz` gain a second, unconditional
  mount at the literal `/api`. At the default base the existing `/api` mount is
  registered first and answers, so the new mount is unreachable and dark is
  byte-identical. Under a prefix it is the only thing answering the platform's
  configured startup path.
- **Base-path resolution, both artifacts.** Hostile values now resolve to `/`
  instead of to a normalized-but-retained path. Every legitimate value — unset,
  `/`, `/chat`, `/chat/`, `chat`, `/tools/chat`, `/__mockup` — resolves exactly
  as it does today.
- **Dashboard build and dev server.** `BASE_PATH` becomes optional with the
  code default `/`. Removing the `artifact.toml` pin means the value flows from
  the deployment environment; it is unset there today, so both the dev service
  and the production build resolve to `/` — the same value the pin supplied.

Worst realistic failure, in four flavors:

- (a) **The dashboard artifact edit lands while `vite.config.ts` still throws on
  an unset `BASE_PATH`** (open item 4). The artifact tooling picked C1's
  `artifact.toml` change up live with no restart; if it restarts the dashboard
  service on this one, Vite would fail at config load and the workspace's `/`
  would go down. Mitigated by ordering: the vite default lands first and is
  proved by a build before the pin is removed.
- (b) **The hardened validator rejects a legitimate base.** `/chat` resolving to
  `/` would stamp `/assets/…` into an `index.html` served at `/chat/`, so every
  asset 404s and the cutover is a white page. Mitigated by the ordered build
  matrix (step 6) and by unit tests in both artifacts.
- (c) **The second health mount shadows a live route in dark mode.** Mitigated
  by mounting it *after* the main API router — so at the default base it is
  never reached — and proved by the byte-identical dark smoke.
- (d) **`artifact.toml` is system-managed** (`replit.md`: routing is "handled by
  the artifact tooling, not by hand"). The tooling may rewrite or revert the
  dashboard file exactly as C1 recorded for the api-server file. Recorded, not
  defended against; re-check both files immediately before cutover.

Rollback path: git branch `cutover-cp1-prep`; `main` untouched until the ritual
closes clean, `snapshot-2026-07-30` behind it. Nothing deployed, restarted or
published; no secret written; the running workflow is never touched — every
boot is on a free port from an entry point that starts no scheduler.

**WHAT SHIPPED — 9 files predicted, 9 files touched. The blast radius held
exactly.** No dependency added (`pnpm-lock.yaml` unchanged), no generated file,
no orval config, no `lib/` file, no migration, no secret, no `.replit`, no
`package.json`.

*Step 2 — artifact routing. Already satisfied; nothing changed.* C1 made
`paths = ["/api", "/chat"]` and the lineage check confirms it survived the
`4d28466` deployment commit. The order asked for the prefix to be added
additively so the array becomes `["/api", "/chat"]`; it is already exactly
that, so the correct action was to verify and stop. `git diff` on
`artifacts/api-server/.replit-artifact/artifact.toml` is **empty**.

*Step 3 — the platform health check.* `artifact.toml` does declare a startup
health path, at the literal `/api/healthz`
(`[services.production.health.startup]`), and it is the only one in the repo.
That literal cannot move with `BASE_PATH`, but `API_BASE_PATH` does — so a
prefixed deployment would have failed its own startup probe, and the
rolled-back state had to keep passing it too. One line in `app.ts` mounts the
**same `healthRouter`, the same `ok` handler** at a new
`PLATFORM_API_BASE_PATH = "/api"` constant in `appConfig.ts`, tied by comment
to the TOML. `artifact.toml`'s health path is untouched, as ordered.

The mount is unconditional but **not** a dark-mode behavior change, and the
mechanism is the mount order rather than a flag: it sits *after*
`app.use(API_BASE_PATH, router)`, so at the default base the two mount points
are the same string, the router registered first answers, and this line is
never reached. Gating it on `IS_PREFIXED` was rejected on purpose — it would
put the health of a deployment back under the control of the one variable it
exists to be independent of.

*Step 4 — the dashboard BASE_PATH pin.* It was there:
`[services.env] BASE_PATH = "/"`, unscoped, which always beats the deployment
environment, so setting `BASE_PATH` on the deployment could never have reached
the dashboard build. Removed — one line, `git diff --numstat` reads `0 1`.
`PORT = "23183"` stays. The value now flows from the environment, where it is
unset today, so the build resolves to `/` exactly as the pin supplied.

*Step 5 — build-config hardening.* `vite.config.ts` now **imports** the app's
own `normalizeBasePath` from `./src/lib/basePath` instead of carrying a copy,
and the hardening lands in that shared module (the widening declared in the
blast radius above). It also stops requiring `BASE_PATH`, defaulting to `/`,
which is what makes step 4 safe. A rejected value logs a warning rather than
failing the build — falling back to the root is the safe outcome, and failing
the build would turn a bad env var into an outage.

The hardening rejects, in `isUnsafeBasePath`: any scheme (`javascript:`,
`https:`, `data:`), any leading `//` at any depth, a backslash anywhere (a
browser folds `\` into `/`, so `/\evil.example/` *is* `//evil.example/` by the
time it is resolved — the case the old slash-collapsing missed entirely), and
anything outside an allowlist of plain path segments, which is what rejects
queries, fragments, percent-escapes, whitespace, control characters and dot
segments. Rejection resolves to `/`.

**The defect was real, and was proved rather than assumed.** Building the
dashboard with `main`'s `vite.config.ts` and `BASE_PATH=//evil.example/` emits

```
<script type="module" crossorigin src="//evil.example/assets/index-Docq07-G.js"></script>
<link rel="stylesheet" crossorigin href="//evil.example/assets/index-BQ1Hep_e.css">
<link rel="icon" type="image/svg+xml" href="//evil.example/favicon.svg" />
```

— an attacker's origin in `<script src>` in a static file, executing on every
page load for every user. With CP1's config the same value emits `/assets/…`.

**BUILD MATRIX (step 6) — 8 builds, all as ordered**

`tree_hash` below is the sha256 of the sorted sha256 of every emitted file, so
it compares the whole `dist/public` tree, not just index.html.

| BASE_PATH | index.html references | tree hash |
|---|---|---|
| *unset* | `/assets/…`, `/favicon.svg` | `51b5f13e…` |
| `/chat/` | `/chat/assets/…`, `/chat/favicon.svg` | `57428bd4…` |
| `//evil.example/` | `/assets/…` | `51b5f13e…` |
| `///evil.example/` | `/assets/…` | `51b5f13e…` |
| `/\evil.example/` | `/assets/…` | `51b5f13e…` |
| `https://evil.example/` | `/assets/…` | `51b5f13e…` |
| `javascript:x` | `/assets/…` | `51b5f13e…` |
| *unset*, rebuilt | `/assets/…` | `51b5f13e…` |

**Every hostile value produces a build byte-identical to the unset state**, and
the unset build is reproducible. Each hostile build emitted the warning; the
two legitimate builds emitted none. No output file in any hostile build
contains the string `evil.example` or `javascript:x`. The LIT bundle carries
exactly one `/chat`, and it is the `createPathResolvers("/chat/")` call Vite
inlined from `import.meta.env.BASE_URL`; the dark bundle carries zero.

**GATES — all three pass**

- Typecheck (`pnpm run typecheck`) — **PASS**, 4 projects.
- Tests (`pnpm -r --if-present run test`) — **PASS, 38/38** across 4 packages,
  up from 34. The four new ones are two per artifact copy: every named hostile
  value plus 15 neighbouring spellings must resolve to the root, and a
  legitimate-value list (`/chat`, `chat`, `/chat/`, `/tools/chat`, `/__mockup`,
  `/v1.0`, `/a_b~c.d-e`, …) that must never be rejected — the darkness rule's
  other half, since a wrongly-rejected `/chat` would stamp `/assets/…` into an
  index.html served under a prefix and 404 every asset.
- Build — **PASS** both as `PORT=23183 BASE_PATH=/ pnpm run build` (the
  documented invocation) and, now, with `BASE_PATH` unset entirely.

**GODLIKE AUDIT — 5 rounds, closed on two consecutive clean rounds**

- Round 1 (technical / security / end-user): **2 in-scope findings, both fixed,
  both quality rather than behavior.** The warning condition in `vite.config.ts`
  tested `rawBasePath.trim()` twice inline and read as an unrelated triple
  condition; hoisted to a named `trimmedBasePath` and reordered so the
  "rejected" clause reads last. And `PLATFORM_API_BASE_PATH` was declared
  without the `: string` annotation every other export in `appConfig.ts`
  carries. Re-verified after both: the emitted build tree hash is unchanged
  (`51b5f13e…`), and the dark smoke re-diffed empty.
- Round 2 (invariants and scope boundaries): clean in scope. Both `basePath.ts`
  copies and both `basePath.test.ts` copies are still byte-identical after
  every edit; `lib/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`,
  `.replit`, `replit.md`, the api-server's `.replit-artifact/`, the whole
  `mockup-sandbox` artifact, both artifact `package.json`s and
  `dashboard/index.html` are all untouched. **One out-of-scope finding** (open
  item 8, the unprefixed `/api` surface under a prefix).
- Round 3 (full sweep): clean in scope. Every `BASE_PATH` read in both
  in-scope artifacts goes through `createPathResolvers`, including `spa.ts`,
  which takes the already-normalized value from `appConfig`. Only one platform
  health path is declared anywhere in the repo, and it is the one step 3
  handled. **One out-of-scope finding** (open item 9, mockup-sandbox).
- Round 4 (the emitted artifacts, and hostile input at *runtime* rather than
  build time): **clean, and one caveat closed rather than carried.** The dark
  `dist` contains zero `/chat` strings, zero `//` malformations and zero
  `evil.example`. Then the built server was booted with
  `BASE_PATH=//evil.example` and its 17-probe transcript **diffed empty against
  the dark baseline** — 17/17. Before CP1 that value resolved to
  `/evil.example`, which mounted `express.static` at `/evil.example`, scoped
  the session cookie there and put the string into every redirect. It now logs
  no SPA mount at all and is indistinguishable from an unset `BASE_PATH`.
- Round 5 (final read-through): clean. Exactly the 9 predicted files modified,
  no untracked file anywhere, both copies still identical, mount order correct
  (`PLATFORM_API_BASE_PATH` after the API router, before `mountSpa`), all three
  workflow processes still at their original start times and healthy.

**SMOKE — two runs, on free ports, from an entry point that starts no
scheduler**

*The recorded baseline.* Per the lineage check, the Bundle 1/2 baseline process
is gone; the api-server running on `:8080` (pid 362, started 18:37:46) was
built from `main` at workspace boot, with `BASE_PATH` and `PUBLIC_URL` unset.
It is a `main` baseline, which is what a dark run has to match. Its 17-probe
transcript — status, content-type, Location, Set-Cookie and body per probe,
with the OAuth `state` nonce and signed tokens redacted — was recorded **before
any edit** and is the reference for everything below.

*DARK RUN (`BASE_PATH` and `PUBLIC_URL` unset), `:8123` — 17/17
byte-identical.* The transcript **diffed empty**, twice: once on the first
build and again after the round-1 fixes. `/api/healthz` and `/api/health` 200
`{"status":"ok"}`, `/api/auth/me` 401, `GET /api/auth/logout` → `302 /login`
with `cf_session=; Path=/`, OAuth `redirect_uri` still
`https://chat-followuper.replit.app/api/auth/google/callback`, follow-up open →
`https://chat-followuper.replit.app/followup/whatsapp`. No "Serving dashboard
under base path" line, so the SPA is still inert. Seven extra probes
(`/chat`, `/chat/`, `/chat/login`, `/chat/api/healthz`, `/chat/assets/x.js`,
`/api/HEALTHZ`, an unknown path) return the same status on the baseline and on
CP1 — the new health mount is genuinely unreachable at the default base.

*LIT RUN (`BASE_PATH=/chat/`, `PUBLIC_URL=https://tools.mobupps.net/chat`, set
for the spawned process only, never written to Replit Secrets; the prefixed
dashboard build supplied through `DASHBOARD_DIST_DIR` so the repo's `dist`
stayed dark throughout) — 49/49 assertions pass, twice.*

- **Zero asset 404s.** All three rooted references in the served index.html
  (`/chat/favicon.svg`, `/chat/assets/index-BMxKci97.js`,
  `/chat/assets/index-BQ1Hep_e.css`) return 200, all are under `/chat/`, none
  is protocol-relative.
- **Prefixed API calls.** `/chat/api/{auth/me,prospects,followups,campaigns,
  users/me/sequence-config,admin/whoami}` all answer `401
  {"error":"not_authenticated"}`, byte-identical to their dark counterparts;
  the Apollo webhook answers `401 {"error":"invalid_signature"}`. The
  17-probe run under the prefix matches the dark baseline status-for-status on
  16 of 17 — the seventeenth is the app root, `404` dark and `302 → /chat/` lit,
  which is the bare-prefix redirect working.
- **Health on both forms.** `/chat/api/healthz`, `/chat/api/health`,
  `/api/healthz` and `/api/health` all return `200 {"status":"ok"}`, and the
  unprefixed one is JSON rather than the SPA shell. This is the finding-1
  behavior, and it is the only thing on the unprefixed `/api` that still
  answers — see open item 8.
- **Exactly one prefix in generated URLs.** Probed through the real config
  module, bundled with the artifact's own esbuild and run under the cutover
  env: digest link
  `https://tools.mobupps.net/chat/api/followups/open/7?t=TOKEN` — one `/chat`,
  and identical for **both** spellings of `PUBLIC_URL` (with the prefix and
  origin-only). Follow-up fallback
  `https://tools.mobupps.net/chat/followup/whatsapp` — one `/chat`. Derived
  OAuth redirect URI `https://tools.mobupps.net/chat/api/auth/google/callback`
  — one `/chat`; with `GOOGLE_OAUTH_REDIRECT_URI` set, as in every environment
  today, the registered value still wins untouched. With nothing configured it
  throws the original message. `PLATFORM_API_BASE_PATH` stays `/api` in every
  mode.
- **Deep links, cookie, redirects.** Six deep links hard-load through the
  catch-all; `/chat` → `/chat/` in one hop and carries the query string;
  logout redirects to `/chat/login` and clears `cf_session` at `Path=/chat`
  with every `Path=/` header being a deletion; no value-carrying cookie is
  scoped wider than the base.
- **Negative surface.** The unprefixed app (`/`, `/login`, `/prospects`,
  `/assets/…`, `/favicon.svg`) is not served. Path traversal out of the static
  root (`/chat/../package.json`, `%2e%2e`, a four-level climb) leaks no file.

**One deviation from the order's wording, stated plainly.** Step 8 asks for a
"JSON 404 on unknown API paths". What this app actually returns for an
unmatched API path — dark and lit, before CP1 and after — is Express's default
**HTML** 404 (`text/html`, `Cannot GET …`). What was verified is the property
that matters and that Bundle 2 built for: `/chat/api/<unknown>`,
`/chat/api/`, `/chat/API/<unknown>` and `/api/<unknown>` all return **404 and
are never index.html**, so the client never parses the SPA shell as JSON.
Making it JSON would change the dark response and so could not ship inside a
dark order; recorded as open item 10 instead.

Only the processes this order started were stopped, each identified
individually by its `PORT` in `/proc/<pid>/environ` (`:8123`, `:8124`, `:8125`,
`:8126`). The five pre-existing workflow processes are still at their original
`18:37:43`/`18:37:46` start times — **nothing was restarted, including by the
artifact tooling in response to the `artifact.toml` edit** — and `:8080`,
`:23183` and `:8081` were verified healthy afterwards. The repo's
`dist/public` was left in the dark state (`/assets/…`). Nothing was deployed,
restarted or published; no secret was written; the mirror sync script was not
run.

As in Bundle 1 and Bundle 2, the OAuth-start probe inserts one row into
`oauth_nonces` per call. That is the only database write this order caused; it
is ephemeral (10-minute TTL) and no schema, migration or row of business data
was touched.

**Out-of-scope findings recorded: 3** (open items 8, 9, 10). Open item 4 is
now partly resolved and open item 7's mechanism is corrected.

**CLOSE-OUT — merged locally, PUSH BLOCKED, and the reason is environmental.**
`cutover-cp1-prep` is committed and merged into `main` with `--no-ff`, matching
every prior bundle. **Neither branch reached `origin`.** Both pushes failed
with `remote: Invalid username or token. Password authentication is not
supported for Git operations.` There is no GitHub credential in this
workspace right now: `gh auth status` reports not logged in, there is no
`credential.helper` configured, and no token is present in the environment.
This is not a repo problem and nothing about the work is in doubt — the
prior bundles pushed successfully, so the credential was present in earlier
sessions and is not present after this workspace's 18:37 restart. Recovery
is `gh auth login` (or reconnecting the Replit Git pane), then
`git push origin cutover-cp1-prep && git push origin main`. Note that the
push will carry three commits, not two: `4d28466` ("Published your App", the
Replit deployment commit that added `.replit` and `CLAUDE_CODE_BUNDLE2.md`)
has been sitting unpushed on `main` since before this order started. The
`gitsafe-backup` remote is reachable, but nothing was pushed there — the order
said `origin`, and mirroring the work to a different remote is not the same
action.

### 2026-07-30 — Cutover prep C1: artifact routing for the prefix (CLOSED, ritual clean)

Branch: `cutover-c1-artifact-routing`. Ordered scope: resolve open item 6 by
changing one line in the api-server's artifact.toml, additively, so the
artifact router will match `/chat` as well as `/api`. Nothing else in that
file or any other file. Halt if the change would be anything beyond that line.

**BLAST RADIUS (written before any edit)**

Files to be touched (2): `artifacts/api-server/.replit-artifact/artifact.toml`
— the single line `paths = ["/api"]` becomes `paths = ["/api", "/chat"]` — and
`TODO.md` for this entry, the item 6/7 updates and the ledger. No source file,
no config module, no dependency, no schema, no secret.

Behaviors affected: **routing only, and only for paths that nothing serves
today.** `/api` keeps matching first and unchanged, so every request the app
currently receives is routed exactly as before. The addition makes the router
also hand `/chat` and everything under it to the api-server process, which —
with `BASE_PATH` unset, as it is everywhere today — answers 404 for all of it,
because Bundle 2's SPA mount is inert at the default base. So the observable
change with the env unset is: `/chat/*` moves from whatever the dashboard's
static service returns to an api-server 404. Nothing in the app links to
`/chat`, so no user path reaches it.

Worst realistic failure: this is a system-managed file (`replit.md`: artifact
routing is "handled by the artifact tooling, not by hand"). A malformed edit
could make the artifact fail to parse, which would stop the api-server from
being routed **at all** — the whole API down, not just `/chat`. The mitigation
is that the edit is one array literal, gated behind a TOML parse check, a diff
review proving exactly one changed line, and a dark smoke on the running
services. A second, slower risk: the tooling may rewrite or revert this file
on its own schedule, in which case the change silently disappears and the
cutover fails later rather than now. Recorded rather than defended against.

Not defended against and out of scope: whether Replit's router treats a second
entry in `paths` the way this assumes. That is only observable in a deployed
environment, and nothing is deployed here. This order makes the declaration;
the cutover verifies it.

Rollback path: git branch `cutover-c1-artifact-routing`; `main` untouched until
the ritual closes clean, `snapshot-2026-07-30` behind it. Reverting is the
same one-line edit backwards. Nothing deployed, restarted, or published.

**WHAT SHIPPED**

Two files, and the change itself is one line:

```
-paths = ["/api"]
+paths = ["/api", "/chat"]
```

`git diff --numstat` on that file reads `1 1` — one insertion, one deletion,
nothing else in it. `TODO.md` carries this entry plus the item 6 and item 7
updates the order asked for. No source file, no config module, no dependency,
no schema, no secret. The blast radius held exactly: **2 files predicted, 2
files touched.**

Per step 3, the dashboard artifact was **not** touched: it keeps
`paths = ["/"]`, `serve = "static"` and its `/*` → `/index.html` rewrite.
Retiring it is deferred, and the consequence of leaving it — the app being
reachable at both `/` and `/chat` on the origin once `BASE_PATH` is set, with
only the prefixed one correct — is written up on item 7, along with the note
that this is exactly what keeps rollback instant.

**GATES — all three pass, unchanged from Bundle 2**

- Typecheck — **PASS**, 4 projects.
- Tests — **PASS, 34/34** across 4 packages.
- Build — **PASS** (`PORT=23183 BASE_PATH=/ pnpm run build`, 2218 modules).

Worth stating plainly: artifact.toml is not compiled into anything, so these
gates cannot fail because of this change. They were run to prove the tree is
still clean, not because they exercise the edit.

**GODLIKE AUDIT — 3 rounds, closed clean, no findings**

- Round 1 (technical / security / end-user): no defects. The diff is one line;
  the file still parses as TOML with every other key intact (`localPort`,
  `previewPath`, `id`, the production run args, the `/api/healthz` startup
  health path); the other two artifact.toml files are untouched and still
  parse. Security: the new claim adds no handler — with `BASE_PATH` unset,
  `/chat`, `/chat/`, `/chat/login`, `/chat/api/healthz` and `/chat/assets/x.js`
  all return a bare Express 404, because Bundle 2's SPA mount is inert at the
  default base. End-user: the dashboard has **no `/chat` route** (all 14
  routes enumerated), and every `/chat` string in either artifact's source is
  a comment — so no user-facing path moves.
- Round 2: no defects, and **one caveat resolved rather than carried.** The
  blast radius said the router's handling of a second `paths` entry was only
  observable in a deployed environment. That was wrong in a useful way: the
  workspace's own artifact router picked the change up live, with no restart.
  Evidence, on the proxy at `:80` — `/chat` and `/chat/anything` are answered
  by the api-server (`X-Powered-By: Express`, 404), while the controls
  `/chatter`, `/chat.html` and `/login` still reach Vite with 200. The router
  therefore honours the second entry, matches whole path segments rather than
  a raw string prefix, and lets `/chat` win over the dashboard's `/`. That is
  the behavior Bundle 2 was built against. Item 6 updated to say so, with the
  honest limit: the production router is a separate code path from the
  development one, so this is strong evidence, not proof for production.
- Round 3: clean. Re-verified the two-file diff, the one-line numstat, all
  three artifact.toml files parsing, the gates still green, and all three
  services healthy through the router (`/api/healthz`, `/`, `/__mockup` → 200).

**SMOKE — dark, env unset — 17/17 byte-identical**

The api-server was booted on a free port with no env set and probed against
the still-running pre-change workflow process (pid 373, started 21:03:43,
pre-Bundle-1 code in memory), the same baseline Bundle 1 and Bundle 2 used.
The full 17-probe transcript — status, content-type, Location, Set-Cookie and
body — **diffed empty**. No "Serving dashboard under base path" line, so the
SPA mount is still inert. `/api/healthz` 200, `/api/health` 200,
`/api/auth/me` 401 — the paths that must keep working are untouched.

Only the process this order started was stopped, identified by its `PORT` in
`/proc/<pid>/environ`. The three pre-existing workflows were left running and
verified healthy afterwards (:8080, :23183, :8081 all 200). Nothing was
deployed, restarted or published; no secret was written.

**Out-of-scope findings recorded: 0.** Open item 6 is now resolved for the
api-server half, with one production-side check carried to cutover; open
item 7 is decided (deferred) rather than resolved.

### 2026-07-30 — Bundle 2: switchable base path (CLOSED, ritual clean)

Branch: `bundle-2-base-path`. Scope: make the app fully servable under a URL
prefix, controlled entirely by `BASE_PATH` and `PUBLIC_URL`. THE DARKNESS
RULE: with both unset, behavior is byte-for-byte identical to today; every
change activates only when `BASE_PATH` is something other than `/`.

**BLAST RADIUS (written before any edit)**

*Architecture finding that preceded the blast radius, and the decision taken.*
Scope item 3 asks for "the SPA catch-all serving index.html for deep links
under the prefix". **No such catch-all exists in application code.** The
api-server mounts only `/api` (`app.ts:44-51`); the dashboard is served by
Replit's artifact router — `artifacts/dashboard/.replit-artifact/artifact.toml`
declares `serve = "static"` with a `publicDir` and a `/*` → `/index.html`
rewrite, at `paths = ["/"]`. `replit.md` states artifact.toml routing is
"handled by the artifact tooling, not by hand". The sibling `mockup-sandbox`
artifact (`paths = ["/__mockup"]`, `BASE_PATH = "/__mockup"`) proves this
workspace's router **forwards the full path without stripping** — each service
owns its own prefix. Scope item 3's requirement that the bare prefix redirect
to prefix-with-slash independently confirms the app receives `/chat`.
Michael's decision (asked before any edit): **the api-server serves the SPA
under the prefix, gated on `BASE_PATH !== "/"`.** In dark mode nothing mounts.

Files to be touched (14):

NEW

- `artifacts/api-server/src/lib/basePath.ts` — pure, env-free path resolvers
- `artifacts/api-server/src/lib/basePath.test.ts` — `node --test` unit tests
- `artifacts/api-server/src/routes/spa.ts` — prefix-gated SPA serving
- `artifacts/dashboard/src/lib/basePath.ts` — mirrored pure resolvers
- `artifacts/dashboard/src/lib/basePath.test.ts` — same suite, dashboard copy

MODIFIED

- `artifacts/api-server/src/lib/appConfig.ts` — rebuilt on `basePath.ts`; adds
  `PUBLIC_ORIGIN`, `absoluteApiUrl()`, `googleOAuthRedirectUri()`
- `artifacts/api-server/src/app.ts` — mount the SPA when prefixed
- `artifacts/api-server/src/routes/google-auth.ts` — redirect URI via config
- `artifacts/api-server/src/services/followupDigest.ts` — `absoluteApiUrl()`
- `artifacts/api-server/package.json` — `test` script
- `artifacts/dashboard/src/lib/config.ts` — rebuilt on `basePath.ts`
- `artifacts/dashboard/src/main.tsx` — `setBaseUrl(ROUTER_BASE)` at boot
- `artifacts/dashboard/src/pages/prospect-detail.tsx` — 2 raw `<a href="/…">`
- `artifacts/dashboard/package.json` — `test` script

Explicitly NOT touched: `lib/api-client-react/src/generated/*` and
`lib/api-spec/orval.config.ts` — open item 1 is solved through the existing
`custom-fetch` `setBaseUrl` hook, so **no codegen runs and no generated file
changes**, which also means no orval-driven dependency addition. Also not
touched: any `artifact.toml` (system-managed), database, migrations, secrets,
scheduler timing, `lib/db`, wouter `<Route path>` / `<Link href>` / `navigate()`
targets (already base-relative through the Router base).

Behaviors that could be affected: every dashboard→API call (the generated
client now runs through a mutable module-level base), the AuthGate session
check, Google OAuth start and callback, the session cookie's scope, all four
server-side redirects, the digest email links, the public follow-up open
redirect, and — new surface — static file serving from the api-server process.

Worst realistic failure, in three flavors. (a) `setBaseUrl` is called with a
non-empty value in dark mode, or the generated client fires a request before
`main.tsx` runs: every `/api/...` call becomes `/x/api/...`, AuthGate reads
401, and the whole dashboard renders as logged out. (b) The SPA catch-all is
mounted too early or without excluding the API prefix: an unmatched
`/chat/api/...` returns `200 text/html` instead of a JSON 404, and the client
parses HTML as JSON on every miss. (c) `PUBLIC_URL` already contains the
prefix (`https://tools.mobupps.net/chat`) while `apiPath()` adds it again,
producing `https://tools.mobupps.net/chat/chat/api/...` in digest emails —
dead links inside mail that cannot be recalled. (c) is a live defect in the
Bundle 1 code under non-default values and is fixed here via `PUBLIC_ORIGIN`.

Rollback path: git branch `bundle-2-base-path`; `main` is untouched until the
ritual closes clean, with `snapshot-2026-07-30` behind it. Nothing is
deployed, restarted, published, or written into Replit Secrets. Both smoke
runs set env for the spawned process only.

**BLAST RADIUS DELTA — 14 predicted, 20 touched.** The six extra files all
came out of the audit and are listed here rather than folded silently into the
count above: `artifacts/api-server/tsconfig.json` (needed
`allowImportingTsExtensions` for the Node test runner);
`artifacts/api-server/src/lib/session.ts` and `src/routes/auth.ts` (round-2
cookie finding); `lib/api-client-react/src/custom-fetch.test.ts`,
`package.json` and `tsconfig.json` (round-2 test pin for the cutover blocker).
The stated NOT-touched list held in full: no generated file, no orval config,
no artifact.toml, no `lib/db`, no migration, no secret, no dependency.

**WHAT SHIPPED**

20 files: 6 new, 14 modified. No dependency added anywhere —
`git diff pnpm-lock.yaml` is empty.

*Scope 1 — the generated API client (TODO.md open item 1, the cutover
blocker).* Solved without touching a generated file and without running
codegen. `lib/api-client-react/src/custom-fetch.ts` already exposed
`setBaseUrl()`, which prepends a base to any request path starting with "/";
`artifacts/dashboard/src/main.tsx` now calls `setBaseUrl(ROUTER_BASE)` before
`createRoot`, so no hook can fire a request first. orval's `baseUrl` stays
`"/api"` and the generated literals stay exactly as they are. At the default
base `ROUTER_BASE` is `""`, which `setBaseUrl` stores as `null` — a true
no-op.

*Scope 2 — frontend base.* Verified, not changed: Vite's `base` already flows
from `BASE_PATH`, and the LIT build proves it reaches every emitted reference,
including `/chat/favicon.svg` from the public dir. wouter's `<Link>` and
`navigate()` were re-verified against wouter 3.9.0's source — `href` is
`router.base + to` (`src/index.js:303`) and navigation goes through
`absolutePath(to, router.base)` (`:77`) — so Bundle 1's "leave them alone"
decision holds under a non-default base. One real gap found and fixed:
`pages/prospect-detail.tsx` had two raw `<a href="/prospects">` elements whose
`onClick` calls `navigate()`. A plain click never uses the href, but
middle-click, ctrl-click, "open in new tab" and "copy link address" do, and
those would have 404'd under a prefix. Now `appPath("/prospects")`.

*Scope 3 — backend under prefix.* New `artifacts/api-server/src/routes/spa.ts`,
mounted last in `app.ts` and inert unless `BASE_PATH` is set: a bare-prefix →
prefix-with-slash redirect, `express.static` over the built dashboard, and an
index.html catch-all for deep links. It refuses anything under
`API_BASE_PATH`, so a missed API path still answers a JSON 404 instead of
handing the client HTML to parse. A missing dashboard build logs an error and
leaves the API serving rather than failing to boot.

*Scope 4 — redirects.* Already prefix-aware from Bundle 1; verified in the LIT
run (`/chat/api/auth/logout` → `/chat/login`, post-login → `/chat`, follow-up
fallback → `https://tools.mobupps.net/chat/followup/whatsapp`).

*Scope 5 — cookies.* The cookie name needed no change: it has been
`cf_session` since Ticket 1.3, so the per-app name the roadmap asks for was
already in place. The scope already flowed from `COOKIE_PATH = appPath("/")`.
Verified exactly equal to `BASE_PATH` in every mode — `/` dark, `/chat` lit,
`/tools/chat` nested — and never wider. One defect found and fixed in audit
round 2 (below).

*Scope 6 — outgoing links and registrations.* Nothing registered anywhere was
changed. Two fixes: (a) **a live defect in the Bundle 1 code under non-default
values** — `followupDigest.ts` composed `PUBLIC_URL + apiPath(...)`, so the
cutover's `PUBLIC_URL=https://tools.mobupps.net/chat` would have produced
`https://tools.mobupps.net/chat/chat/api/...` in digest emails, dead links
inside mail that cannot be recalled. Fixed with `PUBLIC_ORIGIN`, which strips
a prefix `PUBLIC_URL` already carries, so both spellings of `PUBLIC_URL`
resolve identically. (b) The Google OAuth redirect URI now derives from
`PUBLIC_URL` — but `GOOGLE_OAUTH_REDIRECT_URI` still wins wherever it is set,
which is every environment today, so the registered value is never
second-guessed and this is dark by construction. With neither available it
throws the same message `getEnv` threw.

New surface in `appConfig.ts`: `IS_PREFIXED`, `PUBLIC_ORIGIN`,
`absoluteApiUrl()`, `googleOAuthRedirectUri()`. The path arithmetic moved out
of both config modules into `basePath.ts`, which is **byte-identical between
the two artifacts** (`diff` is empty) and carries no env access at all, so it
is unit-testable under a plain `node --test`.

**GATES — all three pass**

- Typecheck (`pnpm run typecheck`) — **PASS**, all 4 projects.
- Tests (`pnpm -r --if-present run test`) — **PASS, 34/34** across 4 packages.
  This is the first bundle with a green test gate from the start.
  `lib/db` 3 (pre-existing, fixed by M1), and **31 new**: 12 in
  `artifacts/api-server`, 12 in `artifacts/dashboard` (the same byte-identical
  suite, one copy per artifact, so the two copies cannot drift), 7 in
  `lib/api-client-react`. All run on Node 24's built-in test runner with
  native TypeScript stripping — **no test framework and no dependency was
  added**. The suites pin both modes: a DARK block asserting every resolved
  value is today's literal, a LIT block asserting the prefix appears exactly
  once, the cookie scope, the open-redirect guard, and the exact generated
  URL literals the API client emits.
- Build (`PORT=23183 BASE_PATH=/ pnpm run build`) — **PASS** (api-server
  esbuild + dashboard vite, 2218 modules; 2217 before, +1 for `basePath.ts`).
  Also built clean under `BASE_PATH=/chat/`.

**GODLIKE AUDIT — 5 rounds, closed on two consecutive clean rounds**

- Round 1 (technical / security): **2 in-scope findings, both fixed.**
  (a) `app.get(BASE_PATH, …)` also matched `/chat/` — Express runs with
  `strict routing` off — so the main page redirected to itself: **an infinite
  redirect loop on `/chat/`**, caught by the first LIT smoke run. Replaced
  with a middleware doing an exact `req.path` comparison. (b) `isApiPath` was
  case-sensitive while Express matches routes case-insensitively, so a missed
  `/chat/API/...` fell through to the SPA and answered `200 text/html` where
  `/chat/api/...` answered 404 — the same path served two ways depending on
  capitalization. Now compared case-insensitively.
  Security sub-round on the new static surface found **no** defects: path
  traversal (`/chat/../package.json`, `%2e%2e`, `..%2f`, and a four-level
  climb from `/chat/assets/`) all return the SPA shell, never a real file;
  the static root contains only the 5 built assets; `/chatter` and
  `/chat.html` are not captured; non-GET under the prefix 404s.
- Round 2 (end-user): **2 in-scope findings, both fixed.**
  (a) The bare-prefix redirect dropped the query string. The post-login
  redirect targets `appPath("/")` — the bare prefix — and the login page reads
  `?error=` off `window.location`, so OAuth error codes would have been
  silently swallowed and shown as a blank login form. The query is now
  carried across. (b) **Logout did not log you out under a prefix.** A cookie
  is identified by name *and* path, so clearing `cf_session` at `/chat` does
  nothing to a `cf_session` left at `/` by the pre-move app on the same
  origin; the browser offers the more specific one first, so once `/chat` was
  cleared the leftover at `/` became the one read and the user was silently
  signed back in on the next request. Logout now clears every path the cookie
  could have been issued under. At the default base that list is exactly
  `["/"]`, so the emitted header is unchanged — verified byte-for-byte.
- Round 3 (re-verification): **1 finding, in the smoke harness, not the code.**
  A LIT assertion said "no cookie is scoped to /", which the round-2 fix now
  deliberately contradicts. Re-expressed as what actually matters: any `Path=/`
  header must be a *deletion* (empty value, epoch expiry), and no
  value-carrying cookie may be scoped wider than `BASE_PATH`. The issued
  cookie was then probed directly through the real `sessionCookieOptions()`
  and is exactly `BASE_PATH` in all three modes tested.
- Round 4: clean. Verified the scope boundaries held (`lib/db`, `lib/api-spec`,
  the generated client, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.replit` and
  every `artifact.toml` all unchanged), the two `basePath.ts` copies are still
  byte-identical after every edit, and the *emitted* dark artifacts are right:
  `index.html` back to `/assets/…` and `/favicon.svg`, zero `//` malformations,
  zero `/chat` strings in a dark bundle.
- Round 5: clean. Final sweep for any rooted path bypassing the config across
  both artifacts. The only remaining hits are benign — comments, wouter
  `<Link>` (verified against wouter's source), and the two `index.html`
  references Vite rewrites at build time (proved by the LIT build emitting
  `/chat/favicon.svg`).

**SMOKE — two runs, as ordered**

*DARK RUN (env unset) — 17/17 byte-identical.* The still-running workflow
process (pid 373, started 21:03:43, pre-Bundle-1 code in memory) served as a
genuine before-baseline, exactly as in Bundle 1. The new build booted on a
free port and the full 17-probe transcript — status, content-type, Location,
Set-Cookie and body for each — **diffed empty** against it. Re-run three times
across the audit, after each fix, and empty every time. `GET /api/auth/logout`
→ `302 /login`; cookie `cf_session; Path=/`; OAuth `redirect_uri` still
`https://chat-followuper.replit.app/api/auth/google/callback`; follow-up open
→ `https://chat-followuper.replit.app/followup/whatsapp`. The SPA did not
mount (no log line, and `/definitely-not-a-route-xyz` still 404s rather than
returning index.html).

*LIT RUN (`BASE_PATH=/chat/`, `PUBLIC_URL=https://tools.mobupps.net/chat`, set
in the shell for the spawned process only, never written to Replit Secrets) —
35/35 pass.* Main page at `/chat/` 200 html serving the SPA shell; `/chat`
redirects to `/chat/` and settles in one hop; five deep links
(`/chat/login`, `/chat/prospects`, `/chat/prospects/42`,
`/chat/followup/whatsapp`, `/chat/activity`) all hard-load via the catch-all;
**every rooted reference in the served index.html returns 200 and all are
under `/chat/`** — zero 404s; API at `/chat/api/*` answers with bodies
unchanged; the unprefixed origin is correctly not served; an API miss stays a
404 and is never index.html; logout redirects to `/chat/login`; the cookie is
`cf_session` at `Path=/chat`.

Two things the LIT run could not prove by HTTP, proved directly instead:

- *The digest link.* Nothing was sent. The real `appConfig` module was bundled
  with the artifact's own esbuild and run under the cutover env, printing the
  exact string `followupDigest.ts` composes:
  `https://tools.mobupps.net/chat/api/followups/open/7?t=<TOKEN>` — the
  required address, exactly once. Both spellings of `PUBLIC_URL` (with and
  without the prefix) resolve identically; dark reproduces today's
  `https://chat-followuper.replit.app/api/followups/open/7`; with the OAuth
  env var removed the derivation yields
  `https://tools.mobupps.net/chat/api/auth/google/callback`; with nothing
  configured it throws the original message. A hostile `BASE_PATH=//evil.example`
  still collapses to `/evil.example` — the M1-era `normalizeBasePath` guard
  holds, and no resolved value is protocol-relative.
- *The API client.* The real chain — `src/lib/config.ts` → `ROUTER_BASE` →
  `setBaseUrl()` → the orval-generated `getCurrentUser()` → `custom-fetch` —
  was bundled with `import.meta.env.BASE_URL` defined exactly as Vite defines
  it, with `fetch` stubbed to record the URL. Dark emits `/api/auth/me` and
  `/api/healthz`; lit emits `/chat/api/auth/me` and `/chat/api/healthz`. That
  closes open item 1 end to end.

Only the processes this bundle started were stopped, identified individually
by their `PORT` in `/proc/<pid>/environ` rather than by pattern. The three
pre-existing workflows were left running and verified healthy afterwards
(:8080, :23183, :8081 all 200). Nothing was deployed, restarted or published;
the mirror sync script was not run.

Note for the record: the OAuth-start probe inserts one row into
`oauth_nonces` per call, as it did in Bundle 1's smoke. That is the only
database write this bundle caused; it is ephemeral (10-minute TTL) and no
schema, migration or row of business data was touched.

**Out-of-scope findings recorded: 2** (open items 6 and 7). Open item 1 is now
resolved.

### 2026-07-30 — Bundle 1: URL centralization (CLOSED, ritual clean)

Branch: `bundle-1-url-centralization`. Scope: centralize every hardcoded
self-address and rooted path into one config module per artifact, reading
`BASE_PATH` and `PUBLIC_URL` from env with today's values as defaults. Zero
behavior change.

**BLAST RADIUS (written before any edit)**

Files to be touched (17):

- NEW `artifacts/api-server/src/lib/appConfig.ts` — backend config module
- NEW `artifacts/dashboard/src/lib/config.ts` — frontend config module
- `artifacts/api-server/src/app.ts` — 4 `/api` mount points
- `artifacts/api-server/src/lib/session.ts` — 2 cookie `path: "/"` settings
- `artifacts/api-server/src/routes/auth.ts` — 1 `/login` redirect
- `artifacts/api-server/src/routes/google-auth.ts` — `/login?error=` builder + post-login `/` redirect
- `artifacts/api-server/src/routes/followupOpen.ts` — `APP_PUBLIC_URL` read + `/followup/whatsapp` fallback
- `artifacts/api-server/src/services/followupDigest.ts` — `APP_PUBLIC_URL` read + `/api/followups/open/:id` link in outgoing email
- `artifacts/dashboard/src/App.tsx` — wouter router base
- `artifacts/dashboard/src/pages/login.tsx` — `window.location.assign("/api/auth/google/start")`
- `artifacts/dashboard/src/lib/api/{apollo,campaigns,followups,manual-ingest,prospector,prospects,seeder,sequence-config,whatsapp}.ts` — 35 rooted `/api/...` fetch and SSE paths

Explicitly NOT touched: wouter `<Route path>`, `<Link href>` and `navigate()`
targets (already base-relative via the Router base — prefixing them would
double-apply the base); `index.html` asset paths (Vite rewrites them from
`base` at build time); database schema, migrations, secrets, scheduler timing;
`scripts/sync-source-code.sh` (Michael's manual step, not run).

Behaviors that could be affected: dashboard→API calls (every page), Google
OAuth login/callback, session cookie scope, logout, the research SSE stream,
the daily follow-up digest email links, and the public token-authenticated
follow-up open redirect.

Worst realistic failure: a wrong join in the config module changes a resolved
path (e.g. `/api/campaigns` → `//api/campaigns` or `/apicampaigns`), which
would 404 every dashboard API call, break the OAuth redirect, or scope the
session cookie to the wrong path and silently log everyone out. In the digest
path a wrong join would ship dead links inside already-sent emails, which
cannot be recalled.

Rollback path: git branch `bundle-1-url-centralization`. `main` is untouched
until the ritual closes clean; recovery is `git checkout main` (plus
`snapshot-2026-07-30` as the Phase 0 snapshot behind it). No deploy, no
publish, no restart of the deployment happens in this bundle.

Constraint note: the bundle asks for "one config module". A single shared
module would require a new `lib/*` workspace package wired into two
`package.json` files — a dependency addition, which this bundle forbids.
Resolved as one module per artifact (`api-server` + `dashboard`) with a
mirrored API, which is the closest reachable form under the stated rules.

**WHAT SHIPPED**

19 source files: 2 new config modules, 17 files rerouted through them.

- NEW `artifacts/api-server/src/lib/appConfig.ts` — exports `BASE_PATH`,
  `PUBLIC_URL`, `API_BASE_PATH`, `COOKIE_PATH`, `appPath()`, `apiPath()`,
  `requirePublicUrl()`, `absoluteAppUrl()`.
- NEW `artifacts/dashboard/src/lib/config.ts` — mirrored surface, plus
  `ROUTER_BASE` for wouter.

**50 occurrences centralized**, by category:

| Category | Count | Where |
|---|---|---|
| Rooted API paths | 41 | 4 `/api` mounts (`app.ts`), 35 dashboard fetch/SSE paths (`src/lib/api/*.ts`), 1 OAuth-start navigation (`pages/login.tsx`), 1 digest email link (`followupDigest.ts`) |
| App public URL reads | 2 | `followupOpen.ts`, `followupDigest.ts` (both were raw `process.env.APP_PUBLIC_URL`) |
| Server-side redirect targets | 4 | `/login` ×2 (`auth.ts`, `google-auth.ts`), post-login `/` (`google-auth.ts`), `/followup/whatsapp` fallback (`followupOpen.ts`) |
| Cookie path settings | 2 | `sessionCookieOptions`, `clearedSessionCookieOptions` (`lib/session.ts`) |
| Frontend base path | 1 | wouter `<Router base>` (`App.tsx`) |

Env vars introduced, with defaults:

- `BASE_PATH` — default `/`. Server reads `process.env.BASE_PATH`; dashboard
  receives it through Vite's `base` (`import.meta.env.BASE_URL`), which
  `vite.config.ts` already drove off `BASE_PATH`. Neither is set at workspace
  level today, so both resolve to `/`.
- `PUBLIC_URL` — default `""`, falling back to the pre-existing
  `APP_PUBLIC_URL` (currently `https://chat-followuper.replit.app`) when
  unset, so the live deployment is unaffected.
- `VITE_PUBLIC_URL` — default `""`. Dashboard-side counterpart; nothing
  consumes it yet (the dashboard uses only relative paths).

No WebSockets exist in this app (the live progress channel is SSE, centralized
via `buildResearchStreamUrl`). `index.html` asset paths were deliberately left
alone: Vite rewrites them from `base` at build time, so they already flow from
`BASE_PATH`. wouter `<Route path>`, `<Link href>` and `navigate()` targets were
also left alone — they are base-relative already, and prefixing them would
double-apply the base.

**GATES**

- Typecheck (`pnpm run typecheck`) — **PASS** (all 4 projects, re-run after the
  audit fix).
- Build (`PORT=23183 BASE_PATH=/ pnpm run build`) — **PASS** (api-server
  esbuild + dashboard vite, 2217 modules).
- Tests (`pnpm -r --if-present run test`) — **FAIL, pre-existing and
  unrelated.** The only test package in the repo is `lib/db`, which fails on
  `column "microsoft_refresh_token" of relation "users" does not exist`.
  Bundle 1 changed no file under `lib/` (`git diff --stat -- lib/` is empty)
  and ran no migration; the schema declaring that column was last touched in
  `ce8657b`, before this bundle. Not fixable inside this bundle — the hard
  rules forbid touching database schemas and migrations. Recorded as open
  item 2.

**GODLIKE AUDIT — 3 rounds, closed on a fully clean round**

- Round 1 (technical / security / end-user): **1 in-scope finding, fixed.**
  `normalizeBasePath` did not collapse repeated slashes, so a misconfigured
  `BASE_PATH` of `//host` would have made `appPath()` emit `//host/login` — a
  protocol-relative URL, turning the login redirects into an open redirect off
  this origin. Fixed in both config modules. Also recorded 3 out-of-scope
  findings (open items 1–3).
- Round 2: clean. Verified no env-var collision (`PUBLIC_URL` and `BASE_PATH`
  are unset in this environment; `BASE_PATH` appears only inside per-service
  `artifact.toml` blocks, and the `/__mockup` value is scoped to
  mockup-sandbox), and re-read both modules for import-time throws and
  circular imports (none — the modules read env and never throw at load).
- Round 3: clean. Verified the *emitted* artifacts, not just source: the built
  dashboard bundle contains no `//api` malformation, the built `index.html`
  still emits base-driven asset paths, and no WebSocket or mailer self-URL
  surface was missed.

A 50-assertion equivalence harness proved every centralized value resolves
byte-for-byte to its old literal with no env vars set, and behaves correctly
under a `/chat` prefix and hostile input.

**SMOKE**

First run was **invalid and caught**: the smoke server hit `EADDRINUSE` on
:8080 and the responses came from the already-running workflow, not the new
build. Re-run per auto-fix on a free port — which turned the running workflow
(pid 373, started 21:03:43, pre-change code in memory; rebuild landed 21:17:15)
into a genuine before-baseline.

- New build booted clean on :8123 (`Server listening`, no errors).
- **17/17 probes byte-identical** between pre-change and post-change servers:
  health ×2, `/api/auth/me`, GET+POST logout, 3 follow-up-open redirect paths,
  OAuth start (redirect_uri unchanged at
  `https://chat-followuper.replit.app/api/auth/google/callback`), 4 authed
  endpoints, the Apollo webhook, and 3 negative paths.
- `GET /api/auth/logout` → `302 /login`; follow-up open →
  `302 https://chat-followuper.replit.app/followup/whatsapp` — both exactly as
  before.
- Dashboard main page `200 text/html`, deep link `/login` `200`, and Vite
  transforms the new config module with `BASE_URL: "/"`.
- Stopped only the process this bundle started (pid 7439). The pre-existing
  workflows were left running and verified healthy afterwards. Nothing was
  deployed, restarted, or published; the mirror sync script was not run.

**Out-of-scope findings recorded: 4** (see Open items 1–4). Open item 1 is a
blocker for Bundle 2 and should be read before it starts.

### 2026-07-30 — Maintenance M1: resolve test-gate schema drift (HALTED, nothing applied)

Branch: `maintenance-m1-db-drift`. Ordered scope: apply the unapplied `lib/db`
migrations to clear the failing test gate.

**HALTED at step 2 of the order. No backup taken, no migration applied, no
schema touched, no file in `lib/db/` modified.** The order's premise does not
hold: there are no unapplied migrations, and the one operation that *would*
change this database drops columns, which the order says to halt on.

**BLAST RADIUS (written before any action, as ordered)**

Intended action was `pnpm --filter @workspace/db run migrate` (`tsx
src/migrate.ts`) against `DATABASE_URL`. Files that would have been touched:
`TODO.md`, `.gitignore`, plus a new `db-backup-<ts>.dump`. Behaviors at risk:
every read and write in the app, since all eight tables sit behind one
connection pool. Worst realistic failure: a migration that rewrites or drops a
column destroys live prospect, follow-up, and conversation rows, which no code
rollback recovers — only the dump would. Rollback path was to be the pg_dump
from step 4. **None of this was executed; the blast radius stayed at zero.**

**FINDING 1 — there are no unapplied migrations. Applying is a no-op.**

`lib/db/drizzle/` holds 8 migrations (`0000`–`0007`). `drizzle.__drizzle_migrations`
in the live database holds **22 applied rows**. All 8 repo migrations are
already recorded as applied, matched by their journal `when` timestamps:

| journal `when` | repo file | recorded in DB |
|---|---|---|
| 1777568440999 | 0000_worried_the_anarchist | yes (id 1) |
| 1777574535662 | 0001_living_mantis | yes (id 2) |
| 1777585421907 | 0002_broken_toxin | yes (id 3) |
| 1777983720058 | 0003_confused_tarantula | yes (id 4) |
| 1778007718041 | 0004_loud_triton | yes (id 5) |
| 1778339783809 | 0005_early_green_goblin | yes (id 6) |
| 1778532360720 | 0006_extend_stage_timing_with_doctrine_variant | yes (id 7) |
| 1778616545760 | 0007_manual_ingest_columns | yes (id 8) |

Drizzle's migrator selects work by comparing journal timestamps against
`created_at`. All eight are present, so `run migrate` would apply nothing and
the test would keep failing. Step 5 of the order cannot achieve step 6.

**FINDING 2 — two applied migration files were edited after they ran.**

Comparing the sha256 of each repo migration file against the hash recorded when
it was applied:

| file | repo sha256 | recorded sha256 | |
|---|---|---|---|
| 0001_living_mantis | `f4974a208ca34729…` | `7a37ada64acc4660…` | **MISMATCH** |
| 0007_manual_ingest_columns | `3929a1c86eac4b3e…` | `6bddb1c57029709c…` | **MISMATCH** |

The other six match exactly. The repo's copy of 0001 and 0007 is no longer what
ran against this database, so the migration history is not a reliable record of
how this database was built.

**FINDING 3 — 14 migrations were applied that do not exist in this repo.**

Rows 9–22 of `__drizzle_migrations` have no corresponding file anywhere in the
workspace (`find` for `_journal.json` and `drizzle/*.sql` returns only
`lib/db/drizzle`). Rows 9–16 carry suspiciously round `created_at` values
(1778700000000, 1778780000000, 1778860000000, …), which drizzle-kit does not
generate — those look hand-authored or written by a different runner. Rows
17–22 carry realistic timestamps (1783545124180 … 1784106433067).

**FINDING 4 — the two lineages diverge in both directions.**

`users`, repo schema vs live database:

- Declared by the repo, **absent** from the live DB: `microsoft_refresh_token`
  (this is what fails the test), `slack_bot_token`.
- Present in the live DB, **absent** from the repo schema (9): `digest_days`,
  `followups_paused`, `message_template`, `preferred_channel`, `pushover_days`,
  `pushover_hour_local`, `pushover_quiet_hour_end`, `pushover_quiet_hour_start`,
  `pushover_user_key`.

Whole tables:

- Repo schema only: `magic_link_tokens`.
- Live database only: `llm_calls`.

Note `microsoft_refresh_token` is created by `0000_worried_the_anarchist.sql:14`,
whose hash **matches** and which **is** recorded as applied — yet the column is
not there. The live `users` table was rebuilt or altered by something outside
this repo's migration chain. The live database was not built by this lineage.

**Why no reconciliation was attempted:** the only command that would change the
database to match the repo schema is `drizzle-kit push`, which diffs schema
against the live DB. Here that diff necessarily **drops the 9 live-only
columns** (the whole `pushover_*` group among them) and drops `llm_calls`.
That is a destructive, data-losing operation. The order's step 2 says to halt
without applying if anything drops. Halted.

**Gates:** not run — nothing changed, so there is nothing to gate. The test gate
remains failing for the reason above.

**Audit rounds:** none — no diff to audit beyond this ledger entry.

**Smoke:** not run — the app was not touched.

**Out-of-scope findings recorded:** the diagnosis in Open item 2 was corrected
in place; it previously suggested "apply the pending migration", which this
investigation proves impossible.

### 2026-07-30 — Maintenance M1 (resumed): additive-only schema reconciliation (CLOSED, ritual clean)

Branch: `maintenance-m1-db-drift`. Resumed after the halt above, on Michael's
decision to take option 1 (additive-only) plus record-keeping.

**BLAST RADIUS (written before the apply)**

Files touched: `lib/db/drizzle/0008_additive_schema_reconciliation.sql` (new),
`lib/db/drizzle/meta/_journal.json`, `.gitignore`, `.replitignore`, `TODO.md`.
**No application code and no schema source touched** — verified by
`git diff --stat -- artifacts/ lib/db/src/` being empty at close.
Behaviors at risk: every read and write in the app, since one migration runs
against the single live database behind all eight tables. Worst realistic
failure: a statement that rewrites or drops a column destroys live prospect,
follow-up and conversation rows, which no code rollback recovers.
Rollback path: `db-backup-20260730-213332.dump` (pg_dump custom format, 40K,
84 objects, verified readable with `pg_restore --list` before applying), plus
the branch itself for the file changes.

**SCOPE CORRECTION (found before applying)**

The order enumerated three items. The full column-level diff — which the
earlier halt report had not done for `prospects` — showed **five**:

| item | in original order | |
|---|---|---|
| `users.microsoft_refresh_token` | yes | |
| `users.slack_bot_token` | yes | |
| `magic_link_tokens` table | yes | |
| `prospects.teams_email` | **no** | found by the full diff |
| `prospects.slack_user_id` | **no** | found by the full diff |

The two extras were not cosmetic: `db.select().from(prospectsTable)` — the
query shape used by `fetchOwnedProspect` (`routes/prospects.ts:398`),
`generateMessage.ts:98` and `followups.ts:327,439,486` — failed against the
live database, so `GET/PATCH/DELETE /api/prospects/:id`, `generate-message`
and `send-next-followup` were returning 500s. Confirmed by running the exact
query read-only before any change. Michael chose to include all five.

**WHAT SHIPPED**

One hand-written migration, six statements, every one `IF NOT EXISTS`:

- `ALTER TABLE users ADD COLUMN microsoft_refresh_token text` (nullable)
- `ALTER TABLE users ADD COLUMN slack_bot_token text` (nullable)
- `ALTER TABLE prospects ADD COLUMN teams_email text` (nullable)
- `ALTER TABLE prospects ADD COLUMN slack_user_id text` (nullable)
- `CREATE TABLE magic_link_tokens` (8 columns, PK, unique on token, FK to
  users ON DELETE CASCADE)
- `CREATE INDEX magic_link_tokens_token_idx`

Nothing dropped, renamed, retyped or rewritten. The 22 live-only items were
deliberately left alone.

**VERIFICATION BEFORE APPLYING**

An automated checker parsed the migration statement by statement and rejected
DROP / RENAME / TRUNCATE / DELETE FROM / UPDATE…SET / INSERT INTO /
ALTER COLUMN / SET DATA TYPE / ADD COLUMN without IF NOT EXISTS / ADD COLUMN
NOT NULL without DEFAULT. Result: 6 statements, 0 non-additive. The checker
was itself self-tested against three known-destructive statements and rejected
all three, so the pass is not vacuous.

One false positive was caught and corrected during this step: the first
checker flagged the `CREATE TABLE` because `ON DELETE cascade` / `ON UPDATE no
action` matched a naive DML keyword scan. Those are foreign-key referential
actions on the new table, not DML. The **checker** was tightened; the
migration was not weakened.

**GATES — all three pass, for the first time in this project's recent history**

- Typecheck — **PASS** (4 projects).
- Tests — **PASS, 3/3** (`lib/db` vitest). Previously 0/3 with a hard failure.
  This was the whole point of M1.
- Build — **PASS** (`PORT=23183 BASE_PATH=/ pnpm run build`).

**GODLIKE AUDIT — 4 rounds, closed on a fully clean round**

- Round 1 (diff, data preservation): no defects. Confirmed the dump is
  gitignored and untracked, `magic_link_tokens` is inert (no app code uses it
  yet), and row counts survived intact (users 1, prospects 1, followups 1,
  action_logs 119, daily_usage 4, oauth_nonces 7).
- Round 2 (type fidelity): no defects. The earlier diff compared column *names*
  only, so this round compared types, nullability, defaults, constraints and
  indexes of every created object against the Drizzle schema. All exact:
  `serial` PK, `uuid` FK with ON DELETE CASCADE, `timestamptz` throughout,
  `created_at` defaulting to `now()`, unique on `token`, the token index
  present, and all four added columns `text` / nullable.
- Round 3: **1 in-scope finding, fixed.** `.replitignore` did not exclude
  `db-backup-*`, so a future publish would have baked a full database dump —
  real user, prospect and action-log rows — into the deployed image. The dump
  is my own artifact, so this was in scope. Added the exclusion.
- Round 4: clean. Re-verified the additive check still passes, journal and SQL
  files agree (9 entries, 9 files), the dump is excluded from both git and the
  deploy image, and no application or schema source was touched.

**SMOKE**

- The three previously-failing queries now succeed: `select ALL from prospects`
  (was the live 500), `select ALL from users`, and `select ALL from
  magic_link_tokens` (new, 0 rows).
- Post-migration schema diff: **0 repo-declared items missing from live** (was
  12); **22 live-only items still preserved**.
- api-server booted clean on a free port (`Server listening`, no errors);
  `/api/health` and `/api/healthz` 200, `/api/auth/me` and `/api/campaigns`
  401, `/api/auth/logout` 302 → `/login` (Bundle 1's centralization still
  intact). Stopped only the process this order started; the pre-existing
  workflow was left running and verified healthy afterwards.
- Migration recorded as `drizzle.__drizzle_migrations` id 23,
  created_at 1785447358140.

**DATABASE TOUCHED**

`postgres@helium:5432/heliumdb`, `sslmode=disable` — the workspace-local
Postgres from the `postgresql-16` module in `.replit`. Used by the app, the
tests, the migrator and drizzle-kit alike, all via `DATABASE_URL`. Evidence
that this is **not** the deployment's database: an in-container host, SSL
disabled, and single-digit row counts. **Not proof** — the deployment's
environment is not visible from the workspace. Confirm before assuming
production carries this fix; production may still have the original drift.

**Out-of-scope findings recorded: 1** (open item 5 — the divergent migration
lineage, deferred by decision). Open item 2 is now resolved.

**Backup retention:** `db-backup-20260730-213332.dump` is left in the project
root as the rollback path. It is excluded from git and from deploy images but
contains real row data — delete it once M1 is confirmed settled.

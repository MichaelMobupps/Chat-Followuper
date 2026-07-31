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

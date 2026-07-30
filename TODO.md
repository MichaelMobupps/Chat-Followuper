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

2. **`lib/db` test suite fails on pre-existing schema/database drift.**
   `pnpm --filter @workspace/db run test` fails with
   `column "microsoft_refresh_token" of relation "users" does not exist`. The
   Drizzle schema (`lib/db/src/schema/users.ts:96`, last changed in `ce8657b`,
   well before this bundle) declares columns the provisioned Postgres does not
   have. Bundle 1 changed no file under `lib/` and ran no migration, so this
   predates the bundle. Not fixed here: the hard rules forbid touching database
   schemas and migrations. Needs a decision from Michael — apply the pending
   migration, or reconcile the schema.

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

Searched for and **not found**: Telegram bot webhook registration (Telegram is
deep-link only via `t.me`, no bot token, no `setWebhook`), Pushover callbacks
(no Pushover code exists in either artifact, though the `users` table does
carry `pushover_*` columns), and any other outbound registration of this app's
own URL.

## Ledger

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

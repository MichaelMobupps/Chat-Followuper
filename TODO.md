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

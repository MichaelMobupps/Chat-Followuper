# Chat Followuper

## Overview

Chat Followuper is a sales-followup tool. Phase 1 scaffolds the repo: a typed
API server, a Vite/React dashboard with the core navigation, a Postgres-backed
shared lib, and a one-way mirror that exports the api-server source tree to
`source-code/` so it can be consumed by an external repo.

This workspace is a pnpm monorepo (TypeScript). Each package manages its own
dependencies. There is no business logic yet — only the scaffolding required by
Ticket 1.1.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React 18 + Vite + Tailwind v4 + shadcn/ui + wouter
- **Database**: PostgreSQL + Drizzle ORM (schema lives in `lib/db/`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (api-server), Vite (dashboard)

## Artifacts

- `artifacts/api-server` — Express server mounted at `/api`. Health endpoints
  at `/api/health` and `/api/healthz`.
- `artifacts/dashboard` — Vite/React dashboard mounted at `/`. Sidebar nav:
  Today, Seeder, Prospects, Followups, Activity, Accounts. Each route is a
  placeholder page (no business logic yet).
- `artifacts/mockup-sandbox` — design canvas (template, not used for the app).

## Phase 1 — Ticket 1.1 status

Scaffold-only. No channel adapters, no LLM code, no auth code.

- Express app with `/api/health` and `/api/healthz` returning `{"status":"ok"}`
  (validated by the `HealthCheckResponse` Zod schema).
- Dashboard with the six nav items and route placeholders.
- `lib/api-spec` OpenAPI spec + generated Zod and React Query hooks.
- `.env.example` listing every secret the later phases will need.
- `scripts/sync-source-code.sh` and `scripts/watch-source-code.mjs` mirror
  source trees into `source-code/`. `source-code/` is a read-only export
  target — never edit there directly.

## Phase 1 — Ticket 1.2 + Amendment A status

Database schema only. No business routes, no LLM, no channel adapters.

- 8 Drizzle tables in `lib/db/src/schema/`: `users`, `prospects`, `followups`,
  `conversations`, `magic_link_tokens`, `oauth_nonces`, `daily_usage`,
  `action_logs` — all timestamps are `timestamptz`.
- Migration generated via `drizzle-kit generate` and applied to the workspace
  Postgres via `tsx src/migrate.ts`. Migration file lives in `lib/db/drizzle/`.
- `lib/db/src/actionLog.ts` exports `logAction`, `incrementDailyUsage`, and
  `addAnthropicSpend`. Vitest covers all three.
- `scripts/src/seed-dev.ts` seeds one user + prospect + follow-up + daily_usage
  row. Idempotent — safe to run repeatedly.
- Sync script also mirrors `lib/db/src/schema/` into `source-code/db/schema/`.

Key commands added in this ticket:

- `pnpm --filter @workspace/db run generate` — generate a new migration
- `pnpm --filter @workspace/db run migrate` — apply migrations
- `pnpm --filter @workspace/db run test` — run helper unit tests
- `pnpm --filter @workspace/scripts run seed:dev` — seed dev data

## Phase 1 — Ticket 1.3 status (Google OAuth identity-only login)

Single sign-in for the dashboard. **Identity scopes only**: `openid email
profile`. No Gmail/Calendar scopes. No business routes.

Backend (`artifacts/api-server/src/`):

- `lib/session.ts` — HMAC SHA-256 signed cookie `cf_session`, 30-day TTL,
  timing-safe verify. HttpOnly + SameSite=Lax + Path=/; Secure in prod only.
- `middlewares/auth.ts` — `loadUser` (best-effort, sets `req.user` if a valid
  cookie is present) and `requireAuth` (401s when missing).
- `routes/auth.ts` — `GET /api/auth/me`, `POST /api/auth/logout` (204) + a
  convenience `GET /api/auth/logout` (302 → `/login`).
- `routes/google-auth.ts` — `GET /api/auth/google/start`,
  `GET /api/auth/google/callback`. Uses `oauth_nonces` for state with atomic
  single-use consumption (`UPDATE … WHERE consumed_at IS NULL RETURNING`).
- `app.ts` — mounts `cookie-parser` and the `loadUser` middleware on `/api`
  before the router.

Frontend (`artifacts/dashboard/src/`):

- `hooks/use-current-user.ts` — wraps the generated `useGetCurrentUser` hook
  and exposes a discriminated `loading | authenticated | unauthenticated |
  error` state. 401 is treated as "unauthenticated", not a fetch error.
- `components/auth-gate.tsx` — wraps protected routes; redirects to `/login`
  when unauthenticated.
- `pages/login.tsx` — single "Sign in with Google" button; shows friendly
  error messages for `?error=…` codes.
- `App.tsx` — `/login` is outside `AuthGate`; everything else is gated.

Domain allowlist:

- `ALLOWED_LOGIN_DOMAINS` env var (comma-separated, default `mobupps.com`).
  Non-matching emails are rejected with `?error=domain_not_allowed`.

OpenAPI contract:

- Added `AuthUser` and `AuthError` schemas, `GET /auth/me`, and
  `POST /auth/logout` to `lib/api-spec/openapi.yaml`. Generated React Query
  hooks and Zod schemas via the existing `pnpm --filter @workspace/api-spec
  run codegen` workflow.

## Deviations from the original Ticket 1.1 spec

The plan was written against a plain-Node, single-package layout. This
workspace is a pnpm monorepo, so a few paths shift:

- Dashboard lives in `artifacts/dashboard/`, not a top-level `dashboard/`.
- API server lives in `artifacts/api-server/`, not a top-level `server/`.
- DB lib lives in `lib/db/`, not a top-level `db/`.
- Use `pnpm` (not `npm`). The root `preinstall` hook blocks `npm install`.
- Workflows (not `npm run dev`) start the services. Both health URLs are
  exposed via the shared proxy on `localhost:80`.
- `.replit` is system-managed; routing for each artifact is configured via the
  artifact's `artifact.toml` (handled by the artifact tooling, not by hand).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and
  Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `bash scripts/sync-source-code.sh` — one-shot mirror of api-server src into
  `source-code/src`
- `node scripts/watch-source-code.mjs` — watch mode for the same mirror

## Workflows (services)

- `artifacts/api-server: API Server` → Express, mounted at `/api`
- `artifacts/dashboard: web` → Vite dev server, mounted at `/`
- `artifacts/mockup-sandbox: Component Preview Server` → mockup canvas

## Environment / Secrets

See `.env.example`. `SESSION_SECRET` is provisioned. The remaining keys
(`ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`,
`GOOGLE_OAUTH_*`, `DATABASE_URL`, `PUBLIC_BASE_URL`) are documented for later
phases and are not required by Ticket 1.1.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and
package details.

# Chat Followuper

## Overview

Chat Followuper is a sales-outreach tool for SDRs: it discovers and enriches
prospects, researches them, generates doctrine-driven first messages and
multi-stage follow-ups in the prospect's language and channel, and nudges reps
via email/Pushover digests. It is well past the original Phase 1 scaffold — the
API server carries real business logic (LLM generation, Apollo discovery, two
channel adapters, schedulers) and identity-only Google auth.

This workspace is a pnpm monorepo (TypeScript). Each package manages its own
dependencies. A one-way mirror exports the api-server source tree and DB schema
to `source-code/` for an external consumer repo (`source-code/` is a read-only
export target — never edit there directly; refresh with
`bash scripts/sync-source-code.sh`).

> Active development happens on branch `audit/godlike-fixes` (a security/quality
> audit + fixes). See `godlike-audit/LOG.md` for the running ledger.

## Stack

- **Monorepo tool**: pnpm workspaces (versions pinned via the workspace `catalog`)
- **Node.js version**: 24
- **TypeScript version**: 5.9
- **API framework**: Express 5 (mounted at `/api`)
- **Frontend**: React 19.1 + Vite + Tailwind v4 + shadcn/ui + wouter
- **Database**: PostgreSQL + Drizzle ORM (schema in `lib/db/src/schema/`)
- **LLM**: Anthropic SDK (`@anthropic-ai/sdk`) — Opus/Sonnet for research,
  generation, critic/rewriter, and org disambiguation; Haiku for summarization
- **Enrichment**: Apollo.io (org + people discovery, phone reveal via webhook)
- **Channels**: WhatsApp + Telegram deep links — the two channel adapters
  (`ChannelCode` is `"whatsapp" | "telegram"`). Teams and Slack were removed;
  their `teams_email` / `slack_*` columns remain in the DB but are dormant/unused
- **Notifications**: SMTP email digests + Pushover push
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (api-server), Vite (dashboard)

## Artifacts

- `artifacts/api-server` — Express server at `/api`. Feature routes include
  auth/google-auth, prospects, campaigns, prospector, apollo (+ webhook),
  generateMessage, prepareFirstMessage, followups (+ open/fallback),
  researchStream, sequenceConfig, notificationSettings, whatsappLink,
  testChannelLink, userExtras, admin. Health at `/api/health`, `/api/healthz`.
- `artifacts/dashboard` — Vite/React dashboard at `/` (Today, Contacts (bulk
  phone seeding), Seeder, Campaigns, Prospects, Followups, Activity, Accounts,
  plus settings/admin).
- `artifacts/mockup-sandbox` — design canvas (template, not the app).

## Database

Eight Drizzle tables in `lib/db/src/schema/` (all timestamps `timestamptz`):
`users`, `prospects`, `campaigns`, `followups`, `conversations`,
`oauth_nonces`, `daily_usage`, `action_logs`.

Migrations live in `lib/db/drizzle/` (currently 0000–0016; 0015 dropped the old
`magic_link_tokens` table; 0016 dropped the dormant Teams/Slack columns).

> ⚠️ Audit note (DB1/DB3): a dev/test DB may be behind the latest migrations.
> Drizzle meta snapshots cover 0000–0007 and the rebuilt head 0016; the
> intermediate 0008–0015 snapshots are absent but benign, because 0016's
> `prevId` chains back to 0015 (and 0015 to 0007) so `drizzle-kit generate`
> stays clean. Run `pnpm --filter @workspace/db run migrate` and verify the
> environment is at 0016 before relying on `.returning()`. See
> `godlike-audit/LOG.md`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod
- `pnpm --filter @workspace/db run generate` / `migrate` — DB migrations
- `pnpm --filter @workspace/db run test` — DB helper unit tests
  (requires the dev DB migrated to head)
- `pnpm --filter @workspace/scripts run seed:dev` — seed idempotent dev data
- `bash scripts/sync-source-code.sh` — refresh the `source-code/` mirror
- `node scripts/watch-source-code.mjs` — watch-mode mirror

## Auth

Identity-only Google OAuth (`openid email profile` — no Gmail/Calendar scopes).
HMAC-signed `cf_session` cookie (30-day TTL, timing-safe verify, HttpOnly +
SameSite=Lax, Secure in prod). `oauth_nonces` gives atomic single-use state
consumption. `ALLOWED_LOGIN_DOMAINS` (default `mobupps.com`) gates sign-in.
Dashboard `AuthGate` redirects unauthenticated users to `/login`.

## Environment / Secrets

See `.env.example` for the full list. Beyond `SESSION_SECRET`, the app uses:
`DATABASE_URL`, `ANTHROPIC_API_KEY` (+ optional `LLM_DAILY_SPEND_CAP_USD`),
`APOLLO_API_KEY` (+ optional `APOLLO_MONTHLY_REVEAL_CAP`, default 100),
`GOOGLE_OAUTH_*`, SMTP vars, Pushover vars, `PUBLIC_BASE_URL`,
`ALLOWED_LOGIN_DOMAINS`. Scheduler toggles: `FOLLOWUP_DIGEST_SCHEDULER`,
`FOLLOWUP_DIGEST_INTERVAL_MS`.

## Workflows (services)

- `artifacts/api-server: API Server` → Express, mounted at `/api`
- `artifacts/dashboard: web` → Vite dev server, mounted at `/`
- `artifacts/mockup-sandbox: Component Preview Server` → mockup canvas

## Monorepo notes

- Use `pnpm` (the root `preinstall` hook blocks `npm install`).
- Dashboard is `artifacts/dashboard/`, API server `artifacts/api-server/`, DB lib
  `lib/db/`. `.replit` is system-managed; per-artifact routing lives in each
  `artifact.toml`.

See the `pnpm-workspace` skill for workspace structure and package details.

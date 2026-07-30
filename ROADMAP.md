# ROADMAP - Mobupps Unified Tools Domain & Orchestration

Owner: Michael (CGO). Implementer: Claude (chat) authors work orders; Claude Code executes in-workspace; Replit Agent is retired from this project except emergencies.
Last updated: 2026-07-30.

## Goal

Combine the four sales tools (Leadfinder, Prospector, Email Followupper, Chat Followupper) under one domain with a shared gateway, then add an orchestration layer that moves prospects between the tools through APIs. Codebases stay separate. Databases and secrets never move.

## Architecture

- Gateway: `tools-gateway` app, Reserved VM, live at mobupps-tools-gateway.replit.app and tools.mobupps.net. Portal in the Dovah design language.
- Today: portal tiles link out to each tool's current address (LINK secrets).
- Per migration: each tool gains base-path support behind an env switch, then the gateway routes tools.mobupps.net/<tool> to it (URL secrets). Old addresses become permanent redirects.
- Later: orchestrator service on the gateway domain, calling each tool's service API with internal keys.

## Status board

| Item | Status |
|---|---|
| Gateway v1.2 built, godlike-audited, deployed | DONE 2026-07-30 |
| tools.mobupps.net attached | DONE |
| Portal launcher (4 LINK tiles) | DONE |
| Phase 0 snapshots: Leadfinder, Email Followupper, Chat Followupper, gateway | DONE 2026-07-30 |
| Phase 0 snapshot: Prospector | PENDING (active work on the app) |
| Bundle 1 Chat Followupper (URL centralization) | NEXT |
| Bundle 2 Chat Followupper (base-path switch) | QUEUED |
| Chat Followupper cutover to /chat | QUEUED |
| Prospector migration cycle | QUEUED |
| Email Followupper migration cycle | QUEUED |
| Leadfinder migration cycle (last: live team usage, emailed links, WebSockets) | QUEUED |
| Phase 3: service APIs per tool | PLANNED |
| Phase 4: orchestrator | PLANNED |

## Migration order and reasoning

1. Chat Followupper: no team users yet; free practice run.
2. Prospector: already has BASE_PATH plumbing.
3. Email Followupper.
4. Leadfinder: daily team usage, emailed result links, live WebSocket progress; it inherits a proven playbook.

One app in migration at a time. The next app starts only after the previous passes the full smoke checklist and runs quietly for two days.

## The per-app migration cycle

1. GitHub snapshot exists (Phase 0).
2. Bundle 1: centralize every hardcoded address (links, redirects, cookies, WebSocket URLs, webhook registrations, generated links) into one config module reading BASE_PATH and PUBLIC_URL env vars, both defaulting to today's values. Zero behavior change.
3. Verify the app is byte-for-byte identical in behavior.
4. Bundle 2: make the config switchable; per-app session cookie name; SPA catch-all under prefix; prefix-aware redirects. Ships inactive.
5. Test on the gateway with the tool's URL secret pointed at a staging clone.
6. Cutover: set BASE_PATH and PUBLIC_URL on production, redeploy, run the smoke checklist on tools.mobupps.net/<tool>, point the gateway URL secret at production.
7. Convert the old address into a permanent redirect.
8. Rollback at any point: unset the two env vars, redeploy. One minute, no code changes.

## Smoke checklist (gates every cutover)

1. Log in and log out.
2. Open a deep link directly and hard-refresh on it.
3. Zero 404s on assets in the browser console.
4. Upload a file and download a file.
5. One full job with live progress end to end.
6. One generated email or message whose links point at the new address.

## Standing bundle ritual

Every bundle, without exception, includes in order:

1. Blast radius statement before any edit: files to be touched, behaviors affected, worst realistic failure, rollback path.
2. Surgical implementation. Minimum change that achieves the scope.
3. Gates: typecheck, tests, build. All must pass.
4. Godlike audit: repeated full-codebase review rounds of the change across technical, security, and end-user framings. Any round with findings spawns fixes plus an added round. The bundle closes only on a fully clean round.
5. Smoke test: boot the app and verify the blast radius statement held (for zero-behavior bundles: behavior identical).
6. Auto-fix: findings inside the bundle's scope are fixed and re-audited. Findings outside scope are recorded in TODO.md and left untouched.
7. Ledger entry in TODO.md with the full ritual results.

## TODO.md ledger

Every repo in this project carries a TODO.md at root. Claude Code records every task there: completed bundles with ritual results, out-of-scope findings, deferred items, and external registrations discovered (webhooks, OAuth redirect URIs). The ledger is append-only history plus a live open-items section.

## What never moves

Databases stay in their apps. Secrets stay in Replit Secrets per Repl. Background jobs and schedulers stay where they run. The gateway holds no tool secrets. Code transport is git only; manual file export is forbidden.

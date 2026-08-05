# Phase B1 — Auth, session, admin isolation

**Date:** 2026-07-03  
**Verdict:** PASS (no open issues after autofix)

## Scope
- Session cookie (`loadUser` / `requireAuth`)
- Admin gate (`requireAdmin` + `ADMIN_EMAILS`)
- User-scoped queries on prospects, followups, preferences

## Findings

| ID | Severity | Finding | Blast radius |
|----|----------|---------|--------------|
| B1-1 | — | All mutating rep routes use `requireAuth`; cross-user access returns 404 (no existence leak) on prospects/followups | Low |
| B1-2 | — | Admin ops (`/admin/ops-dashboard`, audit CSV) behind `requireAuth` + `requireAdmin` | Low |
| B1-3 | — | `/admin/is-admin` is auth-only (intentional — FE hides manager UI) | Low |
| B1-4 | — | Public routes limited to health, auth callbacks, tokenized follow-up open/fallback/confirm | Medium if misconfigured |

## Autofix
None required for B1.
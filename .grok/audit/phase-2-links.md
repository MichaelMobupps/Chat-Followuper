# Phase B2 — Signed links, public routes, tokens

**Date:** 2026-07-03  
**Verdict:** PASS after autofix

## Scope
- `GET /api/followups/open/:id?t=`
- `GET /api/followups/fallback/:id?t=`
- `POST /api/followups/confirm/:id?t=`
- `FOLLOWUP_LINK_SECRET` HMAC tokens

## Findings

| ID | Severity | Finding | Blast radius |
|----|----------|---------|--------------|
| B2-1 | **High** | `followupOpen` previously called `recordSendIntent` on redirect — inflated `messagesSent` / `clickedAt` before rep pressed Send | Metrics, digest cadence, rep KPIs |
| B2-2 | Medium | Email users had no session path to confirm send after fallback page | Under-counted sends |
| B2-3 | — | Token verification uses HMAC + expiry + timing-safe compare | — |
| B2-4 | — | Fallback HTML escapes user content via `escapeHtml` | XSS mitigated |

## Autofix (applied)
1. Removed auto `recordSendIntent` from `followupOpen` redirect path.
2. Added `POST /api/followups/confirm/:id` (token-auth) for digest/fallback users.
3. Fallback page: “Yes, I sent it” form posts to confirm route.
4. Dashboard flows defer intent until explicit confirmation dialog.
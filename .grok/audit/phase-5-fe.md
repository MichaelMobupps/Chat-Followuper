# Phase B5 — FE flows, channel parity, XSS

**Date:** 2026-07-03  
**Verdict:** PASS after autofix

## Scope
- Today, Contacts, Seeder send flows
- Telegram / WhatsApp parity
- Confirm dialog UX
- XSS surfaces

## Findings

| ID | Severity | Finding | Blast radius |
|----|----------|---------|--------------|
| B5-1 | **High** | Today/Contacts/Seeder called `recordSendIntent` immediately on `window.open` | Same as B2-1 |
| B5-2 | Medium | Today confirm dialog was informational only (“Got it”) — no intent recording | Under-count |
| B5-3 | Low | `patchFollowup.isPending` referenced but undefined (snooze button) | Runtime error risk |
| B5-4 | — | No `dangerouslySetInnerHTML` on user content (chart lib only) | — |
| B5-5 | — | Today tabs: All / WhatsApp / Telegram; keyboard shortcuts wired | — |
| B5-6 | — | A28 calendar helper imported but button missing on rows | Feature gap |

## Autofix (applied)
1. Shared `SendConfirmDialog`: “Yes, I sent it” → `recordSendIntent`; “Not yet” dismisses.
2. Bulk open: informational dialog only (no per-row intent — rep confirms per chat manually).
3. Fixed snooze disabled state → `snoozeFollowup.isPending`.
4. Added “Calendar” button on Today rows via `googleCalendarFollowupUrl`.
5. Contacts + Seeder aligned to confirm-before-record pattern.
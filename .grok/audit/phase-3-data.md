# Phase B3 — Data integrity, duplicates, idempotency

**Date:** 2026-07-03  
**Verdict:** PASS after autofix

## Scope
- `recordSendIntent` (WhatsApp + Telegram)
- Snooze endpoint
- Pushover daily cap (`pushover_sent`)
- Email digest daily gate
- Duplicate contact ingest

## Findings

| ID | Severity | Finding | Blast radius |
|----|----------|---------|--------------|
| B3-1 | **High** | `recordSendIntent` always incremented `messages_sent` even when `clickedAt` / `firstMessageSentAt` already set | Double-count on re-confirm or double-click |
| B3-2 | — | Snooze rejects `already_sent` followups | Safe |
| B3-3 | — | Pushover digest uses `daily_usage.pushover_sent` for at-most-once per GMT+2 day | Safe |
| B3-4 | — | Duplicate manual ingest surfaces `duplicate_contact` to FE toast | UX only |

## Autofix (applied)
1. `recordSendIntent` (whatsapp + telegram): update only when `clickedAt` / `firstMessageSentAt` is null; skip usage increment + action log on no-op.
2. `scheduleFollowupsAfterFirstSend` runs only when first send newly recorded.
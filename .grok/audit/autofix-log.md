# Autofix log — 2026-07-03

## Trigger
Phased audit (B1–B5) identified blast radius: **send intent recorded on open, not on actual Send**.

## Changes

| Finding | File(s) | Fix |
|---------|---------|-----|
| B2-1 | `routes/followupOpen.ts` | Removed auto `recordSendIntent` on redirect (prior session) |
| B2-2 | `routes/followupOpen.ts`, `routes/followupFallback.ts` | Added `POST /followups/confirm/:id?t=` + fallback form |
| B3-1 | `services/channels/whatsapp.ts`, `telegram.ts` | Idempotent intent: only count when timestamp newly set |
| B5-1, B5-2 | `components/SendConfirmDialog.tsx`, `pages/today.tsx`, `contacts.tsx`, `seeder.tsx` | Confirm-before-record UX |
| B5-3 | `pages/today.tsx` | `snoozeFollowup.isPending` |
| B5-6 | `pages/today.tsx` | Calendar button per due row |
| Bulk open | `pages/today.tsx` | No auto intent; bulk info dialog only |

## Verification
```bash
pnpm run typecheck                              # PASS
pnpm --filter @workspace/api-server run smoke:followup  # PASS
```

## Residual / accepted risk
- Bulk open does not batch-record intents (by design — rep must confirm each send).
- Double-submit on confirm is now a no-op (idempotent backend).
- CRM webhook, Slack alert remain out of scope.
# Chat Followuper — Master TODO (SSH-safe)

**Last updated:** 2026-07-03 session-3 (autofix complete)  
**Resume here after disconnect.**

## Legend
- [x] done  [~] in progress  [ ] pending  [!] blocked

---

## A. Nice-to-haves (excl. CRM webhook, Slack alert)

| # | Feature | Status |
|---|---------|--------|
| A1 | Snooze follow-up (Today) | [x] |
| A2 | Mark replied (Today) | [x] |
| A3 | Test digest email (Accounts) | [x] |
| A4 | Sent confirmation dialog (Today) | [x] |
| A5 | Prospect activity timeline (detail) | [x] |
| A6 | Personal message template | [x] |
| A7 | Bulk open queue (Today) | [x] |
| A8 | Preferred channel per rep | [x] |
| A9 | Copy prospect summary | [x] |
| A10 | Keyboard shortcuts (Today) | [x] |
| A11 | Pushover escalation (2+ days overdue) | [x] |
| A12 | Pushover quiet hours per rep | [x] |
| A13 | Weekly summary email (Friday) | [x] |
| A14 | Monday “queue clear” nudge | [x] |
| A15 | Apollo seeder → open chat on done | [x] |
| A16 | Duplicate prospect FE warnings | [x] |
| A17 | Apollo reveal monthly cap | [x] |
| A18 | Message quality score on detail | [x] |
| A19 | Variant outcome tagging | [x] |
| A20 | Lint preview before open | [x] |
| A21 | Admin ops dashboard | [x] |
| A22 | Feature flags (env) | [x] |
| A23 | Health check panel (Accounts) | [x] |
| A24 | Admin audit CSV export | [x] |
| A25 | PWA manifest | [x] |
| A26 | Shorter Pushover copy | [x] |
| A27 | Deep link HTML fallback page | [x] |
| A28 | Google Calendar follow-up events | [x] |

---

## B. Audit phases (godlike + blast radius)

| Phase | Scope | Status | Log |
|-------|-------|--------|-----|
| B1 | Auth, session, admin isolation | [x] | `.grok/audit/phase-1-auth.md` |
| B2 | Signed links, public routes, tokens | [x] | `.grok/audit/phase-2-links.md` |
| B3 | Data integrity, duplicates, idempotency | [x] | `.grok/audit/phase-3-data.md` |
| B4 | Email, Pushover, schedulers | [x] | `.grok/audit/phase-4-reminders.md` |
| B5 | FE flows, channel parity, XSS | [x] | `.grok/audit/phase-5-fe.md` |
| B6 | Autofix all findings | [x] | `.grok/audit/autofix-log.md` |

---

## C. Verification

- [x] `pnpm run typecheck`
- [x] `pnpm --filter @workspace/api-server run smoke:followup`
- [ ] `pnpm --filter @workspace/db run migrate` (run in prod)

## Commands
```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run smoke:followup
pnpm --filter @workspace/db run migrate
```

## Out of scope
- CRM webhook
- Slack alert
- Teams/Slack send paths
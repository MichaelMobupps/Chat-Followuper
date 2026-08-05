# Phase B4 — Email, Pushover, schedulers

**Date:** 2026-07-03  
**Verdict:** PASS

## Scope
- `digestScheduler.ts` hourly tick
- `followupDigest.ts` (email, per-rep local hour)
- `pushoverDigest.ts` (weekday midday GMT+2)
- `weeklyDigest.ts`, `pushoverNudges.ts`

## Findings

| ID | Severity | Finding | Blast radius |
|----|----------|---------|--------------|
| B4-1 | — | Email digest independent of Pushover schedule | — |
| B4-2 | — | Pushover: `isPushoverScheduleNow()` skips Sat/Sun, fires at hour 12 `Etc/GMT-2` | — |
| B4-3 | — | Per-rep quiet hours respected in Pushover batch | — |
| B4-4 | — | Scheduler single-flight guard (`running` flag) prevents overlap | Low |
| B4-5 | — | `FOLLOWUP_DIGEST_SCHEDULER=false` disables in tests | — |

## Autofix
None required for B4 (blast radius from B2/B3 addressed send-intent timing).
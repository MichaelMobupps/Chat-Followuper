# Godlike Audit — Pass 3 (adversarial re-verification of the pass-2 fixes)

Scope: the ~30 fixes in commits 71083bf..HEAD (audit-2 batches 1-8 + S1-S3 + F-B).
Baseline: build exit 0, db tests 3/3. Goal: did any fix introduce a new bug/regression?

## Auditor 1 — scheduling/lifecycle (DONE) — all 7 fixes SOLID
- **[Low] P3-1** F1 stale docstring in whatsapp.ts:70-76 (still says "don't touch sentAt / click lives in clickedAt"); telegram's was updated, whatsapp's missed. Docs only. FIX: update docstring.
- **[Low] P3-2** F2 admin analytics skew: admin.ts:169,197 counts digest_sent by UTC `today`, but F2 now writes the claim on usageBucketDate(local). Cross-boundary users → admin count off. Cosmetic (admin dashboard only). FIX: sum today±1 or key off digest.sent action_log.
- **[Med/Low] P3-3 (=A7)** FOLLOWUP_EDITABLE_STATUSES includes "sent" (followups.ts:91-96,665); PATCH can set status='sent' without sentAt → dark row (excluded from due queries, shows not_yet_sent, send-next 409s). F1 made 'sent' a live state so more consequential. Owner-scoped. FIX: drop "sent" from FOLLOWUP_EDITABLE_STATUSES.
- Verified SOLID: F1 (null branch unchanged; scheduleFollowupsAfterFirstSend confined; all due queries gate on status='scheduled' AND sentAt IS NULL; idempotent via isNull(clickedAt) UPDATE + if(sentAt) guard; no zod/switch breaks on 'sent'), F2 (today removed; bucketDate scope covers catch; claim+release same bucket), F3 (sole caller has atomic claim), F5 (snoozeFrom>=now), F6 (both digests: real send-fail releases, post-send bookkeeping best-effort outside boundary), F4/D2 (all 4 due queries guarded + import present), L7 (break lands at post-loop return best; best always set; cost accounting correct).

## Auditor 2 — money/spend (DONE) — 1 REGRESSION + 2 Low
- **[Med-High] P3-4 REGRESSION (my P3a fix)** apollo.ts:290,297-298: apolloFetch builds `init` once with `signal: AbortSignal.timeout(30_000)`, first fetch, `sleep(60_000)`, retries with the SAME init → the 30s timer already fired at T~30s, retry runs at T>=60s → retry aborts immediately (deterministic). Breaks the wait-60s-retry-once for every Apollo 429, and replaces the clean ApolloRateLimitError(503) with a TimeoutError. $0 direct (429 = no credit) but reliability. FIX: fresh signal on retry — `fetch(url, {...init, signal: AbortSignal.timeout(30_000)})`. Conf High. (redirect:"error" + header-only-key parts are SOLID.)
- **[Low] P3-5** L1 cap-check on /discover-simple (prospector.ts:968-971): that endpoint is Apollo-only (resolved company supplied in body, no LLM cascade) → gating it on the LLM cap over-restricts + the comment is wrong. FIX: drop the cap-check there + fix comment.
- **[Low] P3-6** P1 skipped-promote → arrived+phone=null terminal (computeProspectStatus → "phone-pending" but requestPhoneReveal refuses to re-reveal arrived). No crash/mislead; minor SDR confusion. Optional: distinct status.
- Verified SOLID: L1 cap-checks (all 3 OUTSIDE try → terminal 429, no swallow) + spend recording (model IDs correct, ?? 0 guarded, no double-record); L2 researchStream (records before clientGone return, sole writer); recordDailyLlmSpend (bucket=reader bucket, ADD not replace, NaN-guarded); L8 tx x2 (no nested tx, in-tx bucket correct, action-log outside); L10 (cache before cap, resolveChannel pure); P1 guard (in-tx clash SELECT, self-heals, no loop); L9 (regex correct).

## Auditor 3 — error taxonomy/API (DONE) — crown-jewel 23505 mapping VERIFIED SOUND
- **[Info] P3-7** dbErrors.ts:4-5 header comment still lists teams/slack indexes. FIX: drop from comment.
- **[Info] P3-8** prospects.ts:133 schema comment still "Telegram/Teams/Slack". FIX: reword.
- **[Info] P3-9** A2 extra id SELECT on no-channel path (negligible). **[Info] P3-10** unmapped 23505 → "duplicate" 409 (fine).
- Verified: all intended conflicts onConflict-suppressed + digest/scheduler background-only (unreachable from routes); Apollo webhook race INSULATED (local 500, self-heal preserved); only prospects create/PATCH → correct 409. A1/A2/A9/C3/S3-0016 all SOLID. (No live 23505→409 test — static path sound.)

## Auditor 4 — ingest/prompt-injection (DONE) — 1 incomplete-fix (my L5) + 1 Low
- **[Med] P3-14 INCOMPLETE (my L5 fix)** L5 guarded buildResearchBriefBlock (writer) but the critic + rewriter brief blocks (messagePrompts.ts:754,758,844,848) + messageGenerator.ts:1139 still do unguarded `.finalCompetitors.join()`/`.tangibleReasons.join()`. A malformed client-written researchBrief ({} or non-array) now survives the writer (spend incurred) then TypeErrors in critiqueDraft → 500 AFTER the draft is paid for. L5 moved the crash later/costlier. FIX: guard those sites with Array.isArray/arr() (or deep-validate isResearchBrief). Conf High.
- **[Low] P3-15** L6 collapseThousands `/(?<=\d)[, \s](?=\d)/g` — `\s` includes `\n`, so digit-⟨newline/space⟩-digit across brief fields/conversation rows can merge legit numbers out of groundedNums → rare wasted heal iter. Net still better than pre-L6. FIX: class → `[,  ]` (drop \n\t). Conf Med (rare).
- Verified CORRECT: C1 (4 regex copies identical; no legit-handle regression; phone-in-telegram intact), A6 (lowercase consistent pre-check+insert both paths), L3 (C0 strip preserves \t\n; dash-collapse 3+ only; before cap), L4 (pf.body neutralize near-no-op on own output; SECURITY directives coherent), L5-writer (s()/arr() no-op on clean brief), L6-core (lookbehind supported; 1,200 fix works; nText in all 3 loops).

## ─────── PASS 3 CONSOLIDATED (all 5 auditors) ───────
**Zero Critical/High regressions. 3 real self-inflicted issues + a Low/doc tail.** The pass-2 fixes hold up; the crown-jewel 23505 mapping + F1 lifecycle are SOUND.
FIX (correctness): P3-4 apolloFetch retry signal [Med-High]; P3-14 L5 critic/rewriter brief guard [Med]; P3-11 F-B maxFollowups FE [Med]; P3-3/A7 drop "sent" from editable statuses [Med/Low]; P3-5 discover-simple cap over-restriction [Low]; P3-15 L6 class [Low].
FIX (docs/cleanup): P3-1 whatsapp docstring; P3-7 dbErrors comment; P3-8 prospects comment; P3-12 replit.md 0016; P3-2 admin skew (small fix or doc).
DEFER (negligible/optional): P3-6, P3-9, P3-10, P3-13.

## Auditor 5 — frontend/config (DONE) — 1 REGRESSION (my F-B) + 2 doc
- **[Med] P3-11 REGRESSION (my F-B fix)** BE maxFollowups tightened to 1-10 but FE SequenceConfigPanel.tsx:240,440-444 NOT updated: input still min=0 max=20, empty→0, handleSave re-sends full body every save. → a user with a legacy stored 0/11-20 gets 400 invalid_body on ANY edit (blocks saving unrelated fields); a fresh user clearing/over-typing the field also 400s. FIX: FE input min=1 max=10, empty fallback →1, clamp GET-loaded value into [1,10] on open.
- **[Low] P3-12** replit.md:58,62-63,65-66 migration head stale — says 0015, S3 added 0016. Table count (8) + channel count (2) still correct. FIX: bump 0015→0016 refs.
- **[Info] P3-13** prod-bring-to-head.sql header doesn't mention the new prod-drop-dormant-channel-columns.sql (0016 by-hand). Optional.
- Verified CORRECT: E2 (all yes/no/maybe states + BE phone/apolloPersonId cross-field; "no" early-returns before create), E3 (BE always enforced enum+lang so no legacy email/pt-BR; no Record-map crash), E4/E5 (routes/icons/isActive), C5 (right message field per handler, copy after popup-guard, single toast), E6, E7, P3c (sweep .catch inside Promise.all, null-safe, env default, no concurrency). FE handle regex mirrors BE exactly; no other FE/BE drift.

## ─────── PASS 3 PHASE 2+3: F-A LinkedIn + F-B built, then audited ───────
Built F-A (LinkedIn channel) + F-B (followups-menu Pushover config + schedule view),
commits beb866e (BE) + ce50490 (FE). Then 2 adversarial auditors on the new work.

**F-A audit found LinkedIn wasn't fully threaded (all fixed in 6780dd5):**
- HIGH: F4/D2 digest guards hardcoded ["whatsapp","telegram"] → LinkedIn followups
  excluded from ALL reminders. Fixed via new CHANNEL_CODES single-source-of-truth.
- HIGH: manualContactPrepare.buildDeepLink no linkedin branch → no_phone after billing.
- HIGH: computeProspectStatus/statusSqlFilter → linkedin-only stuck "phone-pending".
- MED: testChannelLink no linkedin handler; followupOpen open/confirm no linkedin branch.
- FE HIGH: PushoverSettings null quiet-hours → 400; Today copied wrong message; bulk-open
  can't serve clipboard-only LinkedIn.
- FE LOW: SendConfirmDialog copy; no_linkedin_identifier error map.
**F-B audit: CLEAN** (quiet-hours tolerate inverted/equal windows; preferredChannel safe;
masked key; new action type present; PushoverSettings seeds from GET w/ FE2 guard).

**Documented residuals (minor, pre-existing):** Today partial-error banner names 1 of N
failed channels; Today per-row icon hardcoded MessageCircle. FE-Low, not shipped-blocking.

**FINAL GREEN BAR:** pnpm run build exit 0; @workspace/db 3/3; live smokes (F1 lifecycle
6/6 + F-E bulk 9/9) PASS after all phases. Migrations 0000–0017 (0017 = linkedin dedup).

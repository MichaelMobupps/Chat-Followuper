# Godlike Audit — Pass 2 consolidation ledger (2026-07-08)

Baseline probe: PASS (build exit 0, db tests 3/3) at HEAD `02c1212`.
Mirror re-sync committed as `dd19150` (B2 contained; re-sync again at end of fix phase).

## Findings by auditor (raw, pre-triage)

### Auditor 8 — build/config/hygiene (DONE)
- **B1 [High]** replit.md stale again after F-C/F-E (claims 4 channels/501 stubs; 9 tables incl dropped magic_link_tokens; migrations 0000–0010 vs head 0015; snapshot note stale; page list omits Contacts/Campaigns; Mailgun mention dead). FIX: rewrite sections. Conf High.
- **B2 [High]** source-code/ mirror drift (15 files, still had teams/slack). FIXED → committed `dd19150`. Re-sync at end.
- **B3 [Med]** .env.example missing used vars (APOLLO_WEBHOOK_SECRET/_SHARED_SECRET/_URL — webhook rejects ALL reveals when unset; ADMIN_EMAILS; FOLLOWUP_LINK_TTL_HOURS; FOLLOWUP_DIGEST_INTERVAL_MS; PROSPECTOR_SONNET_MODEL; PUSHOVER_SKIP_QUIET_HOURS; REVEAL_PENDING_MAX_AGE_HOURS; SEND_HOUR_START/END; WEEKLY_DIGEST_SKIP_DAY_CHECK; FOLLOWUP_<STAGE>_MIN/MAX_DAYS; LOG_LEVEL; PORT/BASE_PATH) + dead MAILGUN_* block. Conf High.
- **B4 [Med]** prod-bring-to-head.sql: coverage 0008–0015 verified OK, but header overclaims idempotence — 0013/0014 uniques fail if dupes exist; must say "run prod-migration-fix.sql FIRST" (ordering currently only in TODO.md). Conf High.
- **B5 [Low]** drizzle meta snapshot gap 0008–0014 (journal complete; generate works off 0015). No action; fold note into B1 rewrite.
- Trivia: xlsx@0.18.5 CVEs (backlog); sync-source-code.sh runs on any arg (add guard — kind); .replit postMerge drizzle-kit push footgun (by design); tracked non-source artifacts clean of secrets.
- Clean: secrets scan CLEAN (delta + full tree); no new deps; Published commits empty; codegen FRESH; BUILD1/4/5/6 + vite fix INTACT.

### Auditor 5 — channels/manual ingest (DONE)
- **C1 [High]** Digits-without-+ in a TELEGRAM batch pass TELEGRAM_HANDLE_RE (`/^@?[a-zA-Z0-9_]{5,32}$/` matches all-digit) → stored as telegram_handle, phone NULL → dead t.me/<digits> links, dedupe bypassed. Files: routes/prospects.ts:1114 (RE), 1572-1578 bulk, 1201-1207 single; FE copies BulkPreviewGrid.tsx:45, AddManualContactDialog.tsx:57; testChannelLink.ts:10. FIX: digit-intent detection → reject or auto-+; tighten handle RE to `/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/` BE+FE+testChannelLink. Conf High.
- **C2 [Med]** Handle dedupe pre-check races 0013 partial unique: single → 500 internal (no 23505 catch); bulk → `insert_failed` with RAW pg error in detail rendered by FE. Stale comment :1219-1223 claims index doesn't exist. FIX: catch 23505 on prospects_user_telegram_unique → 409/row-error `duplicate_telegram_handle`; generic detail; fix comment. (= A3 + A4.)
- **C3 [Low-Med]** `invalid_identifier` reused for missing company/product (runs BEFORE identifier validation → two-problem row reports only one). FIX: new code `missing_company_product` + FE union + copy. (= A5.)
- **C4 [Low]** Row-level Zod in outer schema → one bad cell 400s whole batch (contradicts always-200 contract). FE can't trip it today. FIX: relax row schema or document. Conf Med.
- **C5 [Low]** CH5 telegram clipboard fallback missing on contacts.tsx handlePrepareAndSend (+ prospect-detail.tsx, ProspectsListTable.tsx). FIX: replicate copy+toast branch. Conf High.
- Trivia: GeoGateBlockedError now never thrown but caught in 4 routes (dead); testChannelLink identical branches; no bulk rate limit (documented punt); bulk rows omit durationMs; ~600 sequential DB roundtrips per 200-row batch (v1 OK); batch-input edits don't clear stale row server-errors; openapi.yaml missing manual-ingest/send-intent/whatsapp-link paths (drift magnet).
- Clean: CH1/CH2/CH3/CH7 INTACT; CH5 partial (→C5); F-C removal COMPLETE; F-E index semantics FE↔BE ALIGNED; injection path defended (prePlatformContext capped+sanitized+neutralized).

### Auditor 1 — API routes/middleware (DONE)
- **A1 [Med]** followups.ts:515-524 send-next catch-all: `error: genErr.message` → DailyLlmCapExceededError becomes 409 without payload (should be central 429), unexpected internals leak raw message as 409 code. FIX: rethrow cap error; allowlist curated codes; else 500 generation_failed. Conf High.
- **A2 [Med]** whatsappLink.ts:158-201 send-intent: URL prospectId unvalidated → forged action_logs rows into victim timeline (needs UUID; low exploitability); nonexistent UUID → FK violation → tx rollback → 500. FIX: fetchOwnedProspect 404 guard (or derive prospectId from followup row). Conf High.
- **A3 [Low]** = C2-bulk (insert_failed raw detail). **A4 [Low]** = C2-single (500 + stale comment). **A5 [Low]** = C3 (code reuse).
- **A6 [Low]** telegram handle dedupe case-sensitive (Telegram usernames case-insensitive) → @YaronK vs @yaronk dup prospects. FIX: lowercase before store/compare (+ lower() index if retrofitting). Conf Med.
- **A7 [Low]** PATCH followups can set status=sent without sentAt → filter-invisible rows. FIX: restrict PATCHable statuses or couple sentAt. Conf Med.
- **A8 [Low]** sequenceConfig single-bound PATCH → inverted window persists (= FUP7-adjacent residual). FIX: compare against stored row. Conf Med.
- **A9 [Low]** apollo.ts:129-131/:158 unknown-error `detail: err.message` leak on 500. FIX: null detail in final else-if. Conf High.
- Trivia (selected): notificationSettings PATCH logs wrong actionType (sequenceConfigUpdated); GET /auth/logout CSRF-able; oauth_nonces never purged; admin export loads whole action_logs into memory; sequenceConfig schema not .strict(), tz not validated; session cookie secure keyed on NODE_ENV; snooze next_monday server-tz; send-intent returns ok:true when nothing recorded; loadUser DB outage → anonymous 401s.
- Clean: API1/2/4/5/6/7/8 INTACT; LLM3 wiring intact at 3/4 surfaces (A1 = 4th degraded); APO1 intact; F-C VERIFIED-COMPLETE; F-E no validation bypass; c920387/23c173a shapes confirmed current; auth chain/session/google-auth/mass-assignment/scoping all verified.

### Auditor 6 — DB schema/migrations (DONE)
- **D1 [Med]** 23505 from 0013 identity indexes → opaque 500 on NON-race paths too: PATCH prospect telegramHandle/apolloPersonId to a value already on another own prospect (prospects.ts:736-746, no pre-check/conflict handling), POST create with dup handle (:534-562, onConflictDoNothing targets only user_id+phone); terminal handler has no 23505 mapping. FIX: map 23505 → 409 with constraint-derived code (terminal handler + route codes). Generalizes C2/A4. Conf High.
- **D2 [Low-Med, prod-conditional]** Legacy channel='teams'/'slack' followups = permanent zombie digest entries: digest queries have no channel filter (followupDigest.ts:108-132, pushoverDigest.ts:74); can never complete (invalid_channel throw); invisible in followups UI (list requires whatsapp|telegram). Dev DB: ZERO such rows. FIX: data migration/prod SQL `UPDATE followups SET status='cancelled' WHERE channel NOT IN ('whatsapp','telegram') AND sent_at IS NULL` + optional channel filter in digest queries. Conf High mechanism / Med exposure.
- **D3 [Low]** = C2-bulk/A3 (insert_failed raw pg text + mislabeled handle-dup race).
- Trivia: stale "no unique index yet" comments at prospects.ts:507-508,1219-1223,1264-1267,1437-1445; actionLog.ts UTC-default helpers dormant footgun (zero prod callers); no (status,sent_at,scheduled_at) index on followups (fine at volume); followupDigest doc drift; legacy preferred_channel/default_channel teams/slack returned raw to FE (cosmetic); migration trailing newlines.
- Clean: **prospectName IS NULLABLE everywhere — F-E phone-only inserts safe** (downstream null-coalesced); schema↔SQL drift ZERO (generate probe = no diff; hashes match); DB1 16/16 at head; DB3 snapshot chain VALID (0015.prevId==0007.id, gap benign); DB4/DB5/FUP5 intact in live DB; weekly-digest claim atomic via partial unique; F-E/F-C query patterns index-covered.

### Auditor 2 — LLM generation (DONE)
- **L1 [High]** Prospector LLM endpoints bypass daily spend cap + never record spend: prospector.ts:314 (/resolve-company), :749/:1098 (/discover-simple, /discover) — Sonnet 4.6 + Sonnet 5 + Opus 4.8 w/ web_search, no assertUnderDailyLlmCap, no daily_usage write (tokens only in action_logs metadata :1291-1298). FIX: cap-check before each cascade + computeCost per llmUsage entry → daily_usage upsert (generateMessage pattern). Conf High.
- **L2 [Med-High]** researchStream.ts:122,185-188 checks cap but never writes research spend → cap self-referentially inert on this route; dashboards under-count. FIX: upsert cost.usd after researchProspect (user-local bucket). Conf High.
- **L3 [Med]** F-E prePlatformContext → research prompt un-fenced via weak sanitizeContextNotes (no --- defusing, no fence, no SECURITY directive in research system prompts); poisoned brief then becomes TRUSTED grounding for writer/critic + detectUngroundedClaims. prospectResearch.ts:320-341 + doctrine researchPrompts. FIX: neutralize + fence + directive. Conf Med.
- **L4 [Med]** LLM1 coverage gaps: critic (messagePrompts.ts:600-703) + rewriter (:774-797) system prompts lack SECURITY directive; previous_followups bodies not neutralized (:561, :726) — fence-breakable. FIX: prepend directive; neutralizeUntrusted(pf.body, 2000). Conf Med.
- **L5 [Med]** researchBrief client-writable free-form JSONB (prospects.ts:345,556,749 z.record unknown), trusted in system prompt (buildResearchBriefBlock, no neutralization) + grounding truth; non-array finalCompetitors crashes .join() post-spend 500. FIX: validate against ProspectBrief schema at write; neutralize string fields. Conf High/Med.
- **L6 [Med]** Grounding gate vs thousands separators: "1,200" tokenizes {1,200} vs draft "1200" → false hallucination flag → full healing loop burn every time (validateVolumeFormat permits commas). messageGenerator.ts:429-455. FIX: normalize [,\s] + decimal comma both sides. Conf Med-High.
- **L7 [Low-Med]** Final healing iteration's rewrite always discarded (rewrite runs on iter 3, never critiqued, best returned) — one wasted Sonnet call per exhausted message. messageGenerator.ts:1051-1231. FIX: skip rewrite when iteration===max. Conf High.
- **L8 [Low-Med]** LLM8 atomicity never extended to manualContactPrepare.ts:220-252 + followupMessageService.ts:199-220 (message write + spend upsert separate awaits). FIX: db.transaction like generateMessage.ts:224. Conf High.
- **L9 [Low]** modelDefaultsAdaptiveThinking sends thinking:{disabled} for fable-5 → 400 (invalid there; must omit). Latent, reachable via PROSPECTOR_SONNET_MODEL env. companyResolver.ts:436-457. FIX: gate on sonnet-5 only. Conf High.
- **L10 [Low]** manualContactPrepare cap-check BEFORE cached short-circuit → capped user 429s fetching already-paid message (followupMessageService orders correctly). :120-137. FIX: move below already_ready return. Conf High.
- **L11 [Low]** messageSummarizer dead code — zero callers; priorSummary never passed; followups always get generic topic hint. FIX: wire or delete. Conf High.
- Trivia: stale 4-channel comment messageGenerator.ts:79; "(Sonnet 4.6)" log vs opus-4-7; critic threshold conflict (<4 system vs <3 channel blocks); sonnet-5 intro pricing over-count (conservative); web_search fees not in computeCost; unescapeJsonString \\n before \\\\ ordering; no outer timeout on generateMessage; buildGreetingBlock says WhatsApp for telegram; languageNativeness/messagePrompts Slack/Teams prose (cosmetic).
- Clean: LLM1-LLM8 ALL VERIFIED-INTACT (gaps above are coverage boundaries, not regressions); model IDs all live+priced; sampling/thinking per-model correct; token budgets sane; JSON parsing layered; spend-bucket alignment correct; F-E bulk triggers no LLM work; F-C complete in LLM files.

### Auditor 4 — followups/scheduling (DONE)
- **F1 [CRITICAL]** followups.sentAt write-nowhere; due queries ignore clickedAt → confirmed-sent followups stay due FOREVER: daily re-digest + noon re-push + daily priority-1 escalation; send-next re-serves same stage w/ identical cached message (duplicate outreach); statuses sent/no_reply unreachable (sentCount always 0); previousFollowups always empty (isNotNull(sentAt)) → stage rotation never engages. Files: channels/whatsapp.ts:74-77,106-128, telegram.ts:96,126-148, followupDigest.ts:124-131, pushoverDigest.ts:86-94, pushoverNudges.ts:109-117,230-239, routes/followups.ts:483-500,348, followupMessageService.ts:139-146. FIX: recordSendIntent followupId path also sets sentAt=now() (Mode-A semantics) — plus check status derivation consistency. Conf High. VERIFY MYSELF before fix.
- **F2 [High]** followupDigest claim keyed UTC date but hour-gate user-local >= → UTC midnight inside open window = 2nd claim (userId,D+1) succeeds → DOUBLE digest same local day; steady state = digest at UTC-midnight-local, configured hour ignored. Affects Americas tz + any hour ≤ ~2. followupDigest.ts:106,149,159-168. FIX: key claim+release on usageBucketDate(digestTimezone). Conf High. (pushoverDigest immune — shared tz basis.)
- **F3 [Med]** FUP1 pushover half never applied: pushoverSchedule.ts:52 still `hour === pushoverHourLocal()` → missed noon tick = whole day's batch skipped. FIX: >=. Conf High.
- **F4 [Med]** = D2 zombie teams/slack followups (mechanism detail: escalations priority-1 daily; confirm route would mislog as whatsapp.send_intent followupOpen.ts:171-174; invisible in all mgmt UI). FIX: migration UPDATE status='cancelled' WHERE channel NOT IN + inArray(channel, SUPPORTED) in 3 due queries.
- **F5 [Med]** Snooze computed from OLD scheduledAt not now → snoozing overdue row leaves it overdue (next digest tick + escalation continue); next_monday can resolve past; server-local setHours(9). routes/followups.ts:779-796,845-846. FIX: base on max(now, previousAt). Conf High.
- **F6 [Med-Low]** Post-send bookkeeping failure releases claim AFTER successful send → duplicate email (followupDigest.ts:179-207 action-log inside try; weeklyDigest.ts:194-209 metadata update inside sendErr boundary). FIX: best-effort .catch(log) outside release boundary. Conf High/low-prob.
- **F7 [Low]** Escalation/Monday-nudge dedup check-then-insert (multi-instance double-send; single-instance safe). FIX: partial unique + insert-first (weekly pattern). Conf Med.
- **F8 [Low]** Open-link unfixable-generation rows (no researchBrief e.g. F-E phone-only seeds, missing context) silently 302 + re-notify forever; whatsapp-null-phone burns LLM spend before phone check. followupOpen.ts:84-92,114-117. FIX: small error page; optional pause-after-N. Conf Med.
- Trivia: send-next raw genErr.message (=A1); parseInt accepts "123abc"; PATCH status sent w/o sentAt (=A7); unauth open-link triggers billed generation (scanner prefetch, bounded); weekly fires ~00:30 local Friday; unused isNotNull import; minute never :46-59; pushoverDueNotifier dead stub.
- Regression: FUP1 PARTIAL (→F3); FUP2/3/4/5/6 INTACT (F2/F6 are new defects on top of FUP3); FUP7/8/10/11 residual-as-documented (FUP7 NaN crash claim does NOT materialize); FUP9 partial (→F8); weeklyDigest cross-process race residual ACTUALLY FIXED (0014 + insert-before-send) — upgrade docs.
- Clean: digest tenant isolation; token crypto; confirm idempotency; scheduleFollowupsAfterFirstSend callers safe; scheduler wiring; pushoverDigest tz coherence; quiet-hours math; FUP5 counts; bulk-archive scoping.

### Auditor 3 — Apollo/discovery (DONE)
- **P1 [High]** Webhook phone-promote violates (user_id,phone) unique on shared numbers (pickPhone falls back to org/HQ number → same phone for prospect 2..N in bulk reveal) → 23505 → whole tx rollback (correlationId NOT burnt) → webhook 500 → Apollo retry loop → row pending until 72h sweep 'expired'. 8 credits lost per occurrence. services/apollo.ts:1189-1202 (+pickPhone :444-453). FIX: in-tx pre-check for another own prospect holding promotedPhone → set arrived + phoneNumber but skip phone promote (log duplicate_phone); or savepoint-catch 23505 → same degrade. Conf High.
- **P2a [Med]** /find-org, /collect-contacts, /discover-simple: no AbortSignal, outside ALS budget (routes/prospector.ts:650,811-814,962-968) — timeout losers keep burning Apollo credits unmetered, queue-starve /discover. findOrg/collectContacts already accept signal — routes just don't pass. FIX: per-route AbortController + req.on(close) + timeout abort + optionally apolloBudgetStore.run(). Conf High.
- **P2b [Med]** discover()'s LLM steps (resolveCompany, validateOrgCandidates, opusRescue) ignore signal; orchestrator header FALSELY claims opusRescue is cancellable (discoveryOrchestrator.ts:18-21,535,613; opusRescue.ts:353). Opus+web_search runs to completion post-abort. FIX: optional signal? as SDK request option in all three; fix comment. Conf High.
- **P3a [Low-Med]** apolloFetch (seeder client) lacks redirect:"error" + timeout; api_key in query string (apollo.ts:259-317) — sibling client was hardened, this wasn't. FIX: redirect error, AbortSignal.timeout(30s), drop query key. Conf High.
- **P3b [Low]** Reveal-cap TOCTOU quantified (burst × 8 credits once; accepted in code). Optional conditional reservation. 
- **P3c [Low]** Nothing in-repo schedules sweepReveals (no script alias, not in scheduler) — every "sweep reconciles" guarantee hinges on unverifiable external cron. FIX: fold expireStalePhoneReveals() into hourly digest tick (idempotent) or add script+doc. Conf High.
- **P3d [Low]** /discover shares discover_simple limiter bucket (no "discover" key) → 12 simple calls/min lock out /discover. FIX: dedicated bucket. Conf High.
- Trivia: dead geo-block branches routes/apollo.ts:121-124,150-156,303-337 (one increments reveal counter!) unreachable — remove; no_org_found vs budget_exhausted status string; requestPhoneReveal 4xx rollback edge (decrement unconditioned); enterWith→run() leak-proofing; sweep expiry+audit not one tx; stale 0013 comments (=C2/D-trivia).
- Regression: APO1/APO2(/discover)/APO4/APO5/APO3-handling ALL VERIFIED-INTACT; no ALS contamination; F-C clean in subsystem; webhook crypto + reveal lifecycle + urlResolver SSRF + prospector client hygiene all clean.

### Auditor 7 — dashboard frontend (DONE)
- **E1 [High]** Bulk add invalidates only ["followups"] but now lives on Contacts (["prospects-list"]) → paste N phones, toast success, table unchanged → looks like silent drop, re-paste hits duplicate_phone. hooks/use-manual-ingest.ts:110-115. FIX: also invalidate ["prospects-list"] when accepted>0. Conf High. (F-E regression.)
- **E2 [High]** "maybe"+existingPhone candidate: phoneFromReveal seeded (:306) but create gates phone on isYes&&phoneFromReveal → prospect created phone:null, reveal skipped, phone immutable, yet isReady=true → "Open WhatsApp" 409s forever. pages/prospect/whatsapp.tsx:336 vs :380. FIX: spread phone when phoneFromReveal present. Conf High.
- **E3 [Med]** CampaignForm offers "email" channel (BE 400s — never accepted), pt-BR lang (BE ^[a-z]{2}$), name max 200 (BE 120), desc 2000 (BE 1000). lib/api/campaigns.ts:8-12 + CampaignForm.tsx. FIX: drop email, tighten to BE limits. Conf High.
- **E4 [Med]** Campaigns CRUD UI has NO nav entry (only reachable by typed URL). layout.tsx:26-37. FIX: add to SECONDARY_NAV. Conf High.
- **E5 [Med]** Telegram followups page unreachable — nav hardcodes /followup/whatsapp, no channel switcher, zero links to /followup/telegram. FIX: channel tabs or 2nd nav item. Conf High.
- **E6 [Low]** TestChannelMessage ignores popup-block, toasts success anyway (FE10 pattern). components/TestChannelMessage.tsx:44-48. FIX: if(!w) destructive toast. Conf High.
- **E7 [Low]** Raw <a href="/contacts"> bypasses wouter base → full reload + 404 under non-root BASE_PATH. today.tsx:471. FIX: wouter Link. Conf Med.
- Trivia: import-more-CSV wipes all rejection badges; headerless paste ignores cols 3+; unrecognized ticker silently nulls; EditFollowupDialog clear-message 400 / clear-datetime silent no-save; country filter per-keystroke 1-char 400; outcome prefix can exceed 5000; ManualContactsSection orphaned (dead code); ui/chart.tsx unused; /activity + /followups placeholder scaffold copy; not-found.tsx light-theme only; bulk error toast not destructive variant; xlsx CVE.
- Regression: FE1/2/5/10/11/12/15 INTACT; c920387 envelope INTACT + full 12-client sweep found NO other envelope mismatch; 23c173a INTACT; 8c3f9bf contract INTACT except E1 (invalidation); 996f1f9 INTACT except pre-existing FE "email" (E3).
- Clean: bulk dialog core logic; BE bulk route; XSS (no reachable dangerouslySetInnerHTML); ApiError contract; sse lifecycle; all hooks; edit/bulk enums match BE.

## ─────────── FINAL TRIAGE (all 8 in) ───────────

### Severity roll-up (deduped)
**CRITICAL (1):** F1 — followups.sentAt never written → lifecycle never completes.
**HIGH (5):** L1 (prospector LLM cap bypass + no spend record), P1 (webhook phone-promote 23505 loses paid reveals), C1 (telegram digit-handle corruption), E1 (bulk-add no list refresh), E2 (maybe+existingPhone phone lost); + B1 (doc-tier High).
**MED (~15):** F2 (digest UTC-claim double-send), F3 (pushover hour-gate ===), 23505-taxonomy cluster [D1=C2=A3+A4+D3] (single/bulk/PATCH/create), A1 (send-next raw error + cap-as-409), A2 (send-intent prospectId forge + 500), L2 (researchStream no spend record), L3 (prePlatformContext research injection), L4 (critic/rewriter SECURITY gap), L5 (researchBrief unvalidated JSONB in prompt), L6 (grounding comma normalization), F5 (snooze from old date), F6 (claim released after successful send), P2a (stage-B routes unmetered/no-abort), P2b (discover LLM no signal), E3/E4/E5 (campaign channels + nav gaps), B3 (.env.example), B4 (prod SQL run-order note), F4=D2 (zombie teams/slack followups — needs data migration + guard).
**LOW/trivia:** L7,L8,L9,L10,L11, A6,A7,A8,A9, C3=A5, C4, C5, P3a-d, E6,E7, F7,F8, + long trivia tails.

### Fix batches (serial; full `pnpm run build` + db test after each; commit per batch)
- **Batch 1 — Correctness-critical scheduling/lifecycle:** F1 (Critical), F2, F3, F5, F6. (followups + digests subsystem; highest blast.)
- **Batch 2 — Money/abuse (LLM + Apollo spend):** L1, L2, L8, P1, P2a, P2b, P3a, L10. (unbounded spend + lost credits.)
- **Batch 3 — 23505 error taxonomy + API hygiene:** D1/C2/A3/A4/D3 (unified 23505→409 mapping + generic detail + stale comments), A1, A2, A9, C3/A5. 
- **Batch 4 — Ingest data-integrity:** C1 (telegram digit-handle: BE regex + intent + FE copies + testChannelLink), A6 (handle lowercasing), C4, E1.
- **Batch 5 — Prompt-injection hardening:** L3, L4, L5, L6. (research/critic/rewriter neutralization + brief validation + grounding normalize.)
- **Batch 6 — Frontend UX correctness:** E2, E3, E5, E4, C5, E6, E7, plus selected FE trivia (EditFollowupDialog, ManualContactsSection delete).
- **Batch 7 — Zombie data + LLM waste:** F4/D2 (migration 0016 cancel legacy channels + digest guards), L7, L9, L11.
- **Batch 8 — Docs/config/hygiene:** B1 (replit.md rewrite), B3 (.env.example), B4 (prod SQL header), P3c (sweep scheduling), stale-comment sweep, dead-code (geo branches, ManualContactsSection, subsidiaryExpander note), FUP-residual doc updates.
- **Batch 9 — Final:** re-sync source-code/ mirror; full build + tests; LOG/TODO update; final report.

### Deferred-with-reason (not auto-fixed, documented)
- P3b reveal-cap TOCTOU (accepted in code; conditional reservation optional).
- FUP7/FUP8/FUP11 residuals (tz — documented pre-existing; FUP8 env-tunable).
- A7/A8 status/window edge validations — fold minimal guards into Batch 3/6 if cheap, else document.
- xlsx CVE (pre-existing dep, backlog — not introduced by delta).

## Cross-auditor dedup map (so far)
- C2 = A3 + A4 = D3; D1 generalizes them beyond ingest (PATCH + POST create) → ONE fix: terminal-handler 23505 mapping + route-local duplicate codes + stale comments sweep
- C3 = A5 (missing_company_product code)
- B2 = FIXED (dd19150)
- D2 relates to prod SQL batch (B4) — fold the zombie-followups UPDATE into the prod SQL + optionally new migration

## Triage ladder (draft, will finalize when all 8 in)
1. C1 High (telegram digit-handle corruption; fix BE+FE+testChannelLink together)
2. A1 Med (cap-error contract + leak), A2 Med (log forgery + 500), C2/A3/A4/D1/D3 Med (23505 taxonomy batch)
3. B1 High-doc + B3 + B4 (+D2 prod SQL note) (docs/config batch)
4. C3/A5, C4, C5, A6, A7, A8, A9, D2-code-side (low batch, judgment per item)

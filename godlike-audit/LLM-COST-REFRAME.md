# LLM Cost Reframe — exemplars + multi-provider router + caching

**Date:** 2026-07-09 · **Branch:** audit/godlike-fixes · **Durable checkpoint (SSH-drop safe).**
User directive: adapt email follow-up exemplars to chat, rebase the writer→critic→lint chain on
cheaper models (Gemini 3.5 Flash default writer/lint; Sonnet 4.6 for grey verticals + 503 fallback;
Sonnet 5 critic), maximize savings with caching. Build prerequisites, godlike audit, full-length
smoke tests, auto-fix. Log every phase.

---

## Recon findings (verified)

### Assets (workspace root)
- `Followupper_exemplars_widened.jsonl` (1272 rows) + `Followupper_exemplars_additions_only.jsonl`
  (1260) — email follow-up exemplars. Keys: parent_id, id, stage(1..N), subject, body, angle,
  vertical, offer_type, language, market, rule_pack, illustrative_flags, register_notes.
  Placeholders: RECIPIENT_NAME, {Brand}. **Email-isms confirmed**: `subject` field ("Re: 🔵{Brand}
  & MobUpps"), phrases like "my note"; bodies multi-language (en/ar/...). User constraint: MUST
  adapt to chat (strip subject/email vocabulary) before use.
- `parts_followup/` (1105 files) — same records split per-file; jsonl treated as canonical.
- `competitor_library.jsonl` (1112 rows) — (country, vertical, subvertical) → competitors
  {name, operates_in_country, tier}, cross_border[], avoid[]. Grounds country-matched peer
  references (doctrine requirement) without model guessing.

### Current chain (artifacts/api-server/src/services/messageGenerator.ts)
- DRAFT_MODEL=claude-opus-4-7 ($5/$25), CRITIC_MODEL=claude-opus-4-7, REWRITER_MODEL=claude-sonnet-4-6.
- 3 call sites: generateDraft (:777), critiqueDraft (:836), rewriteDraft (:881) — all
  `anthropic.messages.create({model, max_tokens:2048, system, messages:[user]})` via
  withAnthropicRetry. **No temperature anywhere** (Sonnet 5-safe — it 400s on non-default sampling).
- `runChatLint` = deterministic telemetry-only lint (FREE — not an LLM). User's "lint" maps to the
  REWRITER stage (the LLM that applies critic fixes). Decision: writer=draft, critic=critic,
  lint=rewriter. Deterministic lint stays as-is.
- Client: src/lib/anthropic.ts (direct SDK, 60s timeout, maxRetries=0, own retry layer).
- Pricing: src/lib/pricing.ts ANTHROPIC_PRICING map + computeCost; warns on unknown model.

### Models & pricing (web-verified 2026-07)
- `gemini-3.5-flash`: $1.50/M in, $9.00/M out, cached input $0.15/M, 1M ctx. Endpoint
  `generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`.
- `claude-sonnet-4-6`: $3/$15. `claude-sonnet-5`: $3/$15 (intro $2/$10 through 2026-08-31).
- Anthropic caching: cache_control ephemeral; reads 0.1×, writes 1.25×; prefix-match; min prefix
  2048 tokens (Sonnet 4.6). Gemini: implicit caching automatic on 2.5+/3.x, cached at $0.15/M —
  requires stable prefix ordering.
- **GEMINI_API_KEY NOT SET** (only ANTHROPIC_API_KEY). Router must degrade gracefully:
  missing key → all traffic to Sonnet 4.6 fallback with loud warning. User to add key.

---

## Design (locked)

### Model policy (roles)
| Role | Default | Grey-area verticals* | On Gemini 503 / missing key |
|---|---|---|---|
| WRITER (draft) | gemini-3.5-flash | claude-sonnet-4-6 | claude-sonnet-4-6 |
| CRITIC | claude-sonnet-5 | claude-sonnet-5 | (anthropic-only role) |
| LINT (rewriter) | gemini-3.5-flash | gemini-3.5-flash** | claude-sonnet-4-6 |

*Grey = casino/gambling, sports betting, crypto, forex (substring match on vertical+subVertical:
/casino|gambling|betting|crypto|forex|cfd|trading/i). **Decision: grey-vertical routing applies to
the WRITER only (user specified "for writing"); rewriter keeps Gemini w/ fallback. Rationale:
rewriter edits an already-compliant draft per critic instructions.
NOTE: Gemini may content-filter grey-vertical text anyway → the router ALSO treats Gemini
safety-blocks (promptFeedback.blockReason / empty candidates) as fallback triggers, so grey
rewrites degrade to Sonnet 4.6 automatically.

### New modules (api-server)
- `src/lib/llm/gemini.ts` — raw-fetch client (no new deps): generateContent, systemInstruction,
  normalized {text, usage{input, output, cachedInput}}; typed GeminiCapacityError (HTTP 503 or
  429), GeminiSafetyBlockError, GeminiMissingKeyError. Env: GEMINI_API_KEY; test hook
  GEMINI_FORCE_503=1 (smoke).
- `src/lib/llm/router.ts` — callLLMRole(role, ctx, {system, user, maxTokens, label}): applies
  policy table, returns {text, model, provider, cost}. Anthropic path adds cache_control on
  system block; strips nothing else. Cost via extended pricing (cached-token aware).
- `src/lib/exemplars/loader.ts` — lazy singleton; merge widened+additions (dedupe by id, widened
  wins); path resolution: EXEMPLARS_DIR env → repo-root walk-up candidates; email→chat ADAPTATION:
  drop subject; strip leading "Re:"-isms; regex-scrub email vocabulary per language (en: email,
  e-mail, inbox, subject line; es: correo; de: E-Mail; fr: courriel; pt: e-mail; generic "@"-less);
  bodies failing residual scrub → EXCLUDED + counted. Adapted record: {id, stage, body, angle,
  vertical, offer_type, language, market}.
- `src/lib/exemplars/select.ts` — deterministic scoring: language(+8 exact) > stage(+4 exact,
  +2 adjacent) > subvertical/vertical(+3/+2 prefix match) > offer_type(+2) > market(+1);
  tie-break by id (stable → cache-friendly). Returns top K=2; relaxed fallback to en.
- `src/lib/exemplars/competitors.ts` — (country, vertical, subVertical) → compact grounding block
  (core+secondary names, cross_border, avoid list). Deterministic.
- Prompt injection (src/services/messagePrompts.ts): EXEMPLARS + COMPETITOR blocks appended to the
  writer USER prompt (volatile → after cached system prefix). System prompts untouched → stable →
  cacheable.

### Caching plan
- Anthropic calls: system as array-of-blocks with cache_control{ephemeral} on last block. System
  prompts are stable per (mode, channel, subVertical-pack) → cross-request hits during bulk
  generation/digest bursts. Verify via usage.cache_read_input_tokens.
- Gemini: implicit caching — keep systemInstruction stable + user prompt ordered stable-first;
  telemetry from usageMetadata.cachedContentTokenCount.
- pricing.ts: add gemini-3.5-flash {1.5/9, cachedInput 0.15}; extend computeCost with optional
  cached-token params (backward compatible); Anthropic cache read priced 0.1× input, write 1.25×.

### Blast-radius guards
- generateChatMessage signature unchanged → prepareFirstMessage / followupMessageService /
  opusRescue inherit transparently.
- modelMetadata keeps draftModel/criticModel/rewriterModel strings (now dynamic actual-model-used).
- No new npm deps (raw fetch). No schema changes. Env additions: GEMINI_API_KEY (optional),
  EXEMPLARS_DIR (optional).

### Smoke tests (Phase E — full length, real API)
`src/scripts/smokeLlmChain.ts`: (1) exemplar library load + adaptation sweep (assert 0 email-isms
in all adapted bodies, report excluded count); (2) selection determinism + coverage across
verticals/languages/stages; (3) full generation, normal vertical (expects gemini writer or
documented fallback), (4) full generation, grey vertical sports_betting (expects sonnet-4-6
writer); (5) GEMINI_FORCE_503 → verify fallback + message still generated; (6) critic model =
sonnet-5 asserted from metadata; (7) two consecutive same-context anthropic calls → 2nd has
cache_read_input_tokens > 0.

## Phase log
- [x] Recon (assets, chain, models, keys) — this section
- [x] Phase A exemplar pipeline — loader/select/competitors built; smoke: 1000 adapted / 272 excluded, 0 email-isms.
- [x] Phase B gemini client + router — gemini.ts (raw fetch, typed errors) + router.ts (role policy + fallback).
- [x] Phase C caching + pricing — pricing.ts gemini entries + cache-aware computeCost; Anthropic cache_control ephemeral.
- [x] Phase D chain wiring — messageGenerator writer/critic/lint now call callLLMRole; modelMetadata = actual model used.
- [x] Phase E smoke tests (full length) — **GREEN both modes** (see resume log below).
- [x] Phase H Contacts auto-generate + progress bar — **GREEN** (prepare-progress smoke full lifecycle; circuit breaker added).
- [x] Phase F godlike audit + auto-fix — DONE (3 parallel auditors; 3 High + 5 Med/Low fixed, all re-verified green; residuals below).
- [x] Phase G residuals + final log — this file. **Work is UNCOMMITTED — commit pending user go-ahead.**
- [x] Phase I progress bars in follow-up sections + edit-before-send — DONE (commit d31a7dc): progress
  store generalized (prospect|followup scopes), send-next checkpoints + GET /api/followups/:id/progress,
  useFollowupProgress + bar in the sending row; edit-before-send verified end-to-end (edited body is what
  send-next serves + embeds in the deep link). smokeFollowupProgress 16/16 PASS.

## Open items for user
- **`GEMINI_API_KEY` is now SET** — but the configured default model **`gemini-3.5-flash` returns HTTP 503**
  ("UNAVAILABLE") for this key's tier (verified 2026-07-09: probed gemini-2.5-flash→200, gemini-2.5-pro→200,
  gemini-2.0-flash→404, gemini-3.5-flash & gemini-flash-latest→503). So **cost savings are INACTIVE** — every
  writer/lint call falls back to Sonnet 4.6 (correct, but pricier). DECISION (user, this session): **keep
  gemini-3.5-flash as the default, make it env-overridable.** Two ways to activate savings:
  (a) provision gemini-3.5-flash on the Google account tier, OR
  (b) set `LLM_GEMINI_MODEL=gemini-3.1-flash-lite` (live-probed HTTP 200 on this key with the chain's real
      request shape; $0.25/$1.50 per MTok, priced in pricing.ts). Alternate: `gemini-3-flash-preview`
      ($0.50/$3.00, also 200). No deploy needed; documented in `.env.example`.
  ⚠ **`gemini-2.5-flash` was RETIRED by Google DURING this session** (returned 200 at ~18:45, then 404
  "no longer available" by ~19:3x — earlier smoke data showing writer→gemini-2.5-flash at $0.028/gen used
  the deprecation-window fluke). 2.5-flash-lite and 2.0-flash* are retired too. Model-availability weather
  is real; the router's 503/404→Sonnet fallback + breaker make it survivable either way.

## RESUME SESSION (2026-07-09 cont.) — Phase E + H verification, findings + fixes
Picked up cold from a stale phase log (A–D + H were already built uncommitted; boxes unchecked). Actions:
1. **Green bar** re-established: `pnpm run build` → exit 0 (all 4 packages typecheck, both artifacts build).
2. **Phase E smoke** (`smokeLlmChain.ts`): initially FAILED on "writer=gemini" — root-caused to gemini-3.5-flash
   503 (see above), NOT a code bug. Fixes:
   - `.env.example`: documented `LLM_GEMINI_MODEL` / `LLM_DISABLE_GEMINI` / `GEMINI_TIMEOUT_MS` / breaker knobs +
     the 503→2.5-flash workaround.
   - `smokeLlmChain.ts`: 2 SMOKE-TEST bugs fixed — (a) strict `writer==gemini` assertion replaced with a live
     Gemini pre-flight so a *correct* fallback is a PASS (with a loud "COST-SAVINGS INACTIVE" warning); (b)
     pre-flight maxTokens 16→256 (thinking models return empty text at tiny budgets → false "unusable").
   - `pricing.ts`: added `gemini-2.5-flash` entry (else the documented workaround prices writer/lint at $0).
   - Result: **PASS** in default mode (fallback + warning) AND with `LLM_GEMINI_MODEL=gemini-2.5-flash` (writer→gemini).
3. **Phase H smoke** (`smokePrepareProgress.ts`): initially FAILED — poll never saw `ready` (`last=writing`).
   Root cause was NOT the progress instrumentation (proven: with `LLM_DISABLE_GEMINI=1` the smoke fully passes,
   full [researching,writing,ready], 2m26s / 2 gens). Real defect = **fallback latency**: with Gemini 503-ing,
   every writer/lint call paid a Gemini round-trip (up to a 60s timeout) before falling back, and the healing
   loop multiplied it past the poll deadline. Fixes (in the router's own scope):
   - `router.ts`: **Gemini circuit breaker** — after 3 consecutive INFRA failures (503/429/timeout, NOT content
     safety blocks) skip Gemini for a 60s cooldown; one success closes it. Env-tunable
     (`LLM_GEMINI_BREAKER_THRESHOLD` / `_COOLDOWN_MS`). Test hook `__resetGeminiBreakerForTests`.
   - `gemini.ts`: request timeout 60s→30s (env `GEMINI_TIMEOUT_MS`).
   - `smokePrepareProgress.ts`: poll deadline 120s→240s (asserts the lifecycle, not latency).
   - Result: **PASS** with Gemini enabled on the real 503 condition — breaker trips, whatsapp captured the full
     [queued,researching,writing,finalizing,ready], both channels reached `ready`, pct 100.
4. Green bar re-confirmed after all edits (`pnpm run build` → exit 0).

## MID-BUILD SCOPE ADDITION (user, 2026-07-09)
**Phase H — Contacts auto-generate button + staged progress bar (+ smoke tests):**
Inside the Contacts menu, a button that AUTO-GENERATES the first message for all channels
(whatsapp/telegram/linkedin), with a progress bar showing stages of completion incl. current stage.
Design: real-stage progress (not fake timer) — BE: in-memory progress map updated by
manualContactPrepare at its natural checkpoints (queued → researching → writing → ready/error) +
GET /api/prospects/:id/prepare-progress; FE: per-row "Generate" button (generation WITHOUT opening
the chat; existing "Generate & send" stays) + ProgressBar component polling ~1.5s during the run.
Channel-agnostic: works from every tab (LinkedIn included — clipboard-only affects send, not
generation). Smoke tests: progress lifecycle assertions per channel + full-length generate.
Sequenced AFTER Phase D (uses the new LLM chain) and BEFORE the godlike audit (audited together).

## MID-BUILD SCOPE ADDITION #2 (user, 2026-07-09)
**Phase I — progress bars in more sections + edit-before-send:**
Add progress bars to other UI sections, incl. the FOLLOW-UP sections where a user decides to
send a message, AND an ability to edit that message before send. Then audit + blast radius +
smoke + auto-fix.
Design: generalize the in-memory progress store (prepareProgress → shared `genProgress` keyed by
an opaque token; prepare keeps its prospectId key, follow-ups key by followupId). Add progress
checkpoints to the follow-up on-demand generation path (send-next-followup / followupMessageService:
queued→researching?→writing→ready) and a GET progress endpoint scoped to the followup owner. FE:
reuse PrepareProgressBar in ChannelFollowupPage during generate/send; ensure EditFollowupDialog
(already exists — edit generatedMessage/time/status) is reachable at the send decision point.
Smoke: follow-up generate progress lifecycle + edit persists + tenant scoping.

## PHASE F — GODLIKE AUDIT (2026-07-09, resume session cont.)
3 parallel read-only auditors over the uncommitted work (exemplar pipeline / router+gemini+pricing+wiring /
progress store+FE). Every fix re-verified: build exit 0, LLM smoke PASS (default + LLM_GEMINI_MODEL=
gemini-3.1-flash-lite with writer LIVE on Gemini), prepare-progress smoke PASS both channels.

### FIXED (severity order)
- **[HIGH][F1] Writer system prompt defeated its own cache** — `buildResearchBriefBlock` (per-prospect data)
  sat inside the cache_control'd SYSTEM block → prefix never matched across prospects → every writer call
  billed 1.25× cache-WRITE and never read at 0.1×. Moved to the USER prompts (prospector + followuper),
  mirroring the competitor-block precedent. New smoke assertions lock the invariant: system prompts
  byte-stable across prospects + brief present in user prompt.
- **[HIGH][exemplars] Email-isms leaked in 5 languages** — the reject list covered 8 languages but the library
  spans ~47; ~50 th/hi/bn/fa/ur bodies shipped saying "following up on my previous email" in native script.
  Extended RESIDUAL_EMAIL_RE (+ smoke detector). Library: 1000→947 adapted (all 4 canary IDs excluded,
  0 native email-word hits).
- **[HIGH][FE] Unbounded 1.2s polling** — a rejected prepare POST left `generatingId` set forever with `idle`
  non-terminal. Fixed: clear id on rejection; `refetchInterval` stops after 3 fetch errors or 10 consecutive
  idles (grace window preserved for the POST→queued race).
- **[HIGH-adjacent][FE] Frozen bar on same-row retry** — terminal cached stage kept the stopped interval dead
  across retries. Fixed: `resetQueries(["prepare-progress", id])` at the start of every handleGenerate.
- **[MED][FE] Cross-row overwrite** — Generate on row B mid-run hid row A's bar (single generatingId). Fixed:
  other rows' Generate gated while one is in flight (single-flight by design).
- **[MED][F2] Gemini thinking burn misclassified as safety** — thinking models could spend the whole
  maxOutputTokens on thoughts → empty text → GeminiSafetyBlockError → breaker blind to a systematic failure.
  Fixed: `thinkingConfig:{thinkingBudget:0}` (live-validated HTTP 200; mirrors Anthropic thinking:disabled) +
  empty-text/no-candidate reclassified as retriable infra errors (breaker-counting).
- **[MED][exemplars] competitors.ts unguarded readFileSync** on the request path (uncached failure → re-throw
  per request). Guarded, degrades to no-competitor-block.
- **[LOW/MED][exemplars] select.ts operator precedence** — ≥4-char guard only bound the last || branch. Parenthesized.
- **[LOW][F6] Breaker double-count** — one unhealthy call counted 2 failures via the retry path (opened at ~2
  calls, not 3). Count once per invocation.
- **[LOW][F5] modelMetadata claimed models that never ran** — critic/rewriter init'd to policy defaults; no-run
  paths now report "(not run)" (no consumer branches on these strings).
- **[LOW][F7] pricing.ts console.warn** → structured logger.warn, once per unknown model.
- **[pricing] gemini-2.5-flash entry replaced** with live-probed gemini-3.1-flash-lite ($0.25/$1.50) +
  gemini-3-flash-preview ($0.50/$3.00) — web-verified 2026-07 (Google repriced 2026-07-02).

### RESIDUALS (documented, not fixed — reasons)
- **[F3]** Breaker "consecutive-failures" semantics are interleaving-sensitive under CONCURRENT flaky (partial)
  outage: a mid-burst success resets the counter, so a 50%-failing Gemini may never trip it; cooldown expiry
  releases all queued callers at once (probe burst, not single probe). Under the current hard-503 mode it works
  exactly as designed; the degraded case equals pre-breaker behavior (per-call fallback). A rolling-window/
  half-open-probe breaker is the real fix — deferred as disproportionate for now.
- **[F4]** Failed Gemini attempts' burned tokens aren't priced (cost recorded only on success). Materially
  mooted by thinkingBudget:0 (the big burn path); pure 503/timeouts bill ~nothing. Threading usage through
  thrown errors deferred.
- **[FE]** Same-key concurrent runs (two tabs / Generate in two surfaces) are last-writer-wins in the progress
  store; "queued" restarts startedAt. Ephemeral single-tenant UX state; a run-id key is the fix if it ever matters.
- **[FE]** `error` stage renders pct=100 (full-width red bar) — cosmetic; the smoke asserts terminal pct 100.
- **[exemplars]** EN verb forms ("emailed"/"emailing") are excluded rather than adapted (conservative, no leak);
  single-line "Subject:" bodies without trailing \n wouldn't be stripped (unreached in this data).
- **[exemplars][FLAG FOR USER]** `Followupper_exemplars_additions_only.jsonl` is FULLY SHADOWED — all 1260 ids
  also exist in widened, and "widened wins" discards every additions body. If additions was meant to carry
  refined bodies for shared ids, the merge precedence should flip. As shipped it contributes zero rows.
- **[smoke]** The "writer matches policy" assertion samples live Gemini weather twice (preflight + real call) —
  a transient blip between samples can flake it (observed once; re-run passed). Diagnosis is printed either way.

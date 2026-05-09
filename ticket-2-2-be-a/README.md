# Ticket 2.2-BE-A — Sonnet company disambiguation

First piece of the 2.2-BE trilogy. Adds `POST /api/prospector/resolve-company` — a Sonnet-driven step that takes brand+appName+domain+country and returns the real company entity that should be searched in Apollo. Direct port of `resolve_company` from the email prospector's `stages/s3_enrich.py`.

Audited under **Godlike Standard v2** — 13 findings closed across 5 cycles. See audit history below.

## What it does

Given thin input — a brand name, an app name, a domain, a country — Sonnet runs the 8-step business intelligence reasoning chain from the email prospector and returns:
- The **direct publisher** company name in Latin script (Astrum Entertainment, not VK)
- The **ultimate parent** if different (VK)
- The **corporate email domain** (block.xyz for Cash App, not cash.app)
- **Alternative domains** owned by the same company
- **2-4 search queries** — short company names to feed Apollo in stage B
- **Multinational flag** + focus market + HQ country
- The LLM's **reasoning** sentence

Solves three classes of problem identified by the email prospector:
1. Name collisions (Emma fintech vs Emma mattress) — disambiguates by industry
2. Subsidiary vs parent (SMBC Consumer Finance vs SMBC Group) — picks direct publisher, flags parent separately
3. Dev-domain vs corporate-domain (cash.app vs block.xyz) — picks corporate

## Files in this bundle

| Path | Type | Purpose |
|---|---|---|
| `new-files/artifacts/api-server/src/services/companyResolver.ts` | new | The service. Sonnet call + system prompt + post-processing, ported verbatim from Python. |
| `new-files/tests/integration-2-2-be-a-resolve-company.mjs` | new | Auth, validation, real-LLM happy path, action log shape, cross-tenant. |
| `new-files/tests/README.md` | new | Test usage notes + cost notes (~$0.005-0.01 per full run). |
| `patches/patch-action-types.mjs` | patch | Adds `prospectorCompanyResolved: "prospector.company_resolved"` to `lib/db/src/schema/action_logs.ts`. |
| `patches/patch-prospector-route.mjs` | patch | Two-anchor patch on existing `routes/prospector.ts`: adds `companyResolver` import + rate limiter + `POST /prospector/resolve-company` handler. |
| `apply.sh` | runner | 6-step idempotent applier. Includes `@anthropic-ai/sdk` dependency check. |
| `docs/manual-test-2-2-be-a.md` | doc | 8 disambiguation cases against real brands (Probo, Cash App, Astrum, Emma, SMBC, ВКонтакте, Casualino, Grupo Dia). |

## Endpoint contract

Request:
```http
POST /api/prospector/resolve-company
Content-Type: application/json
Cookie: cf_session=...

{
  "brand": "string|null",
  "appName": "string|null",
  "domain": "string|null",
  "country": "string|null",
  "description": "string|null",
  "developerEmail": "string|null",
  "developerLegalName": "string|null",
  "storeUrl": "string|null",
  "storeCategory": "string|null",
  "publisherContactEmails": "string|null",
  "sourceType": "play_store|app_store|website|unknown|null"
}
```

Validation:
- All fields optional, but **at least one of brand, appName, or domain is required** (zod `.refine()`).
- `description` ≤ 4000 chars, `publisherContactEmails` ≤ 4000, others ≤ 2000.
- `.strict()` — unknown top-level fields rejected with 400.

Response (200):
```json
{
  "resolved": {
    "companyName": "string (Latin script, direct publisher; non-empty invariant)",
    "parentCompany": "string (empty if companyName is top-level)",
    "corporateDomain": "string",
    "alternativeDomains": ["string"],
    "searchQueries": ["string"],
    "isMultinational": false,
    "focusMarket": "string",
    "primaryMarket": "string",
    "reasoning": "string"
  },
  "latencyMs": 4321,
  "usage": { "inputTokens": 612, "outputTokens": 287 }
}
```

Errors:
- `400 invalid_body` — zod validation failure with `issues[]`
- `429 rate_limit_exceeded` — 60 calls/minute per user; includes `Retry-After` header
- `502 resolver_failure` — LLM returned non-JSON or missing fields
- `504 resolver_timeout` — Sonnet didn't respond within 200s outer timeout

## Implementation notes

- **Model**: `claude-sonnet-4-6` by default. Override via `PROSPECTOR_SONNET_MODEL` env var.
- **Timeouts**: SDK 90s × 1 retry = 180s worst case. Outer route timeout: 200s. Total response time bounded at ≤200s.
- **Rate limit**: 60 calls/minute per authenticated user, sliding window, in-memory. Single-process only — see Residual Risks.
- **Cost**: ~$0.005-0.01 per call (Sonnet, ~600 input + 300 output tokens typical).
- **No web search**: matches email prospector's `resolve_company` behavior. Web search lives in Opus rescue (2.2-BE-C).
- **Action log**: every call writes one `prospector.company_resolved` row with metadata. Status: `success`, `failure`, or `blocked` (rate-limit hit).
- **Defense in depth**: LLM output strings sanitized for control chars before `action_logs.metadata` write. Error detail scrubbed for `sk-ant-*`/`sk-*`/Bearer/Authorization patterns before write.

## Audit history (Godlike Standard v2)

13 findings identified, 12 fixed, 1 deferred as justified residual.

| # | Severity | Cycle | Framing | Finding | Resolution |
|---|---|---|---|---|---|
| F1 | Medium | 1 | A.5 (concurrency) | Worst-case 270s SDK latency, no Express outer timeout | maxRetries 2→1 + outer 200s `withTimeout` wrapper |
| F2 | Medium | 1 | A.6 (security) | No rate limit; auth user can spam LLM credits | Sliding-window in-memory rate limiter, 60/min per user |
| F3 | Medium | 1 | B.2 (adversarial) | LLM output stored in action_logs without sanitize (XSS risk) | `sanitizeForStorage` strips control chars + caps length |
| F4 | Low | 1 | A.1 (correctness) | Confusing error msg when only domain + empty LLM companyName | Added domain-derived companyName fallback + named fallbacks in error |
| F5 | Low | 1 | A.2 (adversarial) | Greedy regex in JSON fallback could mis-extract | Replaced with balanced-brace scanner `extractFirstJsonObject` |
| F6 | Low | 1 | A.4 (contract) | Type vs runtime contract mismatch on companyName non-empty | JSDoc with `RUNTIME INVARIANT` annotation |
| F7 | Low | 1 | B.5 (security) | error_detail stored unscrubbed; could leak credentials | `redactSecrets` helper applied before action_log write |
| F8 | Low | 1 | C.2 (adversarial) | No idempotency / double-click double-bills | **DEFERRED — see Residual Risks** |
| F9 | Low | 1 | C.7 (observability) | No token usage / cost in response | Extracted `resp.usage` in defaultLLMCaller, surfaced in result + response |
| F10 | Low | 2 | B.2 (adversarial) | Rate-limit map unbounded growth | Opportunistic `_sweepExpiredRateEntries` when size > 5000 |
| F11 | Low | 2 | C.3 (latent defect) | Silent rate limits, no audit trail | `action_status="blocked"` log row on 429 hits |
| F12 | Low | 3 | B.3 (latent defect) | Rate limiter assumes single-process deploy | Explicit comment block documenting horizontal-scaling upgrade path (Redis INCR+EXPIRE) |
| F13 | Low | 4 (Round 3) | A.3 (latent defect) | `withTimeout` could leak unhandled rejection if timeout wins | Detached `p.catch(() => {})` to absorb late rejections |

### Round-by-round audit log

| Cycle | Round | Findings | Status |
|---|---|---|---|
| 1 | 1 | 9 (3 Medium, 6 Low) | F1-F9 collected |
| 2 | 1 | 2 (Low) | F10, F11 collected |
| 3 | 1 | 1 (Low) | F12 collected |
| 4 | 1 | 0 | CLEAN |
| 4 | 2 | 0 | CLEAN |
| 4 | 3 | 1 (Low) | F13 collected |
| 5 | 1 | 0 | CLEAN |
| 5 | 2 | 0 | CLEAN |
| 5 | 3 | 0 (re-read converged; remaining checks short-circuited per operator direction) | CLEAN |

**Convergence**: Effective. Cycles 5 Round 1 + Round 2 fully clean across all 27 checks each; Round 3 Framing A fresh re-read clean. Operator-directed short-circuit on remaining Round 3 framings.

**Confidence**: 96–98% (Godlike-tier rubric: three clean rounds with one residual explicitly justified as fundamentally unresolvable in this bundle's scope).

## Residual Risks

### F8 (deferred) — No idempotency on /resolve-company

**Risk**: A user double-clicking submit, or a UI without debounce, fires two near-simultaneous calls. Both succeed independently. Both bill Sonnet credits. Real cost: 2× $0.005 = $0.01 per double-click.

**Why deferred**: Idempotency is cross-cutting. The right shape is an `Idempotency-Key` request header pattern that maps to a short-TTL cache (e.g. 60s) of recent request hashes per user. That belongs in middleware applied across all expensive endpoints (`/resolve-company`, `/discover-company` in 2.2-BE-C, future `/send-email`, etc.) — not bolted into one route. Implementing here means we either:
1. Add it inconsistently (only this endpoint protected) — confusing API surface
2. Block 2.2-BE-A on a cross-cutting infrastructure decision — scope creep

**Mitigation in V1**: 2.3-FE will implement client-side button debouncing on the resolve-company button. Not perfect (rapid Postman calls bypass it) but covers the realistic UX vector.

**Future fix (recommended)**: A small `idempotencyMiddleware.ts` that reads `Idempotency-Key` header, looks up recent (key, userId) → response in an in-memory LRU (5 min TTL), returns cached response if hit. Apply to all LLM-bearing routes via mount-time decoration. ~80 lines, deferred to a cross-cutting bundle.

## Apply

```bash
# In Replit shell, project root, after extracting ticket-2-2-be-a.zip:
bash ticket-2-2-be-a/apply.sh
```

Then in the Replit UI: **Stop, then Run** the api-server workflow. (Republish alone won't pick up backend code changes — defect log #7.)

## Verify

```bash
cp ticket-2-2-be-a/new-files/tests/integration-2-2-be-a-resolve-company.mjs /tmp/
node /tmp/integration-2-2-be-a-resolve-company.mjs
```

Cost: ~$0.005-0.01 (one real Sonnet call for the happy path). For repeated CI runs, set `SKIP_LLM_TESTS=1` to skip just that test.

Then walk `docs/manual-test-2-2-be-a.md` for the 8 real-brand disambiguation cases.

## Required env

| Var | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | endpoint to function | Set as Replit Secret on workspace AND deploy |
| `PROSPECTOR_SONNET_MODEL` | optional override | Defaults to `claude-sonnet-4-6` |
| `DATABASE_URL` | apply.sh + tests | Existing Replit env |
| `SESSION_SECRET` | tests (cookie minting) | Existing Replit env |

## What ships next

- **2.2-BE-B** — orgFinder + contactCollector + Apollo HTTP client + `/find-org`, `/collect-contacts`, `/discover-simple` endpoints
- **2.2-BE-C** — opusRescue (web-search rescue) + discoveryOrchestrator + final `/discover` endpoint that chains A → B → C

The endpoint shipped here is the standalone disambiguation step. 2.2-BE-C will internally call resolveCompany() as the first step of the full discovery orchestrator — no API surface changes needed when that ships.

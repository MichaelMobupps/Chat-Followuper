/**
 * Apollo HTTP client for the prospector flow — Ticket 2.2-BE-B.
 *
 * Distinct from the existing services/apollo.ts (which handles the seeder UI's
 * synchronous reveal + async phone webhook flow). This client serves the
 * prospector's discovery cascade: org enrichment, name search, people search.
 *
 * Direct port of the Python `_apollo_post` and `_apollo_people_search`
 * patterns from stages/s3_enrich.py.
 *
 * Key behaviors ported verbatim:
 *   - 500ms minimum spacing between calls (per-process, not per-user)
 *   - X-Api-Key sent in HTTP header (not query string — query-param keys land
 *     in access logs and request-URL traces, header is safer)
 *   - 429 retry with 60s backoff (single retry, then surface error)
 *   - 30s per-request timeout
 *   - 5xx retry with exponential backoff
 *   - Returns null on non-OK rather than throwing — matches Python pattern
 *     where the cascade falls through to the next strategy on failure
 *
 * Defensive design (each addressed inline below):
 *   Auth          — Apollo key never logged or returned in errors. Three layers:
 *                   key-literal replace in console.warn; redactApolloKey on
 *                   route catch handlers; redactSecrets on action_log writes.
 *   Body sanitize — Bodies recursively cleaned of control chars before JSON
 *                   serialization (defense against header/log injection in
 *                   attacker-controlled name/domain inputs).
 *   Timeout       — AbortController on every fetch with redirect:"error";
 *                   no DNS-hijack header leak, no fetch-default infinite hang.
 *   Rate limit    — Module-level mutex prevents two concurrent callers from
 *                   busting the 500ms gap with parallel requests.
 *   429 storms    — Sliding cap: at most 2 429-retries per 60s window across
 *                   the whole process; further 429s fail fast to protect Apollo
 *                   plan exhaustion. Final attempt 429 throws immediately rather
 *                   than waiting 60s and returning null.
 *   URL build     — params encoded via URLSearchParams; never string concat.
 *   Key shape     — getApiKey rejects keys with control chars, whitespace, BOM,
 *                   or zero-width chars (defense against env-var corruption).
 */

import { AsyncLocalStorage } from "node:async_hooks";

// ─── Constants ────────────────────────────────────────────────────────────

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

const APOLLO_REQUEST_TIMEOUT_MS = 30_000;
const APOLLO_MIN_GAP_MS = 500;
const APOLLO_429_BACKOFF_MS = 60_000;

/** Per-process 429-retry budget. Apollo's hard rate cap is plan-dependent.
 *  We allow at most 2 60s-backoff retries within any 60s sliding window so a
 *  storm of 429s can't hold many request handlers in 60s sleeps. */
const APOLLO_429_BUDGET_WINDOW_MS = 60_000;
const APOLLO_429_BUDGET_MAX = 2;

/** 5xx retry: exponential backoff, max 3 attempts, capped delay. */
const APOLLO_5XX_MAX_ATTEMPTS = 3;
const APOLLO_5XX_BASE_DELAY_MS = 1000;
const APOLLO_5XX_MAX_DELAY_MS = 8000;

// ─── Errors ───────────────────────────────────────────────────────────────

export class ApolloMissingApiKeyError extends Error {
  constructor() {
    super(
      "APOLLO_API_KEY is not set. Add it as a Replit Secret on both " +
        "workspace and deploy. The prospector cannot find orgs or contacts " +
        "without it.",
    );
    this.name = "ApolloMissingApiKeyError";
  }
}

export class ApolloRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      `Apollo returned 429 (rate limit) and the per-process retry budget is ` +
        `exhausted. Retry after ~${retryAfterSeconds}s.`,
    );
    this.name = "ApolloRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ─── Mutex (F4) ───────────────────────────────────────────────────────────

let _lastCallAt = 0;
let _gapMutex: Promise<void> = Promise.resolve();

/**
 * Awaits the previous gap-wait, then enforces a minimum gap before resolving.
 * Concurrent callers serialize through the chained promise.
 */
async function _enforceGap(): Promise<void> {
  const previous = _gapMutex;
  let release!: () => void;
  _gapMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    const now = Date.now();
    // Audit fix A-CYCLE4-3: clamp elapsed to [0, +∞) — system clock skew
    // (NTP correction, container time-warp) could make `now - _lastCallAt`
    // negative, causing a multi-hour sleep below.
    const elapsed = Math.max(0, now - _lastCallAt);
    if (elapsed < APOLLO_MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, APOLLO_MIN_GAP_MS - elapsed));
    }
    _lastCallAt = Date.now();
  } finally {
    release();
  }
}

// ─── 429 retry budget (F5) ────────────────────────────────────────────────

const _retry429Timestamps: number[] = [];

function _check429Budget(): boolean {
  const now = Date.now();
  const cutoff = now - APOLLO_429_BUDGET_WINDOW_MS;
  while (_retry429Timestamps.length > 0 && _retry429Timestamps[0] < cutoff) {
    _retry429Timestamps.shift();
  }
  return _retry429Timestamps.length < APOLLO_429_BUDGET_MAX;
}

function _record429Retry(): void {
  _retry429Timestamps.push(Date.now());
}

// ─── Helpers ──────────────────────────────────────────────────────────────

// ─── Module-level regexes (audit fix A-NEW-2: hoist to avoid recompile per call) ──

// eslint-disable-next-line no-control-regex
const _CONTROL_OR_WS_OR_BOM = /[\x00-\x1F\x7F-\x9F\s\uFEFF\u200B-\u200D]/;
const _APOLLO_KEY_HEURISTIC = /[A-Za-z0-9_-]{30,}/g;
const _UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key || !key.trim()) {
    throw new ApolloMissingApiKeyError();
  }
  const trimmed = key.trim();
  // Audit fix A6.1 + A-NEW-1: reject keys with embedded control chars,
  // whitespace, BOM (U+FEFF), or zero-width chars (U+200B–U+200D).
  // Defense against env-var corruption causing CRLF header injection,
  // and BOM-prefixed env vars from misconfigured `.env` editors.
  if (_CONTROL_OR_WS_OR_BOM.test(trimmed)) {
    throw new ApolloMissingApiKeyError();
  }
  return trimmed;
}

/** Strip C0/C1 control characters from a string. Defense against header/query
 *  injection if user-controlled brand/domain ever reaches an unencoded sink. */
function sanitizeStr(v: unknown): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
}

function sanitizeBody(body: unknown): unknown {
  if (body == null) return body;
  if (typeof body === "string") return sanitizeStr(body);
  if (typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = sanitizeBody(v);
  }
  return out;
}

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
  externalSignal?: AbortSignal,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);

  // F-NEW-A: forward external aborts. AbortSignal.any may not be available
  // on older Node runtimes; we wire it manually for portability.
  const onExternalAbort = () => ctrl.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      ctrl.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (ctrl.signal.aborted) {
      const reason = externalSignal?.aborted
        ? `${label} aborted by caller`
        : `${label} aborted after ${ms}ms`;
      throw new Error(reason);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

// ─── Core POST ────────────────────────────────────────────────────────────

/**
 * APO5: minimal per-request Apollo call budget. `CallBudget` in
 * discoveryOrchestrator satisfies this. Passing it into apolloPost makes the
 * discovery "hard cap" a REAL per-call ceiling instead of a coarse post-hoc
 * estimate — see ApolloPostOptions.budget.
 */
export interface ApolloCallBudget {
  bump(): void;
  exhausted(): boolean;
}

/**
 * APO5: per-request Apollo call budget scoped via AsyncLocalStorage. The
 * discovery orchestrator wraps its run in `apolloBudgetStore.run(budget, …)`, so
 * every apolloPost anywhere in that async context (findOrg, collectContacts, and
 * all their internals) reads the same budget and self-counts — no need to thread
 * a budget param through the whole cascade. Concurrent /discover requests each
 * get their own context via `run()`.
 */
export const apolloBudgetStore = new AsyncLocalStorage<ApolloCallBudget>();

export interface ApolloPostOptions {
  /** Path under APOLLO_BASE_URL, e.g. "/organizations/enrich" (leading slash). */
  path: string;
  /** JSON body. Sanitized for control chars before send. */
  body?: Record<string, unknown>;
  /** URL query params. Stringified via URLSearchParams. Arrays repeat the key
   *  with [] suffix per Apollo's documented array-param convention. */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  /** Optional external AbortSignal. When provided, fetch is aborted as soon
   *  as either this signal or the internal 30s per-call timeout fires.
   *  Used by /discover to halt in-flight Apollo work when its outer 300s
   *  timeout fires (closes 2.2-BE-B residual finding F-NEW-A). */
  signal?: AbortSignal;
  /** APO5: per-request call budget. When exhausted, apolloPost returns null
   *  WITHOUT making the request (callers treat null as "no data" and stop
   *  gracefully); otherwise this call is counted. This turns the discovery cap
   *  into a real per-call ceiling that services can't overshoot. */
  budget?: ApolloCallBudget;
}

/**
 * POST to an Apollo endpoint. Handles rate-limit gap, 429 budget retry,
 * 5xx exponential backoff, 30s timeout. Returns parsed JSON or null on
 * unrecoverable error (matches the Python helper's "log and return None"
 * pattern so callers can fall through cascade strategies).
 *
 * Throws ONLY on:
 *   - Missing API key (ApolloMissingApiKeyError) — programmer error
 *   - 429 budget exhausted (ApolloRateLimitError) — backpressure signal
 */
export async function apolloPost(
  opts: ApolloPostOptions,
): Promise<Record<string, unknown> | null> {
  // APO5: enforce the per-request call budget as a real ceiling. The budget is
  // supplied either explicitly (opts.budget) or — the common path — via the
  // AsyncLocalStorage the orchestrator wraps discovery in, so EVERY apolloPost
  // anywhere in that async context self-counts with no signature threading. If
  // exhausted, return null WITHOUT making the request (and without needing an
  // API key) — callers already treat null as "no data" and fall through / stop.
  // Placed before the retry loop so a call counts once regardless of 5xx retries.
  const _budget = opts.budget ?? apolloBudgetStore.getStore();
  if (_budget?.exhausted()) return null;
  _budget?.bump();

  const apiKey = getApiKey();
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;

  // Build URL with query params (F6)
  const url = new URL(APOLLO_BASE_URL + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          url.searchParams.append(k, sanitizeStr(item));
        }
      } else {
        url.searchParams.append(k, sanitizeStr(String(v)));
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": apiKey,
  };

  const sanitizedBody = opts.body ? sanitizeBody(opts.body) : undefined;
  const bodyJson = sanitizedBody !== undefined ? JSON.stringify(sanitizedBody) : undefined;

  let attempt = 0;
  let last5xxStatus = 0;

  while (attempt < APOLLO_5XX_MAX_ATTEMPTS) {
    // F-NEW-A: bail immediately if caller has aborted, before consuming a
    // gap-mutex slot or making the next Apollo call.
    if (opts.signal?.aborted) {
      throw new Error(`Apollo POST ${path} aborted by caller`);
    }
    attempt++;
    await _enforceGap();

    let resp: Response;
    try {
      resp = await withTimeout(
        (signal) =>
          fetch(url.toString(), {
            method: "POST",
            headers,
            body: bodyJson,
            signal,
            // Audit fix B3.1: never follow redirects. A DNS hijack or Apollo
            // bug that 3xx-redirects to attacker.example would otherwise
            // forward our X-Api-Key header to the redirect target.
            redirect: "error",
          }),
        APOLLO_REQUEST_TIMEOUT_MS,
        `Apollo POST ${path}`,
        opts.signal,
      );
    } catch (err) {
      // Network or timeout — retry on first attempt only
      if (attempt < APOLLO_5XX_MAX_ATTEMPTS) {
        const delay = Math.min(
          APOLLO_5XX_BASE_DELAY_MS * Math.pow(2, attempt - 1),
          APOLLO_5XX_MAX_DELAY_MS,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Final attempt failed — log and return null (matches Python pattern)
      const msg = err instanceof Error ? err.message : String(err);
      // F1: never echo the API key back
      const safe = msg.replace(apiKey, "[REDACTED]");
      console.warn(`[apolloProspector] POST ${path} network/timeout error: ${safe}`);
      return null;
    }

    // 429: retry once per budget (audit fix A1.1: short-circuit on final attempt)
    if (resp.status === 429) {
      const retryAfterHeader = resp.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader
        ? Math.max(1, parseInt(retryAfterHeader, 10) || 60)
        : Math.ceil(APOLLO_429_BACKOFF_MS / 1000);

      if (!_check429Budget()) {
        console.warn(
          `[apolloProspector] POST ${path}: 429 and budget exhausted (max ${APOLLO_429_BUDGET_MAX}/${APOLLO_429_BUDGET_WINDOW_MS / 1000}s)`,
        );
        throw new ApolloRateLimitError(retryAfterSec);
      }

      // A1.1: don't sleep then fall through. If this is the final attempt,
      // surface the rate limit immediately rather than burning 60s and
      // returning null silently.
      if (attempt >= APOLLO_5XX_MAX_ATTEMPTS) {
        console.warn(
          `[apolloProspector] POST ${path}: 429 on final attempt ${attempt}/${APOLLO_5XX_MAX_ATTEMPTS} — surfacing rate limit`,
        );
        throw new ApolloRateLimitError(retryAfterSec);
      }

      _record429Retry();
      console.warn(
        `[apolloProspector] POST ${path}: 429, sleeping ${retryAfterSec}s and retrying once`,
      );
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
      continue;
    }

    // 5xx: exponential backoff
    if (resp.status >= 500 && resp.status < 600) {
      last5xxStatus = resp.status;
      if (attempt < APOLLO_5XX_MAX_ATTEMPTS) {
        const delay = Math.min(
          APOLLO_5XX_BASE_DELAY_MS * Math.pow(2, attempt - 1),
          APOLLO_5XX_MAX_DELAY_MS,
        );
        console.warn(
          `[apolloProspector] POST ${path}: HTTP ${resp.status}, retry ${attempt}/${APOLLO_5XX_MAX_ATTEMPTS} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.warn(
        `[apolloProspector] POST ${path}: HTTP ${last5xxStatus} after ${APOLLO_5XX_MAX_ATTEMPTS} attempts`,
      );
      return null;
    }

    // 4xx (other than 429): non-retryable — log and return null
    if (resp.status >= 400) {
      // A1.2: defend against malformed body throwing in resp.text()
      let bodyExcerpt = "<body unavailable>";
      try {
        bodyExcerpt = (await resp.text()).slice(0, 300);
      } catch {
        /* swallow — body read failure shouldn't crash the cascade */
      }
      console.warn(
        `[apolloProspector] POST ${path}: HTTP ${resp.status} body=${bodyExcerpt}`,
      );
      return null;
    }

    // 2xx
    try {
      const data = await resp.json();
      return data as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[apolloProspector] POST ${path}: JSON parse error: ${msg}`);
      return null;
    }
  }

  // Should not be reachable — loop above always returns or throws.
  return null;
}

// ─── String helpers exported for orgFinder/contactCollector ───────────────

export { sanitizeStr };

/**
 * Audit fix B1.1: Redact Apollo-shaped API keys from a string.
 *
 * Apollo keys are typically 30+ char alphanumeric tokens (often with hyphens
 * or underscores). They lack the `sk-ant-` / `sk-` / `Bearer` markers that
 * companyResolver.redactSecrets handles. Defense in depth.
 *
 * To use both: `redactApolloKey(redactSecrets(errMsg))`.
 *
 * The redaction strips the literal key from process.env first (cheapest, exact
 * match), then falls back to a heuristic for any 30+ char alphanumeric+`-_`
 * sequence that LOOKS like an Apollo key. The heuristic has a small false
 * positive rate against UUIDs and hex digests, but the cost of a false
 * positive (a redacted UUID in a debug log) is acceptable.
 */
export function redactApolloKey(s: string): string {
  if (!s) return s;
  let out = s;
  const env = process.env.APOLLO_API_KEY;
  if (env && env.length >= 8) {
    out = out.split(env).join("[APOLLO_KEY_REDACTED]");
  }
  // Heuristic: any 30+ char alphanumeric run with possible -_ that doesn't
  // look like a UUID (which has hyphens at fixed positions).
  // Audit fix A-NEW-2: regex hoisted to module scope.
  out = out.replace(_APOLLO_KEY_HEURISTIC, (m) => {
    if (_UUID_SHAPE.test(m)) return m;
    return "[APOLLO_KEY_REDACTED]";
  });
  return out;
}

/**
 * /api/prospector/* routes — Ticket 2.1-BE.
 *
 * Phase 2 prospector flow lives here. v1 has one endpoint: resolve-urls.
 * Future tickets add discovery (2.2-BE) and bulk-create (2.4-BE) under
 * the same router.
 *
 * Conventions match routes/prospects.ts (BE-2):
 *   - requireAuth + req.user!
 *   - zod/v4 with .strict() and ZodError → zodErrorToHttp
 *   - direct db.insert(actionLogsTable) for logging (no helper)
 *   - 4xx codes for user-facing errors
 *
 * Routes:
 *   POST /api/prospector/resolve-urls   — batch URL resolution
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z, ZodError } from "zod/v4";
import {
  db,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  assertUnderDailyLlmCap,
  recordDailyLlmSpend,
} from "../lib/llmSpendCap";
import { computeCost } from "../lib/pricing";
import { recordLlmCall } from "../lib/llmLedger";
import { resolveUrl, type ResolvedUrl } from "../services/urlResolver";

// L1: mirror companyResolver's DEFAULT_SONNET_MODEL (not exported) so prospector
// discovery spend is priced with the model actually used for resolveCompany.
const PROSPECTOR_SONNET_MODEL =
  process.env.PROSPECTOR_SONNET_MODEL ?? "claude-sonnet-4-6";
import {
  resolveCompany,
  redactSecrets,
  sanitizeForStorage,
  type ResolveCompanyInput,
  type ResolveCompanyResult,
} from "../services/companyResolver";
import {
  findOrg,
  type ApolloOrg,
  type FindOrgResult,
} from "../services/orgFinder";
import {
  collectContacts,
  type ApolloContact,
  type CollectContactsResult,
} from "../services/contactCollector";
import {
  ApolloMissingApiKeyError,
  ApolloRateLimitError,
  redactApolloKey,
} from "../services/apolloProspector";
import type { ResolvedCompany } from "../services/companyResolver";
import {
  discover,
  type DiscoveryInput,
  type DiscoveryResult,
} from "../services/discoveryOrchestrator";
import { classifySeed } from "../services/seedClassifier";

const router: IRouter = Router();

const URL_MIN_LEN = 1;
const URL_MAX_LEN = 2000;
const BATCH_MIN = 1;
const BATCH_MAX = 50;
const CONCURRENCY = 5;

const resolveUrlsBodySchema = z
  .object({
    urls: z
      .array(
        z
          .string()
          .trim()
          .min(URL_MIN_LEN, "URL cannot be empty")
          .max(URL_MAX_LEN, `URL too long (max ${URL_MAX_LEN} chars)`),
      )
      .min(BATCH_MIN, "At least one URL required")
      .max(BATCH_MAX, `At most ${BATCH_MAX} URLs per batch`),
  })
  .strict();

type ResolveUrlsBody = z.infer<typeof resolveUrlsBodySchema>;

function zodErrorToHttp(err: ZodError): {
  status: 400;
  body: { error: string; issues: { path: string; message: string }[] };
} {
  return {
    status: 400,
    body: {
      error: "invalid_body",
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
  };
}

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const my = nextIdx++;
      if (my >= items.length) return;
      results[my] = await fn(items[my]);
    }
  });
  await Promise.all(workers);
  return results;
}

router.post(
  "/prospector/resolve-urls",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    let body: ResolveUrlsBody;
    try {
      body = resolveUrlsBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const resolved: ResolvedUrl[] = await pMap(
      body.urls,
      (u) => resolveUrl(u),
      CONCURRENCY,
    );

    const successCount = resolved.filter((r) => r.error === null).length;
    const failureCount = resolved.length - successCount;

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorUrlsResolved,
        actionStatus: failureCount === 0 ? "success" : "failure",
        durationMs: Date.now() - start,
        metadata: {
          batch_size: body.urls.length,
          success_count: successCount,
          failure_count: failureCount,
          type_counts: countByType(resolved),
        },
      });
    } catch {
      // Audit log failure must not break the user response.
    }

    res.status(200).json({ resolved });
  },
);

function countByType(
  resolved: ResolvedUrl[],
): Record<ResolvedUrl["type"], number> {
  const counts: Record<ResolvedUrl["type"], number> = {
    play_store: 0,
    app_store: 0,
    website: 0,
    unknown: 0,
  };
  for (const r of resolved) counts[r.type]++;
  return counts;
}

// ─── Ticket 2.2-BE-A: /resolve-company ────────────────────────────────────
//
// Sonnet-driven company disambiguation. Takes brand+appName+domain+country
// (typically a ResolvedUrl from /resolve-urls), returns the real company
// entity that should be searched in Apollo.
//
// Cost: ~1 Sonnet request per call. Latency: ~3-8 seconds typical, capped at
// 200s outer timeout (audit fix F1).

const RESOLVE_COMPANY_FIELD_MAX = 2000;
/** Outer route timeout in ms. SDK does at most 1 retry × 90s = 180s; 200s
 *  gives a 20s buffer for post-processing + DB writes before we hard-cap. */
const RESOLVE_COMPANY_TIMEOUT_MS = 200_000;
/** Per-user rate limit window and cap (audit fix F2). 60 calls per 60s is
 *  enough for any sane manual probing while bounding burst LLM cost. */
const RESOLVE_RATE_WINDOW_MS = 60_000;
const RESOLVE_RATE_MAX_CALLS = 60;

const resolveCompanyBodySchema = z
  .object({
    brand: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    appName: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    domain: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    country: z.string().trim().max(64).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    developerEmail: z.string().trim().max(320).nullable().optional(),
    developerLegalName: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    storeUrl: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    storeCategory: z.string().trim().max(RESOLVE_COMPANY_FIELD_MAX).nullable().optional(),
    publisherContactEmails: z.string().trim().max(4000).nullable().optional(),
    sourceType: z.string().trim().max(32).nullable().optional(),
  })
  .strict()
  .refine(
    (b) =>
      Boolean(
        (b.brand && b.brand.length > 0) ||
          (b.appName && b.appName.length > 0) ||
          (b.domain && b.domain.length > 0),
      ),
    {
      message: "At least one of brand, appName, or domain must be provided",
      path: ["brand"],
    },
  );

type ResolveCompanyBody = z.infer<typeof resolveCompanyBodySchema>;

// ─── Audit fix F2 + F10 + F11: bounded in-memory per-user rate limiter ─────
// Sliding-window counter, scoped to /resolve-company only. Survives within
// process lifetime; reset on api-server restart.
//
// SCALE ASSUMPTION (audit fix F12): correct only for SINGLE-PROCESS deploys.
// The current Replit api-server runs as one process per deploy. If the deploy
// is ever scaled horizontally (multiple api-server replicas), each replica
// has its own counter and the effective per-user limit becomes
// N × RESOLVE_RATE_MAX_CALLS per minute, where N is replica count. To support
// multi-replica, replace _resolveCompanyRateMap with a Redis-backed counter
// (recommended pattern: INCR with EXPIRE on a key like
// "rl:resolve-company:<userId>:<minute-bucket>"). Until then, do NOT enable
// horizontal autoscaling on the api-server without revisiting this code.
//
// F10 fix: opportunistic eviction of stale entries. Whenever the map size
// exceeds RESOLVE_RATE_MAP_MAX_USERS, sweep and drop any user whose entire
// window has expired. Bounds memory at O(active users in window).
// F11 fix: rate-limit hits are audit-logged with action_status="blocked"
// (see route handler) so admin can trace who hit the limit when, and
// capacity-planning metrics can count blocked attempts.

const _resolveCompanyRateMap = new Map<string, number[]>();
const RESOLVE_RATE_MAP_MAX_USERS = 5000;

function _sweepExpiredRateEntries(now: number): void {
  const cutoff = now - RESOLVE_RATE_WINDOW_MS;
  for (const [uid, calls] of _resolveCompanyRateMap) {
    // If every timestamp is expired, drop the entry entirely.
    if (calls.length === 0 || calls[calls.length - 1] <= cutoff) {
      _resolveCompanyRateMap.delete(uid);
    }
  }
}

function checkResolveCompanyRateLimit(userId: string): {
  ok: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  if (_resolveCompanyRateMap.size > RESOLVE_RATE_MAP_MAX_USERS) {
    _sweepExpiredRateEntries(now);
  }
  const cutoff = now - RESOLVE_RATE_WINDOW_MS;
  const calls = _resolveCompanyRateMap.get(userId) ?? [];
  const fresh = calls.filter((t) => t > cutoff);
  if (fresh.length >= RESOLVE_RATE_MAX_CALLS) {
    const oldest = fresh[0];
    return {
      ok: false,
      remaining: 0,
      resetMs: oldest + RESOLVE_RATE_WINDOW_MS - now,
    };
  }
  fresh.push(now);
  _resolveCompanyRateMap.set(userId, fresh);
  return {
    ok: true,
    remaining: RESOLVE_RATE_MAX_CALLS - fresh.length,
    resetMs: RESOLVE_RATE_WINDOW_MS,
  };
}

/** Wrap a promise in an outer timeout. Audit fix F1.
 *
 *  Audit fix F13: if the timeout wins the race, the underlying promise keeps
 *  running and may reject later. Without a .catch, Node emits
 *  'unhandledRejection' and (under --unhandled-rejections=strict) exits the
 *  process. We attach a swallow-handler to the underlying promise so its
 *  late rejection is absorbed silently. The original rejection is already
 *  surfaced via the timeout error to the caller. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} exceeded ${ms}ms outer timeout`));
    }, ms);
  });
  // Detach a no-op handler so a late rejection doesn't escape as
  // unhandledRejection if our timeout wins the race.
  p.catch(() => {
    /* swallow late rejection — original error already conveyed via timeout */
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

router.post(
  "/prospector/resolve-company",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    // ── Rate limit (F2 + F11) ────────────────────────────────────────────
    const rl = checkResolveCompanyRateLimit(user.id);
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      // F11 fix: audit-log rate-limit hits with action_status="blocked"
      // so admin can trace who hit the limit when, and so capacity-planning
      // metrics can count blocked attempts.
      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorCompanyResolved,
          actionStatus: "blocked",
          durationMs: Date.now() - start,
          metadata: {
            error_class: "rate_limit",
            limit_per_window: RESOLVE_RATE_MAX_CALLS,
            window_seconds: RESOLVE_RATE_WINDOW_MS / 1000,
            retry_after_seconds: retryAfterSec,
          },
        });
      } catch {
        // Audit log failure must not break the user response.
      }
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message:
          `Too many /resolve-company calls. Limit is ${RESOLVE_RATE_MAX_CALLS} per minute. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    // L1: this route bills a Sonnet call (resolveCompany) but never checked the
    // daily cap. Uncaught → terminal 429. No-op when the cap env is unset.
    await assertUnderDailyLlmCap(user.id);

    let body: ResolveCompanyBody;
    try {
      body = resolveCompanyBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const input: ResolveCompanyInput = {
      brand: body.brand ?? null,
      appName: body.appName ?? null,
      domain: body.domain ?? null,
      country: body.country ?? null,
      description: body.description ?? null,
      developerEmail: body.developerEmail ?? null,
      developerLegalName: body.developerLegalName ?? null,
      storeUrl: body.storeUrl ?? null,
      storeCategory: body.storeCategory ?? null,
      publisherContactEmails: body.publisherContactEmails ?? null,
      sourceType: body.sourceType ?? null,
    };

    let result: ResolveCompanyResult;
    try {
      // Audit fix F1: outer timeout wraps the resolver call.
      result = await withTimeout(
        resolveCompany(input),
        RESOLVE_COMPANY_TIMEOUT_MS,
        "resolveCompany",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        /timeout|timed out|aborted|outer timeout/i.test(errMsg) ||
        (err instanceof Error && err.name === "AbortError");
      // Audit fix F7: redact secret-like patterns before storing error_detail.
      const safeErrDetail = redactSecrets(errMsg).slice(0, 500);

      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorCompanyResolved,
          actionStatus: "failure",
          durationMs: Date.now() - start,
          errorDetail: safeErrDetail,
          metadata: {
            brand: sanitizeForStorage(input.brand, 200),
            app_name: sanitizeForStorage(input.appName, 200),
            domain: sanitizeForStorage(input.domain, 200),
            error_class: isTimeout ? "timeout" : "llm_error",
          },
        });
      } catch {
        // Audit log failure must not break the user response.
      }

      const status = isTimeout ? 504 : 502;
      const code = isTimeout ? "resolver_timeout" : "resolver_failure";
      res.status(status).json({
        error: code,
        message:
          isTimeout
            ? "Company resolver timed out. The disambiguation LLM call took too long. Please retry."
            : "Company resolver failed to produce a valid response. Please retry, or contact support if this persists.",
      });
      return;
    }

    // Audit fix F3: sanitize LLM-output strings before storing in metadata.
    // Defense in depth — downstream UIs that display action_logs.metadata
    // should still HTML-escape on output, but stripping control chars at
    // ingest narrows the attack surface.
    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorCompanyResolved,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          brand: sanitizeForStorage(input.brand, 200),
          app_name: sanitizeForStorage(input.appName, 200),
          domain: sanitizeForStorage(input.domain, 200),
          source_type: sanitizeForStorage(input.sourceType, 32),
          has_description: Boolean(input.description),
          resolved_company: sanitizeForStorage(result.resolved.companyName, 200),
          parent_company: sanitizeForStorage(result.resolved.parentCompany, 200) || null,
          corporate_domain: sanitizeForStorage(result.resolved.corporateDomain, 200) || null,
          is_multinational: result.resolved.isMultinational,
          primary_market: sanitizeForStorage(result.resolved.primaryMarket, 200) || null,
          llm_latency_ms: result.latencyMs,
          input_tokens: result.usage?.inputTokens ?? null,
          output_tokens: result.usage?.outputTokens ?? null,
          search_query_count: result.resolved.searchQueries.length,
        },
      });
    } catch {
      // Audit log failure must not break the user response.
    }

    // L1: record the Sonnet spend so it counts toward the daily cap + rollups
    // (previously only token counts hit action_logs, never USD in daily_usage).
    const resolveCost = computeCost(
      PROSPECTOR_SONNET_MODEL,
      result.usage?.inputTokens ?? 0,
      result.usage?.outputTokens ?? 0,
    );
    await recordDailyLlmSpend(user.id, resolveCost.usd).catch(() => {});

    // Ledger row (2026-07-15) — companyResolver bypasses callLLMRole.
    await recordLlmCall({
      ledger: { userId: user.id },
      task: "resolve_company",
      model: PROSPECTOR_SONNET_MODEL,
      provider: "anthropic",
      cost: resolveCost,
    });

    // Audit fix F9: surface usage to the caller for cost reporting.
    res.status(200).json({
      resolved: result.resolved,
      latencyMs: result.latencyMs,
      usage: result.usage ?? null,
    });
  },
);

// ─── Ticket 2.2-BE-B: /find-org, /collect-contacts, /discover-simple ──────
//
// Stage B of the prospector cascade. Takes the output of /resolve-company and
// drives Apollo to find the org and its contacts.
//
// Three endpoints to enable both the orchestrated flow (/discover-simple)
// AND the per-stage debug flow (/find-org and /collect-contacts run independently
// when the manual UI wants to inspect/fix one stage at a time).
//
// Cost: ~1-15 Apollo API calls per request (cascade depth-dependent).
//   Apollo charges per credit, not per call — typical /find-org: ~3 credits;
//   /collect-contacts: ~30-100 credits (one per person enrichment); /discover-
//   simple: sum of both.

const FIND_ORG_TIMEOUT_MS = 60_000;
const COLLECT_CONTACTS_TIMEOUT_MS = 240_000; // can be tens of Apollo calls
const DISCOVER_SIMPLE_TIMEOUT_MS = 300_000;

/** Per-user rate limits, separate buckets per endpoint so heavy contact
 *  collection doesn't starve light org lookups. */
const STAGE_B_RATE_WINDOW_MS = 60_000;
const FIND_ORG_RATE_MAX = 60;
const COLLECT_CONTACTS_RATE_MAX = 20;
const DISCOVER_SIMPLE_RATE_MAX = 20;

const STAGE_B_RATE_MAP_MAX_USERS = 5000;

// ─── Per-bucket rate limiter ─────────────────────────────────────────────
// Same pattern as 2.2-BE-A's checkResolveCompanyRateLimit, factored to support
// multiple named buckets. Single-process scope — see audit fix F12 in 2.2-BE-A
// for the horizontal-scaling upgrade path (Redis INCR+EXPIRE).

const _stageBRateMaps: Record<string, Map<string, number[]>> = {
  find_org: new Map(),
  collect_contacts: new Map(),
  discover_simple: new Map(),
};

function _sweepStageBExpired(bucket: string, now: number): void {
  const m = _stageBRateMaps[bucket];
  if (!m) return;
  const cutoff = now - STAGE_B_RATE_WINDOW_MS;
  for (const [uid, calls] of m) {
    if (calls.length === 0 || calls[calls.length - 1] <= cutoff) {
      m.delete(uid);
    }
  }
}

function checkStageBRateLimit(
  bucket: "find_org" | "collect_contacts" | "discover_simple",
  userId: string,
  maxCalls: number,
): { ok: boolean; resetMs: number } {
  const now = Date.now();
  const m = _stageBRateMaps[bucket];
  if (!m) {
    return { ok: true, resetMs: STAGE_B_RATE_WINDOW_MS };
  }
  if (m.size > STAGE_B_RATE_MAP_MAX_USERS) {
    _sweepStageBExpired(bucket, now);
  }
  const cutoff = now - STAGE_B_RATE_WINDOW_MS;
  const calls = m.get(userId) ?? [];
  const fresh = calls.filter((t) => t > cutoff);
  if (fresh.length >= maxCalls) {
    return { ok: false, resetMs: fresh[0] + STAGE_B_RATE_WINDOW_MS - now };
  }
  fresh.push(now);
  m.set(userId, fresh);
  return { ok: true, resetMs: STAGE_B_RATE_WINDOW_MS };
}

/** Local copy of 2.2-BE-A's withTimeout — different name to avoid TS merged
 *  declaration conflicts since both blocks are now in the same file. Same
 *  semantics: late rejection swallowed, timer cleared on settle. */
function withStageBTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} exceeded ${ms}ms outer timeout`));
    }, ms);
  });
  p.catch(() => {
    /* swallow late rejection */
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Resolved company body schema — used by /find-org and /discover-simple.
 *  Mirrors the ResolvedCompany interface from companyResolver.
 *
 *  Audit fix B2.1: alternativeDomains hard cap at 8 (down from 20). The Apollo
 *  cascade iterates ALL alt domains in Strategy 2 (1-2 calls each). With max 8
 *  we cap Strategy 2 cost at ~16 Apollo calls. Real /resolve-company outputs
 *  are typically 0-3 alt domains; this prevents authenticated-user cost
 *  amplification via hand-crafted bodies. */
const resolvedCompanyBodySchema = z.object({
  companyName: z.string().trim().min(1).max(500),
  parentCompany: z.string().trim().max(500).default(""),
  corporateDomain: z.string().trim().max(500).default(""),
  alternativeDomains: z.array(z.string().trim().max(500)).max(8).default([]),
  searchQueries: z.array(z.string().trim().max(500)).max(5).default([]),
  isMultinational: z.boolean().default(false),
  focusMarket: z.string().trim().max(200).default(""),
  primaryMarket: z.string().trim().max(200).default(""),
  reasoning: z.string().trim().max(2000).default(""),
});

/** ApolloOrg body schema — used by /collect-contacts. Caller must supply an
 *  org with at least an id OR domain — neither is meaningful alone. */
const apolloOrgBodySchema = z
  .object({
    id: z.string().trim().max(200).default(""),
    name: z.string().trim().max(500).default(""),
    domain: z.string().trim().max(500).default(""),
    industry: z.string().trim().max(500).default(""),
    estimatedNumEmployees: z.number().int().min(0).max(10_000_000).default(0),
    country: z.string().trim().max(200).default(""),
  })
  .refine((o) => Boolean(o.id || o.domain), {
    message: "ApolloOrg must have at least one of id or domain",
    path: ["id"],
  });

// ─── /find-org ────────────────────────────────────────────────────────────

const findOrgBodySchema = z
  .object({
    resolved: resolvedCompanyBodySchema,
  })
  .strict();

router.post(
  "/prospector/find-org",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    const rl = checkStageBRateLimit("find_org", user.id, FIND_ORG_RATE_MAX);
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorOrgFound,
          actionStatus: "blocked",
          durationMs: Date.now() - start,
          metadata: {
            error_class: "rate_limit",
            limit_per_window: FIND_ORG_RATE_MAX,
            window_seconds: STAGE_B_RATE_WINDOW_MS / 1000,
            retry_after_seconds: retryAfterSec,
          },
        });
      } catch {}
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many /find-org calls. Limit ${FIND_ORG_RATE_MAX}/min. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    let body: z.infer<typeof findOrgBodySchema>;
    try {
      body = findOrgBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const resolved: ResolvedCompany = body.resolved;

    let result: FindOrgResult;
    try {
      result = await withStageBTimeout(findOrg(resolved), FIND_ORG_TIMEOUT_MS, "findOrg");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isMissingKey = err instanceof ApolloMissingApiKeyError;
      const isRateLimit = err instanceof ApolloRateLimitError;
      const isTimeout = /timeout|timed out|aborted|outer timeout/i.test(errMsg);
      const safeErr = redactApolloKey(redactSecrets(errMsg)).slice(0, 500);

      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorOrgFound,
          actionStatus: "failure",
          durationMs: Date.now() - start,
          errorDetail: safeErr,
          metadata: {
            company_name: sanitizeForStorage(resolved.companyName, 200),
            corporate_domain: sanitizeForStorage(resolved.corporateDomain, 200),
            error_class: isMissingKey
              ? "missing_apollo_key"
              : isRateLimit
                ? "apollo_rate_limit"
                : isTimeout
                  ? "timeout"
                  : "apollo_error",
          },
        });
      } catch {}

      const status = isMissingKey
        ? 503
        : isRateLimit
          ? 503
          : isTimeout
            ? 504
            : 502;
      const code = isMissingKey
        ? "apollo_not_configured"
        : isRateLimit
          ? "apollo_rate_limited"
          : isTimeout
            ? "find_org_timeout"
            : "find_org_failure";
      res.status(status).json({
        error: code,
        message: isMissingKey
          ? "Apollo is not configured on this server. Add APOLLO_API_KEY as a Replit Secret and restart api-server."
          : isRateLimit
            ? "Apollo rate limit hit. Try again in a minute."
            : isTimeout
              ? "Apollo cascade timed out."
              : "Org find failed against Apollo. Please retry, or contact support.",
        retryAfterSeconds:
          isRateLimit && err instanceof ApolloRateLimitError
            ? err.retryAfterSeconds
            : undefined,
      });
      return;
    }

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorOrgFound,
        actionStatus: result.org ? "success" : "skipped",
        durationMs: Date.now() - start,
        metadata: {
          company_name: sanitizeForStorage(resolved.companyName, 200),
          corporate_domain: sanitizeForStorage(resolved.corporateDomain, 200),
          parent_company: sanitizeForStorage(resolved.parentCompany, 200) || null,
          strategy: result.strategy,
          upgraded_to_parent: result.upgradedToParent,
          org_found: Boolean(result.org),
          org_name: result.org ? sanitizeForStorage(result.org.name, 200) : null,
          org_employees: result.org?.estimatedNumEmployees ?? null,
          attempt_count: result.attempts.length,
        },
      });
    } catch {}

    res.status(200).json({
      org: result.org,
      strategy: result.strategy,
      upgradedToParent: result.upgradedToParent,
      attempts: result.attempts,
    });
  },
);

// ─── /collect-contacts ────────────────────────────────────────────────────

const collectContactsBodySchema = z
  .object({
    org: apolloOrgBodySchema,
    resolved: resolvedCompanyBodySchema.nullable().optional(),
    targetContacts: z.number().int().min(1).max(50).optional(),
  })
  .strict();

router.post(
  "/prospector/collect-contacts",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    const rl = checkStageBRateLimit(
      "collect_contacts",
      user.id,
      COLLECT_CONTACTS_RATE_MAX,
    );
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorContactsCollected,
          actionStatus: "blocked",
          durationMs: Date.now() - start,
          metadata: {
            error_class: "rate_limit",
            limit_per_window: COLLECT_CONTACTS_RATE_MAX,
            window_seconds: STAGE_B_RATE_WINDOW_MS / 1000,
            retry_after_seconds: retryAfterSec,
          },
        });
      } catch {}
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many /collect-contacts calls. Limit ${COLLECT_CONTACTS_RATE_MAX}/min. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    let body: z.infer<typeof collectContactsBodySchema>;
    try {
      body = collectContactsBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const org: ApolloOrg = {
      id: body.org.id,
      name: body.org.name,
      domain: body.org.domain,
      industry: body.org.industry,
      estimatedNumEmployees: body.org.estimatedNumEmployees,
      country: body.org.country,
    };
    const resolved = body.resolved ?? null;
    const opts = body.targetContacts ? { targetContacts: body.targetContacts } : {};

    let result: CollectContactsResult;
    try {
      result = await withStageBTimeout(
        collectContacts(org, resolved, opts),
        COLLECT_CONTACTS_TIMEOUT_MS,
        "collectContacts",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isMissingKey = err instanceof ApolloMissingApiKeyError;
      const isRateLimit = err instanceof ApolloRateLimitError;
      const isTimeout = /timeout|timed out|aborted|outer timeout/i.test(errMsg);
      const safeErr = redactApolloKey(redactSecrets(errMsg)).slice(0, 500);

      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorContactsCollected,
          actionStatus: "failure",
          durationMs: Date.now() - start,
          errorDetail: safeErr,
          metadata: {
            org_id: sanitizeForStorage(org.id, 200),
            org_domain: sanitizeForStorage(org.domain, 200),
            error_class: isMissingKey
              ? "missing_apollo_key"
              : isRateLimit
                ? "apollo_rate_limit"
                : isTimeout
                  ? "timeout"
                  : "apollo_error",
          },
        });
      } catch {}

      const status = isMissingKey ? 503 : isRateLimit ? 503 : isTimeout ? 504 : 502;
      const code = isMissingKey
        ? "apollo_not_configured"
        : isRateLimit
          ? "apollo_rate_limited"
          : isTimeout
            ? "collect_contacts_timeout"
            : "collect_contacts_failure";
      res.status(status).json({
        error: code,
        message: isMissingKey
          ? "Apollo is not configured on this server. Add APOLLO_API_KEY."
          : isRateLimit
            ? "Apollo rate limit hit. Try again in a minute."
            : isTimeout
              ? "Apollo people-search cascade timed out."
              : "Contact collection failed against Apollo. Please retry.",
        retryAfterSeconds:
          isRateLimit && err instanceof ApolloRateLimitError
            ? err.retryAfterSeconds
            : undefined,
      });
      return;
    }

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorContactsCollected,
        actionStatus: result.contacts.length > 0 ? "success" : "skipped",
        durationMs: Date.now() - start,
        metadata: {
          org_id: sanitizeForStorage(org.id, 200),
          org_domain: sanitizeForStorage(org.domain, 200),
          org_employees: org.estimatedNumEmployees,
          contacts_returned: result.contacts.length,
          phases_run: result.phasesRun.map((p) => p.phase),
          rejected_no_email: result.rejected.noEmail,
          rejected_domain_mismatch: result.rejected.domainMismatch,
          rejected_title: result.rejected.titleRejected,
          rejected_duplicate: result.rejected.duplicate,
        },
      });
    } catch {}

    res.status(200).json({
      contacts: result.contacts,
      phasesRun: result.phasesRun,
      rejected: result.rejected,
    });
  },
);

// ─── /discover-simple ─────────────────────────────────────────────────────

const discoverSimpleBodySchema = z
  .object({
    resolved: resolvedCompanyBodySchema,
    targetContacts: z.number().int().min(1).max(50).optional(),
  })
  .strict();

router.post(
  "/prospector/discover-simple",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    const rl = checkStageBRateLimit(
      "discover_simple",
      user.id,
      DISCOVER_SIMPLE_RATE_MAX,
    );
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorDiscoverSimple,
          actionStatus: "blocked",
          durationMs: Date.now() - start,
          metadata: {
            error_class: "rate_limit",
            limit_per_window: DISCOVER_SIMPLE_RATE_MAX,
            window_seconds: STAGE_B_RATE_WINDOW_MS / 1000,
            retry_after_seconds: retryAfterSec,
          },
        });
      } catch {}
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many /discover-simple calls. Limit ${DISCOVER_SIMPLE_RATE_MAX}/min. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    // P3-5: no LLM spend-cap check here. /discover-simple is Apollo-ONLY — the
    // resolved company arrives in the request body, so this path runs findOrg +
    // collectContacts (Apollo) with no resolveCompany/validator/opusRescue call.
    // Gating an Apollo-only endpoint on the LLM cap over-restricts (it's already
    // bounded by the per-call Apollo budget + the stage-B rate limit above). The
    // LLM cap belongs on /discover and /resolve-company, which do bill Anthropic.

    let body: z.infer<typeof discoverSimpleBodySchema>;
    try {
      body = discoverSimpleBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    const resolved: ResolvedCompany = body.resolved;
    const opts = body.targetContacts ? { targetContacts: body.targetContacts } : {};

    let orgResult: FindOrgResult;
    let contactsResult: CollectContactsResult | null = null;

    try {
      const work = (async () => {
        const orgRes = await findOrg(resolved);
        if (!orgRes.org) return { orgRes, contactsRes: null };
        const contactsRes = await collectContacts(orgRes.org, resolved, opts);
        return { orgRes, contactsRes };
      })();
      const out = await withStageBTimeout(work, DISCOVER_SIMPLE_TIMEOUT_MS, "discoverSimple");
      orgResult = out.orgRes;
      contactsResult = out.contactsRes;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isMissingKey = err instanceof ApolloMissingApiKeyError;
      const isRateLimit = err instanceof ApolloRateLimitError;
      const isTimeout = /timeout|timed out|aborted|outer timeout/i.test(errMsg);
      const safeErr = redactApolloKey(redactSecrets(errMsg)).slice(0, 500);

      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorDiscoverSimple,
          actionStatus: "failure",
          durationMs: Date.now() - start,
          errorDetail: safeErr,
          metadata: {
            company_name: sanitizeForStorage(resolved.companyName, 200),
            error_class: isMissingKey
              ? "missing_apollo_key"
              : isRateLimit
                ? "apollo_rate_limit"
                : isTimeout
                  ? "timeout"
                  : "apollo_error",
          },
        });
      } catch {}

      const status = isMissingKey ? 503 : isRateLimit ? 503 : isTimeout ? 504 : 502;
      const code = isMissingKey
        ? "apollo_not_configured"
        : isRateLimit
          ? "apollo_rate_limited"
          : isTimeout
            ? "discover_simple_timeout"
            : "discover_simple_failure";
      res.status(status).json({
        error: code,
        message: isMissingKey
          ? "Apollo is not configured. Add APOLLO_API_KEY."
          : isRateLimit
            ? "Apollo rate limit hit."
            : isTimeout
              ? "Discovery timed out."
              : "Discovery failed.",
        retryAfterSeconds:
          isRateLimit && err instanceof ApolloRateLimitError
            ? err.retryAfterSeconds
            : undefined,
      });
      return;
    }

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorDiscoverSimple,
        actionStatus:
          orgResult.org && contactsResult && contactsResult.contacts.length > 0
            ? "success"
            : "skipped",
        durationMs: Date.now() - start,
        metadata: {
          company_name: sanitizeForStorage(resolved.companyName, 200),
          corporate_domain: sanitizeForStorage(resolved.corporateDomain, 200),
          strategy: orgResult.strategy,
          upgraded_to_parent: orgResult.upgradedToParent,
          org_found: Boolean(orgResult.org),
          org_name: orgResult.org ? sanitizeForStorage(orgResult.org.name, 200) : null,
          org_employees: orgResult.org?.estimatedNumEmployees ?? null,
          contacts_returned: contactsResult?.contacts.length ?? 0,
          phases_run: contactsResult?.phasesRun.map((p) => p.phase) ?? [],
        },
      });
    } catch {}

    res.status(200).json({
      org: orgResult.org,
      strategy: orgResult.strategy,
      upgradedToParent: orgResult.upgradedToParent,
      attempts: orgResult.attempts,
      contacts: contactsResult?.contacts ?? [],
      phasesRun: contactsResult?.phasesRun ?? [],
      rejected: contactsResult?.rejected ?? {
        noEmail: 0,
        domainMismatch: 0,
        titleRejected: 0,
        duplicate: 0,
      },
    });
  },
);

// ─── Ticket 2.2-BE-C: /discover (production endpoint) ───────────────────────
//
// Production discovery chain. Wraps discoveryOrchestrator.discover() with auth,
// rate limit, body validation, outer 300s timeout, action_log persistence.
//
// Differs from /discover-simple (2.2-BE-B):
//   - Adds smart cascade (LLM-validated relaxed name search) when strict cascade fails
//   - Adds Opus rescue with web_search when smart cascade fails
//   - Adds Phase 3 subsidiary expansion when contacts < target
//   - Threads AbortSignal through every Apollo call (closes 2.2-BE-B residual F-NEW-A)
//   - Returns rich audit trail showing which step succeeded and why

const DISCOVER_TIMEOUT_MS = 300_000;
const DISCOVER_RATE_MAX = 12; // per user per minute — heavier than discover-simple due to Opus + Phase 3 cost

const discoverBodySchema = z
  .object({
    brand: z.string().trim().max(500).nullable().optional(),
    appName: z.string().trim().max(500).nullable().optional(),
    domain: z.string().trim().max(500).nullable().optional(),
    country: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    developerEmail: z.string().trim().max(500).nullable().optional(),
    legalName: z.string().trim().max(500).nullable().optional(),
    storeUrl: z.string().trim().max(1000).nullable().optional(),
    storeCategory: z.string().trim().max(200).nullable().optional(),
    sourceType: z.enum(["play_store", "app_store", "website"]).nullable().optional(),
    targetContacts: z.number().int().min(1).max(50).optional(),
    skipSubsidiaryExpansion: z.boolean().optional(),
    skipOpusRescue: z.boolean().optional(),
    disableWebSearchInRescue: z.boolean().optional(),
    apolloCallBudget: z.number().int().min(10).max(200).optional(),
  })
  .strict();

router.post(
  "/prospector/discover",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    const rl = checkStageBRateLimit("discover_simple", user.id, DISCOVER_RATE_MAX);
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorDiscover,
          actionStatus: "blocked",
          durationMs: Date.now() - start,
          metadata: {
            error_class: "rate_limit",
            limit_per_window: DISCOVER_RATE_MAX,
            window_seconds: STAGE_B_RATE_WINDOW_MS / 1000,
            retry_after_seconds: retryAfterSec,
          },
        });
      } catch {}
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many /discover calls. Limit ${DISCOVER_RATE_MAX}/min. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    // L1: bound runaway LLM spend before the discovery cascade (Sonnet resolve +
    // Sonnet-5 validator + Opus-4.8 rescue w/ web_search). Uncaught → terminal
    // 429. No-op when the cap env is unset.
    await assertUnderDailyLlmCap(user.id);

    let body: z.infer<typeof discoverBodySchema>;
    try {
      body = discoverBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    // External AbortController so the orchestrator can be told to stop when
    // the outer timeout fires. discoveryOrchestrator threads this signal
    // through every Apollo call.
    const ctrl = new AbortController();
    // APO2: client disconnect also aborts in-flight Apollo calls
    req.on("close", () => ctrl.abort());

    const discoveryInput: DiscoveryInput = {
      brand: body.brand ?? undefined,
      appName: body.appName ?? undefined,
      domain: body.domain ?? undefined,
      country: body.country ?? undefined,
      description: body.description ?? undefined,
      developerEmail: body.developerEmail ?? undefined,
      legalName: body.legalName ?? undefined,
      storeUrl: body.storeUrl ?? undefined,
      storeCategory: body.storeCategory ?? undefined,
      sourceType: body.sourceType ?? undefined,
      targetContacts: body.targetContacts,
      skipSubsidiaryExpansion: body.skipSubsidiaryExpansion,
      skipOpusRescue: body.skipOpusRescue,
      disableWebSearchInRescue: body.disableWebSearchInRescue,
      apolloCallBudget: body.apolloCallBudget,
      signal: ctrl.signal,
    };

    let result: DiscoveryResult;
    try {
      const work = discover(discoveryInput);
      // Race the orchestrator against the outer timeout. On timeout we abort
      // the controller so in-flight Apollo calls stop promptly, then surface
      // the error.
      const timer = setTimeout(() => ctrl.abort(), DISCOVER_TIMEOUT_MS);
      try {
        result = await work;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isMissingAnthropic = /ANTHROPIC_API_KEY/.test(errMsg);
      const isMissingApollo = err instanceof ApolloMissingApiKeyError;
      const isApolloRate = err instanceof ApolloRateLimitError;
      const isTimeout =
        ctrl.signal.aborted ||
        /timeout|timed out|aborted|outer timeout/i.test(errMsg);
      const safeErr = redactApolloKey(redactSecrets(errMsg)).slice(0, 500);

      try {
        await db.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.prospectorDiscover,
          actionStatus: "failure",
          durationMs: Date.now() - start,
          errorDetail: safeErr,
          metadata: {
            brand: sanitizeForStorage(body.brand ?? "", 200),
            error_class: isMissingAnthropic
              ? "missing_anthropic_key"
              : isMissingApollo
                ? "missing_apollo_key"
                : isApolloRate
                  ? "apollo_rate_limit"
                  : isTimeout
                    ? "timeout"
                    : "discovery_error",
          },
        });
      } catch {}

      const status = isMissingAnthropic
        ? 503
        : isMissingApollo
          ? 503
          : isApolloRate
            ? 503
            : isTimeout
              ? 504
              : 502;
      const code = isMissingAnthropic
        ? "anthropic_not_configured"
        : isMissingApollo
          ? "apollo_not_configured"
          : isApolloRate
            ? "apollo_rate_limited"
            : isTimeout
              ? "discover_timeout"
              : "discover_failure";
      res.status(status).json({
        error: code,
        message: isMissingAnthropic
          ? "ANTHROPIC_API_KEY is not configured."
          : isMissingApollo
            ? "APOLLO_API_KEY is not configured."
            : isApolloRate
              ? "Apollo rate limit hit. Try again in a minute."
              : isTimeout
                ? "Discovery cascade exceeded the 300s timeout."
                : "Discovery failed.",
        retryAfterSeconds:
          isApolloRate && err instanceof ApolloRateLimitError
            ? err.retryAfterSeconds
            : undefined,
      });
      return;
    }

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorDiscover,
        actionStatus:
          result.status === "success"
            ? "success"
            : result.status === "no_org_found" ||
                result.status === "no_contacts_found"
              ? "skipped"
              : "failure",
        durationMs: Date.now() - start,
        metadata: {
          brand: sanitizeForStorage(body.brand ?? "", 200),
          app_name: sanitizeForStorage(body.appName ?? "", 200),
          status: result.status,
          resolution: result.audit.resolution,
          strict_strategy: result.audit.strictStrategy,
          upgraded_to_parent: result.audit.upgradedToParent,
          smart_search_ran: Boolean(result.audit.smartSearch),
          smart_match_confidence:
            result.audit.smartSearch?.confidence ?? null,
          opus_rescue_ran: Boolean(result.audit.opusRescue),
          opus_strategies_attempted:
            result.audit.opusRescue?.strategiesAttempted ?? null,
          opus_strategy_succeeded:
            result.audit.opusRescue?.strategySucceeded ?? null,
          opus_web_search_used:
            result.audit.opusRescue?.webSearchUsed ?? null,
          subsidiary_expansion_ran:
            result.audit.subsidiaryExpansion?.ran ?? false,
          subsidiaries_found:
            result.audit.subsidiaryExpansion?.subsidiariesFound ?? 0,
          apollo_calls_consumed: result.audit.apolloCallsConsumed,
          budget_exhausted: result.audit.budgetExhausted,
          aborted: result.audit.aborted,
          org_found: Boolean(result.org),
          org_name: result.org ? sanitizeForStorage(result.org.name, 200) : null,
          org_employees: result.org?.estimatedNumEmployees ?? null,
          contacts_returned: result.contacts.length,
          // Aggregate token usage across resolveCompany + smart + opus
          llm_input_tokens:
            (result.llmUsage.resolveCompany?.inputTokens ?? 0) +
            (result.llmUsage.smartValidator?.inputTokens ?? 0) +
            (result.llmUsage.opusRescue?.inputTokens ?? 0),
          llm_output_tokens:
            (result.llmUsage.resolveCompany?.outputTokens ?? 0) +
            (result.llmUsage.smartValidator?.outputTokens ?? 0) +
            (result.llmUsage.opusRescue?.outputTokens ?? 0),
        },
      });
    } catch {}

    // L1: record the full discovery LLM spend (Sonnet resolve + Sonnet-5
    // validator + Opus-4.8 rescue) into daily_usage so it counts toward the cap
    // and admin/weekly rollups. Priced per the model each sub-step actually
    // used. Best-effort — accounting, not the primary flow.
    const u = result.llmUsage;
    // Per-model, because these are THREE different models at three different
    // prices (sonnet-4-6 / sonnet-5 / opus-4-8). action_logs sums their tokens
    // into one number and records no USD at all, which is precisely the blend
    // the ledger exists to undo.
    const discoverCosts = [
      {
        task: "resolve_company",
        model: PROSPECTOR_SONNET_MODEL,
        usage: u.resolveCompany,
      },
      { task: "validate_orgs", model: "claude-sonnet-5", usage: u.smartValidator },
      { task: "opus_rescue", model: "claude-opus-4-8", usage: u.opusRescue },
    ].map((c) => ({
      ...c,
      cost: computeCost(c.model, c.usage?.inputTokens ?? 0, c.usage?.outputTokens ?? 0),
    }));

    const discoverSpendUsd = discoverCosts.reduce((a, c) => a + c.cost.usd, 0);
    await recordDailyLlmSpend(user.id, discoverSpendUsd).catch(() => {});

    // Ledger rows (2026-07-15). This whole cluster bypasses callLLMRole and was
    // missed by the original ledger plan — it is real spend on the prospector
    // path, and a ledger that omitted it would reconcile to the wrong number
    // while looking complete.
    //
    // Only stages that actually RAN get a row: smartValidator and opusRescue are
    // conditional, and a $0 row for a call that never happened is a lie in the
    // opposite direction from the one we're fixing.
    for (const c of discoverCosts) {
      if (!c.usage) continue;
      await recordLlmCall({
        ledger: { userId: user.id },
        task: c.task,
        model: c.model,
        provider: "anthropic",
        cost: c.cost,
      });
    }

    res.status(200).json({
      status: result.status,
      resolved: result.resolved,
      org: result.org,
      contacts: result.contacts,
      phasesRun: result.phasesRun,
      rejected: result.rejected,
      audit: result.audit,
      llmUsage: result.llmUsage,
    });
  },
);

// ── POST /prospector/classify-seed ─────────────────────────────────────────
// Turns a MINIMAL seed (company name OR Play/App Store/website URL) into a
// fully-classified prospect {company, vertical, subVertical, country, language,
// product} via seedClassifier (resolveUrl + Opus web_search). Operator-supplied
// overrides always win. The service is best-effort and does not throw.
const classifySeedBodySchema = z
  .object({
    seed: z.string().trim().min(1, "seed required").max(URL_MAX_LEN),
    company: z.string().trim().max(300).optional(),
    vertical: z.enum(["web_cps", "mobile"]).optional(),
    subVertical: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    language: z.string().trim().max(12).optional(),
    product: z.string().trim().max(200).optional(),
  })
  .strict();

router.post(
  "/prospector/classify-seed",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    // Cost-DoS guard: classify-seed bills an Opus + web_search call (~$0.12).
    // Rate-limit per user like the sibling expensive endpoints (resolve-company),
    // since the daily cap is off by default and best-effort under concurrency.
    const rl = checkResolveCompanyRateLimit(user.id);
    if (!rl.ok) {
      const retryAfterSec = Math.ceil(rl.resetMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many classify-seed calls. Limit is ${RESOLVE_RATE_MAX_CALLS} per minute. Retry in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    // Bills an Opus (web-search) call — pre-check the daily cap. No-op if unset.
    await assertUnderDailyLlmCap(user.id);

    let body: z.infer<typeof classifySeedBodySchema>;
    try {
      body = classifySeedBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    let classified;
    try {
      classified = await classifySeed({
        seed: body.seed,
        company: body.company,
        vertical: body.vertical,
        subVertical: body.subVertical,
        country: body.country,
        language: body.language,
        product: body.product,
        // From the session, never from `body` — every other field here is
        // caller-supplied, and "who pays for this" must not be.
        ledger: { userId: user.id },
      });
    } catch (err) {
      const safe = redactSecrets(
        err instanceof Error ? err.message : String(err),
      ).slice(0, 500);
      res.status(502).json({ error: "classify_failure", message: safe });
      return;
    }

    if (classified.costUsd > 0) {
      await recordDailyLlmSpend(user.id, classified.costUsd).catch(() => {});
    }

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectorCompanyResolved,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          via: "classify_seed",
          seed_type: classified.seedType,
          vertical: classified.vertical,
          sub_vertical: classified.subVertical,
          web_search_used: classified.webSearchUsed,
          cost_usd: classified.costUsd,
        },
      });
    } catch {
      // Audit log failure must not break the response.
    }

    res.status(200).json({ classified });
  },
);

export default router;

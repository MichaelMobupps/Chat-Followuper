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
import { resolveUrl, type ResolvedUrl } from "../services/urlResolver";
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

export default router;

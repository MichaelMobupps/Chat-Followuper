#!/usr/bin/env node
/**
 * Anchored, idempotent patch for artifacts/api-server/src/routes/prospector.ts
 * (which was created in Ticket 2.1-BE). Adds:
 *   - import for companyResolver service (with F3/F7 helpers)
 *   - in-memory rate limiter (F2)
 *   - POST /prospector/resolve-company route handler with:
 *     * Outer 200s timeout (F1) — caps SDK 2× retry exposure
 *     * Per-user rate limit (F2)
 *     * Sanitization of LLM output before action_log write (F3)
 *     * Secret redaction on error_detail (F7)
 *     * Token usage in response (F9)
 *
 * Two anchor points:
 *   1. The 2.1-BE urlResolver import line — insert new import after it.
 *   2. The trailing `export default router;` line — insert route block before it.
 */
import fs from "node:fs";

const PATH = "artifacts/api-server/src/routes/prospector.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-prospector-route] ${m}`);

// ─── Patch 1: import line ─────────────────────────────────────────────────

const importAnchor =
  'import { resolveUrl, type ResolvedUrl } from "../services/urlResolver";';
const importInsert =
  'import { resolveUrl, type ResolvedUrl } from "../services/urlResolver";\n' +
  'import {\n' +
  '  resolveCompany,\n' +
  '  redactSecrets,\n' +
  '  sanitizeForStorage,\n' +
  '  type ResolveCompanyInput,\n' +
  '  type ResolveCompanyResult,\n' +
  '} from "../services/companyResolver";';

if (src.includes('from "../services/companyResolver"')) {
  log("[SKIP] companyResolver import already present");
} else if (!src.includes(importAnchor)) {
  console.error(
    `[patch-prospector-route] [FAIL] import anchor not found: ${importAnchor}`,
  );
  console.error("       Apply 2.1-BE first if not done.");
  process.exit(2);
} else {
  src = src.replace(importAnchor, importInsert);
  log("[APPLY] added companyResolver import (with F3/F7 helpers)");
}

// ─── Patch 2: route handler block ─────────────────────────────────────────

const ROUTE_BLOCK = `// ─── Ticket 2.2-BE-A: /resolve-company ────────────────────────────────────
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
      reject(new Error(\`\${label} exceeded \${ms}ms outer timeout\`));
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
          \`Too many /resolve-company calls. Limit is \${RESOLVE_RATE_MAX_CALLS} per minute. Retry in \${retryAfterSec}s.\`,
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

`;

const exportAnchor = "export default router;";

if (src.includes('"/prospector/resolve-company"')) {
  log("[SKIP] /resolve-company route already present");
} else if (!src.includes(exportAnchor)) {
  console.error(
    `[patch-prospector-route] [FAIL] export anchor not found: ${exportAnchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(exportAnchor, ROUTE_BLOCK + exportAnchor);
  log("[APPLY] added /resolve-company route handler with audit fixes F1/F2/F3/F7/F9");
}

if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] prospector.ts updated");
}

// ─── Evidence ─────────────────────────────────────────────────────────────

const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  companyResolver_import: (
    finalSrc.match(/from "\.\.\/services\/companyResolver"/g) || []
  ).length,
  resolve_company_route: (
    finalSrc.match(/"\/prospector\/resolve-company"/g) || []
  ).length,
  resolve_urls_route_still_present: (
    finalSrc.match(/"\/prospector\/resolve-urls"/g) || []
  ).length,
  rate_limit_present: (
    finalSrc.match(/checkResolveCompanyRateLimit/g) || []
  ).length,
  withTimeout_present: (
    finalSrc.match(/RESOLVE_COMPANY_TIMEOUT_MS/g) || []
  ).length,
  sanitize_used: (
    finalSrc.match(/sanitizeForStorage/g) || []
  ).length,
  redact_used: (finalSrc.match(/redactSecrets/g) || []).length,
};
console.log("[patch-prospector-route] evidence:", JSON.stringify(evidence));
const minExpected = {
  companyResolver_import: 1,
  resolve_company_route: 1,
  resolve_urls_route_still_present: 1,
  rate_limit_present: 2, // function def + call site
  withTimeout_present: 2, // const + usage
  sanitize_used: 8, // multiple uses across success and failure paths
  redact_used: 2, // import + use
};
for (const [k, v] of Object.entries(minExpected)) {
  if (evidence[k] < v) {
    console.error(
      `[patch-prospector-route] [FAIL] evidence ${k}: got ${evidence[k]}, expected >= ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-prospector-route] all evidence checks passed");

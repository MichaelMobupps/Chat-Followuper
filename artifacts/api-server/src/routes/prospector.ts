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

export default router;

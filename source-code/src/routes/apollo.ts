import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import {
  db,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  searchOrg,
  searchPeople,
  revealContact,
  ApolloMissingApiKeyError,
  ApolloRateLimitError,
  ApolloAuthError,
  ApolloPersonNotFoundError,
  ApolloApiError,
  type ApolloOrgSummary,
  type ApolloPersonSummary,
  type ApolloRevealedContact,
} from "../services/apollo";
import { GeoGateBlockedError } from "../services/channels/whatsapp";

const router: IRouter = Router();

interface SearchOrgBody {
  brand: string;
  country?: string;
}

interface SearchPeopleBody {
  orgId: string;
  titles?: string[];
}

interface RevealBody {
  personId: string;
}

function isSearchOrgBody(value: unknown): value is SearchOrgBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.brand !== "string") return false;
  if (v.country !== undefined && typeof v.country !== "string") return false;
  return true;
}

function isSearchPeopleBody(value: unknown): value is SearchPeopleBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.orgId !== "string") return false;
  if (v.titles !== undefined) {
    if (!Array.isArray(v.titles)) return false;
    if (!v.titles.every((t) => typeof t === "string")) return false;
  }
  return true;
}

function isRevealBody(value: unknown): value is RevealBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.personId === "string";
}

/**
 * Map Apollo client exceptions to HTTP responses + action_log statuses.
 * Returns true if the error was handled (response sent), false otherwise
 * so the caller can rethrow for the central error handler.
 */
async function handleApolloError(
  err: unknown,
  res: Response,
  logCtx: {
    userId: string;
    actionType: string;
    durationMs: number;
  },
): Promise<boolean> {
  let httpStatus = 500;
  let errorCode = "apollo_unknown";
  let detail: string | null = null;

  if (err instanceof ApolloMissingApiKeyError) {
    httpStatus = 503;
    errorCode = "apollo_not_configured";
    detail = err.message;
  } else if (err instanceof ApolloRateLimitError) {
    httpStatus = 429;
    errorCode = "apollo_rate_limited";
    detail = err.message;
  } else if (err instanceof ApolloAuthError) {
    httpStatus = 502;
    errorCode = "apollo_auth_failed";
    detail = err.message;
  } else if (err instanceof ApolloPersonNotFoundError) {
    httpStatus = 404;
    errorCode = "person_not_found";
    detail = err.message;
  } else if (err instanceof GeoGateBlockedError) {
    httpStatus = 422;
    errorCode = "geo_blocked";
    detail = `Phone in country ${err.country ?? "unknown"} is outside the allowed market list.`;
  } else if (err instanceof ApolloApiError) {
    httpStatus = 502;
    errorCode = "apollo_api_error";
    detail = err.message;
  } else if (err instanceof Error) {
    detail = err.message;
  }

  // Write a failure action_log for every error path so the audit trail
  // shows attempted-but-failed Apollo calls. GeoGateBlockedError is logged
  // as success because the reveal call DID consume a credit; only the
  // post-reveal gate decision rejected the contact.
  try {
    await db.insert(actionLogsTable).values({
      userId: logCtx.userId,
      actionType: logCtx.actionType,
      actionStatus:
        err instanceof GeoGateBlockedError ? "skipped" : "failure",
      durationMs: logCtx.durationMs,
      errorDetail: detail,
    });
  } catch {
    // action_log write failure must not mask the original error
  }

  if (err instanceof GeoGateBlockedError) {
    res.status(httpStatus).json({
      error: errorCode,
      country: err.country,
    });
    return true;
  }

  res.status(httpStatus).json({ error: errorCode, detail });
  return true;
}

router.post(
  "/apollo/search-org",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    if (!isSearchOrgBody(req.body)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    try {
      const orgs: ApolloOrgSummary[] = await searchOrg(
        req.body.brand,
        req.body.country,
      );

      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.seederOrgSearch,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          brand: req.body.brand,
          country: req.body.country ?? null,
          resultCount: orgs.length,
        },
      });

      res.status(200).json({ orgs });
    } catch (err) {
      await handleApolloError(err, res, {
        userId: user.id,
        actionType: ACTION_TYPES.seederOrgSearch,
        durationMs: Date.now() - start,
      });
    }
  },
);

router.post(
  "/apollo/search-people",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    if (!isSearchPeopleBody(req.body)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    try {
      const people: ApolloPersonSummary[] = await searchPeople(
        req.body.orgId,
        req.body.titles ?? [],
      );

      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.seederPeopleSearch,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          orgId: req.body.orgId,
          titlesCount: req.body.titles?.length ?? 0,
          resultCount: people.length,
        },
      });

      res.status(200).json({ people });
    } catch (err) {
      await handleApolloError(err, res, {
        userId: user.id,
        actionType: ACTION_TYPES.seederPeopleSearch,
        durationMs: Date.now() - start,
      });
    }
  },
);

router.post(
  "/apollo/reveal",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    if (!isRevealBody(req.body)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    let revealed: ApolloRevealedContact;
    try {
      revealed = await revealContact(req.body.personId);
    } catch (err) {
      // GeoGateBlockedError is thrown AFTER Apollo charged the credit, so
      // we still increment apollo_reveals_used + log the action below.
      // The other Apollo errors mean no credit was consumed, so we just
      // map and return.
      if (err instanceof GeoGateBlockedError) {
        const today = new Date().toISOString().slice(0, 10);
        try {
          await db.transaction(async (tx) => {
            await tx
              .insert(dailyUsageTable)
              .values({
                userId: user.id,
                date: today,
                apolloRevealsUsed: 1,
              })
              .onConflictDoUpdate({
                target: [dailyUsageTable.userId, dailyUsageTable.date],
                set: {
                  apolloRevealsUsed: sql`${dailyUsageTable.apolloRevealsUsed} + 1`,
                },
              });

            await tx.insert(actionLogsTable).values({
              userId: user.id,
              actionType: ACTION_TYPES.seederReveal,
              actionStatus: "skipped",
              durationMs: Date.now() - start,
              errorDetail: `geo_blocked country=${err.country ?? "unknown"}`,
              metadata: { personId: req.body.personId, geoBlocked: true },
            });
          });
        } catch {
          // bookkeeping failure must not mask the geo-block response
        }
        res
          .status(422)
          .json({ error: "geo_blocked", country: err.country });
        return;
      }

      await handleApolloError(err, res, {
        userId: user.id,
        actionType: ACTION_TYPES.seederReveal,
        durationMs: Date.now() - start,
      });
      return;
    }

    // Success path: reveal happened cleanly, phone (if any) passed geo gate.
    // Increment daily_usage.apollo_reveals_used + write action_log in one tx.
    const today = new Date().toISOString().slice(0, 10);
    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(dailyUsageTable)
          .values({
            userId: user.id,
            date: today,
            apolloRevealsUsed: 1,
          })
          .onConflictDoUpdate({
            target: [dailyUsageTable.userId, dailyUsageTable.date],
            set: {
              apolloRevealsUsed: sql`${dailyUsageTable.apolloRevealsUsed} + 1`,
            },
          });

        await tx.insert(actionLogsTable).values({
          userId: user.id,
          actionType: ACTION_TYPES.seederReveal,
          actionStatus: "success",
          durationMs: Date.now() - start,
          metadata: {
            personId: revealed.id,
            hasEmail: revealed.email !== null,
            hasPhone: revealed.phone !== null,
            hasLinkedin: revealed.linkedinUrl !== null,
          },
        });
      });
    } catch (err) {
      // Bookkeeping failure: the SDR still got the reveal, but the audit
      // trail is missing a row. Surface as 200 with a warning rather than
      // 500 — failing the request would leave the credit consumed and the
      // SDR confused.
      res
        .status(200)
        .json({ contact: revealed, bookkeepingWarning: String(err) });
      return;
    }

    res.status(200).json({ contact: revealed });
  },
);

export default router;
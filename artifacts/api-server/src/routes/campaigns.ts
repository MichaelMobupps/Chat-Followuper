/**
 * Campaigns CRUD — Ticket 1.7.
 *
 * Endpoints (all gated by requireAuth + userId match):
 *   GET    /api/campaigns                       list non-archived
 *   GET    /api/campaigns?includeArchived=true  list including archived
 *   GET    /api/campaigns/:id                   detail with prospect count
 *   POST   /api/campaigns                       create
 *   PATCH  /api/campaigns/:id                   update fields
 *   POST   /api/campaigns/:id/archive           soft delete (sets archivedAt)
 *   POST   /api/campaigns/:id/unarchive         clears archivedAt
 *   DELETE /api/campaigns/:id                   hard delete (cascades
 *                                               prospects.campaignId to NULL)
 *
 * Cross-user access is prevented by AND-ing userId into every WHERE clause.
 * A 404 is returned when the campaign exists but belongs to another user;
 * we do not distinguish "not found" from "not yours" — both are 404.
 *
 * Channel validation: defaultChannel is checked against the ChannelCode
 * enum. Slack is intentionally rejected (master plan dropped it indefinitely);
 * the enum only accepts whatsapp / telegram / teams.
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  campaignsTable,
  db,
  prospectsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

// Channel enum at the route layer. Slack is excluded per the master plan
// decision log (#5: Slack dropped indefinitely). If Slack is ever revived,
// add it here and the schema column will already tolerate the value.
const ALLOWED_CHANNELS = ["whatsapp", "telegram", "teams"] as const;
const channelSchema = z.enum(ALLOWED_CHANNELS);

// ISO 639-1 language code: two lowercase letters.
const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/, "language must be ISO 639-1 (two lowercase letters)");

// ISO 3166-1 alpha-2 country code: two uppercase letters.
const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "country must be ISO 3166-1 alpha-2 (two uppercase letters)");

// Sub-vertical: free-form taxonomy code, validated by the doctrine layer
// elsewhere. Here we only guard against pathological values (length).
const subVerticalSchema = z.string().min(1).max(100);

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  defaultChannel: channelSchema.optional(),
  defaultSubVertical: subVerticalSchema.optional().nullable(),
  defaultLanguage: languageSchema.optional().nullable(),
  defaultCountry: countrySchema.optional().nullable(),
});

const updateBodySchema = createBodySchema.partial();

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function notFound(res: Response): void {
  res.status(404).json({ error: "not_found" });
}

function badRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: "invalid_body",
    issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

// Owned-fetch: returns the campaign only if it belongs to the user. Used
// before mutations so we never touch another user's row.
async function fetchOwnedCampaign(campaignId: string, userId: string) {
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.id, campaignId),
        eq(campaignsTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/campaigns
// ─────────────────────────────────────────────────────────────────

router.get(
  "/campaigns",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const includeArchived = String(req.query["includeArchived"] ?? "") === "true";

    const conditions = includeArchived
      ? eq(campaignsTable.userId, user.id)
      : and(eq(campaignsTable.userId, user.id), isNull(campaignsTable.archivedAt));

    const rows = await db
      .select()
      .from(campaignsTable)
      .where(conditions)
      .orderBy(desc(campaignsTable.updatedAt));

    res.status(200).json({ campaigns: rows });
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/campaigns/:id
// ─────────────────────────────────────────────────────────────────

router.get(
  "/campaigns/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const campaignId = String(req.params.id);

    const campaign = await fetchOwnedCampaign(campaignId, user.id);
    if (!campaign) {
      notFound(res);
      return;
    }

    // Prospect count for this campaign. AND-ed with userId as defense in
    // depth, even though the campaign was already userId-checked.
    const countRows = await db
      .select({ value: count() })
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.campaignId, campaignId),
          eq(prospectsTable.userId, user.id),
        ),
      );

    const prospectCount = countRows[0]?.value ?? 0;

    res.status(200).json({ campaign, prospectCount });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/campaigns
// ─────────────────────────────────────────────────────────────────

router.post(
  "/campaigns",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error);
      return;
    }

    const inserted = await db
      .insert(campaignsTable)
      .values({
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        defaultChannel: parsed.data.defaultChannel ?? "whatsapp",
        defaultSubVertical: parsed.data.defaultSubVertical ?? null,
        defaultLanguage: parsed.data.defaultLanguage ?? null,
        defaultCountry: parsed.data.defaultCountry ?? null,
      })
      .returning();

    res.status(201).json({ campaign: inserted[0] });
  },
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/campaigns/:id
// ─────────────────────────────────────────────────────────────────

router.patch(
  "/campaigns/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const campaignId = String(req.params.id);

    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error);
      return;
    }

    // Ownership check before mutation.
    const existing = await fetchOwnedCampaign(campaignId, user.id);
    if (!existing) {
      notFound(res);
      return;
    }

    // Build a partial update set; only include fields explicitly provided
    // (so PATCH semantics are honored — undefined ≠ null).
    const updates: Record<string, unknown> = {};
    if ("name" in parsed.data) updates["name"] = parsed.data.name;
    if ("description" in parsed.data) updates["description"] = parsed.data.description ?? null;
    if ("defaultChannel" in parsed.data) updates["defaultChannel"] = parsed.data.defaultChannel;
    if ("defaultSubVertical" in parsed.data) updates["defaultSubVertical"] = parsed.data.defaultSubVertical ?? null;
    if ("defaultLanguage" in parsed.data) updates["defaultLanguage"] = parsed.data.defaultLanguage ?? null;
    if ("defaultCountry" in parsed.data) updates["defaultCountry"] = parsed.data.defaultCountry ?? null;

    if (Object.keys(updates).length === 0) {
      // No-op update; return current state.
      res.status(200).json({ campaign: existing });
      return;
    }

    const updated = await db
      .update(campaignsTable)
      .set(updates)
      .where(
        and(
          eq(campaignsTable.id, campaignId),
          eq(campaignsTable.userId, user.id),
        ),
      )
      .returning();

    res.status(200).json({ campaign: updated[0] });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/campaigns/:id/archive
// ─────────────────────────────────────────────────────────────────

router.post(
  "/campaigns/:id/archive",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const campaignId = String(req.params.id);

    const updated = await db
      .update(campaignsTable)
      .set({ archivedAt: sql`NOW()` })
      .where(
        and(
          eq(campaignsTable.id, campaignId),
          eq(campaignsTable.userId, user.id),
        ),
      )
      .returning();

    if (updated.length === 0) {
      notFound(res);
      return;
    }

    res.status(200).json({ campaign: updated[0] });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/campaigns/:id/unarchive
// ─────────────────────────────────────────────────────────────────

router.post(
  "/campaigns/:id/unarchive",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const campaignId = String(req.params.id);

    const updated = await db
      .update(campaignsTable)
      .set({ archivedAt: null })
      .where(
        and(
          eq(campaignsTable.id, campaignId),
          eq(campaignsTable.userId, user.id),
        ),
      )
      .returning();

    if (updated.length === 0) {
      notFound(res);
      return;
    }

    res.status(200).json({ campaign: updated[0] });
  },
);

// ─────────────────────────────────────────────────────────────────
// DELETE /api/campaigns/:id
// ─────────────────────────────────────────────────────────────────
// Hard delete. Foreign-key cascade on prospects.campaignId is
// ON DELETE SET NULL (defined in the prospects schema), so prospects
// survive but lose their campaign association.

router.delete(
  "/campaigns/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const campaignId = String(req.params.id);

    const deleted = await db
      .delete(campaignsTable)
      .where(
        and(
          eq(campaignsTable.id, campaignId),
          eq(campaignsTable.userId, user.id),
        ),
      )
      .returning({ id: campaignsTable.id });

    if (deleted.length === 0) {
      notFound(res);
      return;
    }

    res.status(200).json({ ok: true, id: deleted[0]?.id });
  },
);

export default router;

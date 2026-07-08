import { Router, type IRouter, type Request, type Response } from "express";
import { z, ZodError } from "zod/v4";
import { requireAuth } from "../middlewares/auth";
import { generateLink } from "../services/channels/whatsapp";
import { generateLink as generateTelegramLink } from "../services/channels/telegram";

const router: IRouter = Router();

const PHONE_RE = /^\+[1-9]\d{6,14}$/;
// C1: Telegram usernames must start with a letter (mirrors TELEGRAM_HANDLE_RE
// in routes/prospects.ts) — the old all-alphanumeric class matched bare digits.
const HANDLE_RE = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

const bodySchema = z
  .object({
    channel: z.enum(["whatsapp", "telegram", "linkedin"]),
    identifier: z.string().trim().min(1).max(64),
    message: z.string().trim().min(1).max(2000).default(
      "Test message from Chat Followuper.",
    ),
  })
  .strict();

/**
 * POST /api/users/me/test-channel-link
 *
 * Build a deep link to the user's own WhatsApp or Telegram so they can
 * verify the send path works. Does not touch prospects or follow-ups.
 */
router.post(
  "/users/me/test-channel-link",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    if (body.channel === "whatsapp") {
      if (!PHONE_RE.test(body.identifier)) {
        res.status(400).json({
          error: "invalid_identifier",
          detail: "Use E.164 format, e.g. +972501234567",
        });
        return;
      }
      const deepLinkUrl = generateLink(body.identifier, body.message);
      res.status(200).json({
        channel: "whatsapp",
        deepLinkUrl,
        message: body.message,
        target: body.identifier,
      });
      return;
    }

    let deepLinkUrl: string;
    if (PHONE_RE.test(body.identifier)) {
      deepLinkUrl = generateTelegramLink(body.identifier, body.message);
    } else if (HANDLE_RE.test(body.identifier)) {
      deepLinkUrl = generateTelegramLink(body.identifier, body.message);
    } else {
      res.status(400).json({
        error: "invalid_identifier",
        detail: "Use +phone or @handle for Telegram.",
      });
      return;
    }

    res.status(200).json({
      channel: "telegram",
      deepLinkUrl,
      message: body.message,
      target: body.identifier,
    });
  },
);

export default router;
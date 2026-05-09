import express, { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { processPhoneRevealCallback } from "../services/apollo";
import {
  verifyWebhookSignature,
  readSignatureHeader,
} from "../services/apolloWebhookSecurity";

/**
 * POST /api/apollo/webhook/phone-reveal — public endpoint Apollo posts to
 * when an async phone-reveal request resolves. The HMAC signature IS the
 * authentication; there is no session cookie or bearer token (well —
 * there is a bearer-token fallback, see below).
 *
 * Verification order (fail-closed):
 *
 *   1. Method gate. Express routes are method-specific by default; we
 *      register POST only. A separate router-level handler registers a
 *      405 for everything else on this path so curl GET surfaces a
 *      useful error rather than the catch-all 404.
 *
 *   2. Raw body capture. Express's express.json() middleware destroys
 *      the bytes needed for HMAC by JSON-parsing in place. We mount
 *      express.raw on this route only so req.body is a Buffer here.
 *
 *   3. Auth. Two modes accepted (ticket §HMAC verification details):
 *        a. APOLLO_WEBHOOK_SECRET set: HMAC-SHA256 over raw body in
 *           X-Apollo-Signature (or X-Apollo-Webhook-Signature, or
 *           X-Hub-Signature-256). Bare hex or sha256= prefix.
 *        b. Otherwise APOLLO_WEBHOOK_SHARED_SECRET set: Authorization:
 *           Bearer <secret>. Constant-time compare.
 *      Neither set: 401 unconditionally. Failing closed is the correct
 *      default — without a verifier, the body cannot be trusted.
 *
 *   4. Body parse. Only after auth passes do we JSON.parse the buffer.
 *
 *   5. Hand off to processPhoneRevealCallback in services/apollo.ts.
 *      That function handles correlationId lookup, idempotency, geo
 *      gate, and the action_logs writes inside one transaction.
 *
 *   6. ALWAYS return 200 on a verified payload — even when the
 *      correlationId is unknown, even when the geo gate blocks. Apollo
 *      retries on non-2xx and we don't want them retrying our 4xx
 *      semantics. The only non-200 paths are pre-auth (401 for bad
 *      signatures, 415 for non-JSON content type, 405 for non-POST).
 */

const router: IRouter = Router();

const WEBHOOK_PATH = "/apollo/webhook/phone-reveal";

/**
 * Bearer-token fallback comparison. Accepts the raw secret value or a
 * "Bearer <secret>" prefix. Constant-time compare. Returns false on
 * any irregularity.
 */
function verifyBearer(authHeader: string | undefined, secret: string): boolean {
  if (!secret || secret.length === 0) return false;
  if (!authHeader || typeof authHeader !== "string") return false;
  let presented = authHeader.trim();
  if (presented.toLowerCase().startsWith("bearer ")) {
    presented = presented.slice("bearer ".length).trim();
  }
  if (presented.length === 0) return false;
  if (presented.length !== secret.length) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post(
  WEBHOOK_PATH,
  // Raw body parser scoped to this route ONLY. Mounting express.json()
  // ahead of this on the same path would silently turn req.body into a
  // parsed object, defeating HMAC.
  express.raw({ type: ["application/json", "application/*+json"], limit: "1mb" }),
  async (req: Request, res: Response): Promise<void> => {
    const log = req.log;

    // Body should be a Buffer thanks to express.raw. If something replaced
    // express.raw with json() on this path (e.g. a future refactor), the
    // body might already be parsed; treat that as misconfiguration and
    // 500 rather than guessing — silently re-deriving the bytes via
    // JSON.stringify would NOT be the original bytes Apollo signed.
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      log?.error(
        { type: typeof raw },
        "apollo webhook misconfigured: req.body is not a Buffer",
      );
      res.status(500).json({ error: "webhook_misconfigured" });
      return;
    }

    const hmacSecret = process.env.APOLLO_WEBHOOK_SECRET ?? "";
    const sharedSecret = process.env.APOLLO_WEBHOOK_SHARED_SECRET ?? "";

    // Pre-auth: at least ONE auth mode must be configured. Without one,
    // accepting the request would be the same as having no auth at all.
    if (hmacSecret.length === 0 && sharedSecret.length === 0) {
      log?.warn(
        "apollo webhook received but no APOLLO_WEBHOOK_SECRET or APOLLO_WEBHOOK_SHARED_SECRET configured; rejecting",
      );
      res.status(401).json({ error: "webhook_not_configured" });
      return;
    }

    // Try HMAC mode first if its secret is set. Then fall back to bearer.
    let authPassed = false;

    if (hmacSecret.length > 0) {
      const sigHeader = readSignatureHeader(req.headers);
      if (verifyWebhookSignature(raw, sigHeader, hmacSecret)) {
        authPassed = true;
      }
    }

    if (!authPassed && sharedSecret.length > 0) {
      const auth = req.headers["authorization"];
      const authStr = Array.isArray(auth) ? auth[0] : auth;
      if (verifyBearer(authStr, sharedSecret)) {
        authPassed = true;
      }
    }

    if (!authPassed) {
      log?.warn(
        {
          hasHmacSecret: hmacSecret.length > 0,
          hasSharedSecret: sharedSecret.length > 0,
          hasSigHeader: Boolean(readSignatureHeader(req.headers)),
          hasAuthHeader: Boolean(req.headers["authorization"]),
        },
        "apollo webhook auth failed",
      );
      res.status(401).json({ error: "invalid_signature" });
      return;
    }

    // Auth passed. Parse the JSON now.
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch (err) {
      log?.warn({ err: String(err) }, "apollo webhook body is not valid JSON");
      // Still 200 — Apollo retrying won't help if the body is corrupt.
      // But we surface the parse error in the response body for ops
      // visibility without leaking details Apollo could exploit.
      res.status(200).json({ ok: false, reason: "invalid_json" });
      return;
    }

    try {
      const outcome = await processPhoneRevealCallback(payload);
      log?.info(
        { outcome: outcome.kind },
        "apollo webhook processed",
      );
      // Always 200 to suppress Apollo's retry on non-2xx. The outcome is
      // returned in the body for ops + integration test visibility.
      res.status(200).json({ ok: true, outcome: outcome.kind });
    } catch (err) {
      log?.error(
        { err: err instanceof Error ? err.message : String(err) },
        "apollo webhook processing failed",
      );
      // 500 means Apollo WILL retry (status >= 500 is the documented
      // retry trigger). That's intentional here: a DB outage or transient
      // failure SHOULD be retried, unlike the geo-block path which is
      // terminal and returns 200.
      res.status(500).json({ error: "processing_failed" });
    }
  },
);

// Method-not-allowed handlers for the same path. Surfaces a useful 405
// for curl GET smoke tests rather than the catch-all 404. Order matters:
// these must be registered AFTER the POST handler so they catch only
// other methods.
router.all(WEBHOOK_PATH, (_req: Request, res: Response): void => {
  res.set("Allow", "POST");
  res.status(405).json({ error: "method_not_allowed" });
});

export default router;
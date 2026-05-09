import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Apollo webhook signature verification.
 *
 * Apollo's webhook signing surface varies by plan tier and the public
 * docs do not commit to a single signing scheme that is reachable
 * without a logged-in dashboard session. Ticket 1.5b authorizes a
 * dual-mode design that is fail-closed in both modes:
 *
 *   PRIMARY (preferred when APOLLO_WEBHOOK_SECRET is set):
 *     HMAC-SHA256 over the raw request body, hex digest, sent in a
 *     dedicated signature header (X-Apollo-Signature by default; the
 *     handler also accepts X-Apollo-Webhook-Signature and the
 *     industry-conventional X-Hub-Signature-256 to absorb minor naming
 *     variation across plan tiers). The header value is accepted as
 *     bare hex OR with a "sha256=" prefix.
 *
 *   FALLBACK (when only APOLLO_WEBHOOK_SHARED_SECRET is set):
 *     The route handler authenticates via Authorization: Bearer
 *     <shared-secret>. Less standard but documented in the ticket as
 *     acceptable for plan tiers that do not sign webhooks.
 *
 * Both unset: the webhook handler returns 401 unconditionally. This
 * is the desired fail-closed default — without a verifier you cannot
 * trust the body, period.
 *
 * The functions in this file implement only the HMAC mode. The bearer
 * fallback is a one-liner inside the route handler and does not
 * warrant a separate helper.
 *
 * Constant-time comparison via crypto.timingSafeEqual. Buffer-length
 * mismatch is checked BEFORE calling timingSafeEqual, which throws on
 * mismatched lengths and would otherwise leak length-information via
 * the timing of the throw.
 */

/**
 * Compute the HMAC-SHA256 hex digest of the raw body using the secret.
 * Exposed primarily so the integration test can mint valid signatures.
 *
 * Returns lowercase hex with no prefix. Callers that need the
 * sha256= prefix prepend it themselves.
 */
export function signWebhookPayload(body: Buffer | string, secret: string): string {
  if (!secret || secret.length === 0) {
    throw new Error("signWebhookPayload requires a non-empty secret");
  }
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return createHmac("sha256", secret).update(buf).digest("hex");
}

/**
 * Verify that signatureHeader is a valid HMAC-SHA256 signature for
 * rawBody under secret. Returns false on any of:
 *
 *   - missing/empty signature header
 *   - missing/empty secret (caller should pre-check; we double-check)
 *   - non-hex characters in the signature value
 *   - hex length mismatch (an HMAC-SHA256 hex digest is exactly 64 chars)
 *   - constant-time byte comparison fails
 *
 * Accepts header value as bare hex or with the "sha256=" prefix.
 * Whitespace is trimmed. Comparison is case-insensitive on the hex
 * (we lowercase both sides before timingSafeEqual).
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined | null,
  secret: string,
): boolean {
  if (!secret || secret.length === 0) return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  // Strip optional "sha256=" prefix and surrounding whitespace.
  let candidate = signatureHeader.trim();
  if (candidate.toLowerCase().startsWith("sha256=")) {
    candidate = candidate.slice("sha256=".length).trim();
  }
  if (candidate.length === 0) return false;

  // Reject anything that is not pure hex up front. This blocks accidental
  // base64 payloads (which contain '+' '/' '=') from triggering the
  // length check on a buffer the caller could not possibly have intended.
  if (!/^[0-9a-fA-F]+$/.test(candidate)) return false;

  // HMAC-SHA256 hex digest is exactly 64 characters (32 bytes). A length
  // mismatch is a guaranteed-fail; we return early so timingSafeEqual is
  // never called with mismatched-length buffers (it throws in that case
  // and the throw timing itself would leak length information).
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (candidate.length !== expected.length) return false;

  // Lowercase both sides — HMAC libraries on the producer side may emit
  // upper or lower hex; we accept either.
  const a = Buffer.from(candidate.toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");

  // Defence-in-depth: even after the length pre-check, only call
  // timingSafeEqual when lengths match. The pre-check guarantees this
  // but a future refactor that drops the pre-check would otherwise
  // crash the request thread.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Headers the webhook handler will check, in priority order. The first
 * header present in the request is used. This order absorbs variation
 * across Apollo plan tiers and is intentionally permissive on the
 * accepted-name side while strict on the cryptographic check.
 */
export const SIGNATURE_HEADER_CANDIDATES: ReadonlyArray<string> = [
  "x-apollo-signature",
  "x-apollo-webhook-signature",
  "x-hub-signature-256",
];

/**
 * Read the signature header from a normalised header bag (Express
 * lowercases all header names by default). Returns the first matching
 * value, or undefined when none is present.
 */
export function readSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  for (const name of SIGNATURE_HEADER_CANDIDATES) {
    const v = headers[name];
    if (typeof v === "string" && v.length > 0) return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  }
  return undefined;
}
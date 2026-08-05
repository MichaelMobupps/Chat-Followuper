import { createHmac, timingSafeEqual } from "node:crypto";

// API5: 72h, down from 14 days. The token carries read access to the prospect's
// phone + message and rides in the `?t=` query string (so it lands in logs and
// email history) — a 14-day replay window was the risk. A short TTL is safe
// because every digest send (email + pushover) re-mints a fresh token, so a
// link expiring between digests is simply superseded by the next one. 72h keeps
// a Friday link valid across the weekend even if a daily digest is missed once.
// Overridable via FOLLOWUP_LINK_TTL_HOURS.
// NOTE (residual): true single-use / invalidate-on-confirm would need a
// per-followup nonce column + migration; left as a documented sub-residual so
// re-opening a still-valid link (legitimate) keeps working.
const DEFAULT_TTL_HOURS = 72;

function resolveTtlHours(): number {
  const raw = Number(process.env.FOLLOWUP_LINK_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
}

function secret(): string {
  const s = process.env.FOLLOWUP_LINK_SECRET;
  if (!s || s.length === 0) {
    throw new Error(
      "FOLLOWUP_LINK_SECRET is not set; required to sign follow-up open links.",
    );
  }
  return s;
}

function sign(followupId: number, userId: string, exp: number): string {
  return createHmac("sha256", secret())
    .update(`${followupId}.${userId}.${exp}`)
    .digest("hex");
}

/**
 * Mint a stateless open-link token bound to one follow-up and its owner.
 * The userId is signed in but never placed in the URL; the open route looks
 * it up from the follow-up's prospect and recomputes the signature.
 */
export function mintOpenToken(followupId: number, userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + resolveTtlHours() * 3600;
  return `${exp}.${sign(followupId, userId, exp)}`;
}

export function verifyOpenToken(
  token: string,
  followupId: number,
  userId: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(followupId, userId, exp);
  const a = Buffer.from(parts[1], "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

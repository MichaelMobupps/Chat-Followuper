import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "cf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

function getSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET environment variable must be set to a strong random string.",
    );
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const normalized =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(normalized, "base64");
}

function sign(payload: string): string {
  const sig = createHmac("sha256", getSecret()).update(payload).digest();
  return base64UrlEncode(sig);
}

export function signSession(input: { userId: string; email: string }): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = {
    userId: input.userId,
    email: input.email,
    exp,
  };
  const payloadStr = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(payloadStr);
  return `${payloadStr}.${sig}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payloadStr);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(payloadStr).toString("utf8"));
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as SessionPayload).userId !== "string" ||
    typeof (parsed as SessionPayload).email !== "string" ||
    typeof (parsed as SessionPayload).exp !== "number"
  ) {
    return null;
  }

  const payload = parsed as SessionPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
};

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function clearedSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

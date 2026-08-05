import { Router, type IRouter } from "express";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  usersTable,
  oauthNoncesTable,
  type User,
} from "@workspace/db";
import {
  SESSION_COOKIE_NAME,
  signSession,
  sessionCookieOptions,
} from "../lib/session";
import { appPath, googleOAuthRedirectUri } from "../lib/appConfig";

const router: IRouter = Router();

const PROVIDER = "google-login";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const GOOGLE_AUTHZ = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
// Identity-only scopes. NO Gmail or Calendar scopes.
const SCOPES = "openid email profile";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAllowedDomains(): string[] {
  const raw = process.env["ALLOWED_LOGIN_DOMAINS"] ?? "mobupps.com";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

function loginErrorRedirect(code: string): string {
  return `${appPath("/login")}?error=${encodeURIComponent(code)}`;
}

/** DB2: one-way digest of the OAuth state, so oauth_nonces stores no raw token. */
function hashNonce(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

router.get("/auth/google/start", async (req, res) => {
  try {
    const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
    // Bundle 2: GOOGLE_OAUTH_REDIRECT_URI still wins wherever it is set, so
    // the value registered in the Google console is never second-guessed and
    // this is dark by construction. Only when it is absent is the URI derived
    // from PUBLIC_URL, which is what lets a base-path move follow PUBLIC_URL.
    const redirectUri = googleOAuthRedirectUri();

    const state = randomBytes(24).toString("base64url");

    // DB2: store only a SHA-256 digest of the OAuth state, never the raw value.
    // The raw `state` still travels to Google and comes back in the callback; we
    // re-hash it there to look the row up. A DB-read attacker sees only digests
    // and can't forge a valid callback state (no preimage). Keyless — no KMS
    // needed for this one (unlike the token-encryption items).
    await db.insert(oauthNoncesTable).values({
      nonce: hashNonce(state),
      provider: PROVIDER,
      redirectUri,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      state,
      access_type: "online",
      prompt: "select_account",
      include_granted_scopes: "false",
    });

    res.redirect(302, `${GOOGLE_AUTHZ}?${params.toString()}`);
  } catch (err) {
    req.log?.error({ err }, "google oauth start failed");
    res.redirect(302, loginErrorRedirect("oauth_start_failed"));
  }
});

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string;
};

router.get("/auth/google/callback", async (req, res) => {
  try {
    const errParam = req.query["error"];
    if (typeof errParam === "string" && errParam.length > 0) {
      req.log?.warn({ err: errParam }, "google oauth returned error");
      res.redirect(302, loginErrorRedirect("oauth_denied"));
      return;
    }

    const code = req.query["code"];
    const state = req.query["state"];
    if (typeof code !== "string" || typeof state !== "string") {
      res.redirect(302, loginErrorRedirect("oauth_invalid_response"));
      return;
    }

    // Atomically consume the nonce (mark consumed_at=now only if it was unconsumed and unexpired).
    const consumed = await db
      .update(oauthNoncesTable)
      .set({ consumedAt: new Date() })
      .where(
        and(
          // DB2: look up by the digest of the returned state (stored hashed).
          eq(oauthNoncesTable.nonce, hashNonce(state)),
          eq(oauthNoncesTable.provider, PROVIDER),
          isNull(oauthNoncesTable.consumedAt),
        ),
      )
      .returning();

    const nonceRow = consumed[0];
    if (!nonceRow || nonceRow.expiresAt.getTime() < Date.now()) {
      req.log?.warn({ state }, "oauth state invalid, expired, or replayed");
      res.redirect(302, loginErrorRedirect("oauth_state_invalid"));
      return;
    }

    const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = getEnv("GOOGLE_OAUTH_CLIENT_SECRET");
    // Must be byte-identical to the one sent on the authorization request.
    const redirectUri = googleOAuthRedirectUri();

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      req.log?.error(
        { status: tokenRes.status, body },
        "google token exchange failed",
      );
      res.redirect(302, loginErrorRedirect("oauth_token_exchange_failed"));
      return;
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokens.access_token) {
      res.redirect(302, loginErrorRedirect("oauth_token_exchange_failed"));
      return;
    }

    const userinfoRes = await fetch(GOOGLE_USERINFO, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoRes.ok) {
      req.log?.error(
        { status: userinfoRes.status },
        "google userinfo fetch failed",
      );
      res.redirect(302, loginErrorRedirect("oauth_userinfo_failed"));
      return;
    }

    const userinfo = (await userinfoRes.json()) as GoogleUserInfo;
    const email = userinfo.email?.toLowerCase().trim();

    if (!email || !userinfo.email_verified) {
      res.redirect(302, loginErrorRedirect("email_not_verified"));
      return;
    }

    const allowedDomains = getAllowedDomains();
    const at = email.lastIndexOf("@");
    const emailDomain = at >= 0 ? email.slice(at + 1) : "";
    if (!allowedDomains.includes(emailDomain)) {
      req.log?.warn(
        { email, allowedDomains },
        "rejected login from disallowed domain",
      );
      res.redirect(302, loginErrorRedirect("domain_not_allowed"));
      return;
    }

    const name = userinfo.name?.trim() || null;

    const upserted = await db
      .insert(usersTable)
      .values({ email, name })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: { name },
      })
      .returning();

    const user = upserted[0] as User;
    if (!user) {
      req.log?.error({ email }, "user upsert returned no row");
      res.redirect(302, loginErrorRedirect("user_upsert_failed"));
      return;
    }

    const token = signSession({ userId: user.id, email: user.email });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.redirect(302, appPath("/"));
  } catch (err) {
    req.log?.error({ err }, "google oauth callback failed");
    res.redirect(302, loginErrorRedirect("oauth_callback_failed"));
  }
});

export default router;

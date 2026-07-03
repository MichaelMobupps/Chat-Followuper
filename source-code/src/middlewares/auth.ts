import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isAdminEmail } from "../lib/admin";
import {
  SESSION_COOKIE_NAME,
  verifySession,
  type SessionPayload,
} from "../lib/session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string | null };
      session?: SessionPayload;
    }
  }
}

/**
 * Best-effort: if a valid session cookie is present, populate `req.user`.
 * Does NOT reject when missing/invalid — use `requireAuth` for that.
 */
export async function loadUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const session = verifySession(token);
    if (!session) {
      next();
      return;
    }

    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    const user = rows[0];
    if (user) {
      req.user = user;
      req.session = session;
    }
    next();
  } catch (err) {
    req.log?.error({ err }, "loadUser middleware failed");
    next();
  }
}

/**
 * Hard gate. Requires `loadUser` to have run earlier in the chain.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}

/**
 * Hard admin gate. Requires requireAuth earlier in the chain. Grants access
 * only to emails in ADMIN_EMAILS; every other authenticated user gets 403
 * and stays isolated to their own data.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  if (!isAdminEmail(req.user.email)) {
    res.status(403).json({ error: "forbidden_not_admin" });
    return;
  }
  next();
}

import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  clearedSessionCookiePaths,
} from "../lib/session";
import { appPath } from "../lib/appConfig";

const router: IRouter = Router();

/**
 * Clear the session cookie at every path it could have been issued under.
 * At the default base that is the single path "/", so the emitted header is
 * unchanged from before Bundle 2.
 */
function clearSession(res: {
  clearCookie: (name: string, options: Record<string, unknown>) => unknown;
}): void {
  const options = clearedSessionCookieOptions();
  for (const path of clearedSessionCookiePaths()) {
    res.clearCookie(SESSION_COOKIE_NAME, { ...options, path });
  }
}

router.get("/auth/me", requireAuth, (req, res) => {
  // requireAuth guarantees req.user is populated
  const user = req.user!;
  const data = GetCurrentUserResponse.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    // Admin kill switch (2026-07-15). Every send path enforces this server-side;
    // without surfacing it the rep would press Send and get an unexplained 409.
    followupsPaused: user.followupsPaused,
  });
  res.json(data);
});

router.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

// Convenience: GET /auth/logout also works (browser navigation flow).
// Clears the cookie and redirects to /login.
router.get("/auth/logout", (_req, res) => {
  clearSession(res);
  res.redirect(302, appPath("/login"));
});

export default router;

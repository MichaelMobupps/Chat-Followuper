import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
} from "../lib/session";

const router: IRouter = Router();

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
  res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
  res.status(204).end();
});

// Convenience: GET /auth/logout also works (browser navigation flow).
// Clears the cookie and redirects to /login.
router.get("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
  res.redirect(302, "/login");
});

export default router;

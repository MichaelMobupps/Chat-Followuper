import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import apolloWebhookRouter from "./routes/apolloWebhook";
import { researchStreamRoute } from "./routes/researchStream";
import { logger } from "./lib/logger";
import { loadUser } from "./middlewares/auth";
import { DailyLlmCapExceededError } from "./lib/llmSpendCap";
import { ApolloRevealCapExceededError } from "./lib/apolloRevealCap";
import { InvalidPhoneError } from "./services/channels/whatsapp";
import { uniqueViolationCode } from "./lib/dbErrors";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());

// Apollo webhook MUST be mounted BEFORE express.json() so that the
// route's express.raw middleware can capture the original request
// bytes for HMAC signature verification. JSON-parsing in place would
// destroy the bytes Apollo signed against. The router contains its
// own express.raw middleware scoped to the webhook path.
app.use("/api", apolloWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Best-effort session loader: populates req.user when a valid session cookie
// is present. Routes opt-in to authentication via `requireAuth`.
app.use("/api", loadUser);

app.get("/api/prospects/research/stream", researchStreamRoute);
app.use("/api", router);

// Terminal error handler — MUST be last. Without it, Express 5's default
// handler serializes err.stack into the response body whenever NODE_ENV is not
// "production", leaking internal paths / SQL fragments / possibly secret-bearing
// error text to any caller. Log the full error server-side; return a generic
// body. (Route handlers that already responded delegate back to Express.)
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  // Per-user daily LLM spend cap (LLM3): a pre-generation guard throws this so
  // every generation entry point surfaces it consistently as 429, without each
  // route re-implementing the mapping.
  if (err instanceof DailyLlmCapExceededError) {
    res.status(429).json({
      error: "daily_cap_exceeded",
      spentUsd: err.spentUsd,
      capUsd: err.capUsd,
    });
    return;
  }
  // Monthly Apollo reveal cap (APO1/API3).
  if (err instanceof ApolloRevealCapExceededError) {
    res.status(429).json({
      error: "apollo_reveal_cap_exceeded",
      used: err.used,
      cap: err.cap,
    });
    return;
  }
  // Invalid E.164 phone (CH2): a format failure surfaced from a deep-link
  // builder. 422 `invalid_phone`, not the misleading `geo_blocked`.
  if (err instanceof InvalidPhoneError) {
    res.status(422).json({ error: "invalid_phone" });
    return;
  }
  // Unique-constraint violation (D1/A4): a duplicate identity insert/update
  // (telegram handle, apolloPersonId, phone…) that the route's pre-check SELECT
  // didn't catch (concurrent write, or a PATCH collision with no pre-check).
  // Map to 409 with a stable code instead of an opaque 500. Logged below is the
  // raw error; the client sees only the code (no constraint/SQL text).
  const dupCode = uniqueViolationCode(err);
  if (dupCode) {
    logger.warn({ err }, "unique constraint violation");
    res.status(409).json({ error: dupCode });
    return;
  }
  logger.error({ err }, "unhandled route error");
  res.status(500).json({ error: "internal" });
};
app.use(errorHandler);

export default app;
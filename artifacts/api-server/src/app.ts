import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import apolloWebhookRouter from "./routes/apolloWebhook";
import { researchStreamRoute } from "./routes/researchStream";
import { logger } from "./lib/logger";
import { loadUser } from "./middlewares/auth";

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
  logger.error({ err }, "unhandled route error");
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "internal" });
};
app.use(errorHandler);

export default app;
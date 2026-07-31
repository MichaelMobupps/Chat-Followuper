import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import apolloWebhookRouter from "./routes/apolloWebhook";
import healthRouter from "./routes/health";
import { researchStreamRoute } from "./routes/researchStream";
import { logger } from "./lib/logger";
import { loadUser } from "./middlewares/auth";
import { mountSpa } from "./routes/spa";
import {
  API_BASE_PATH,
  PLATFORM_API_BASE_PATH,
  apiPath,
} from "./lib/appConfig";

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
app.use(API_BASE_PATH, apolloWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Best-effort session loader: populates req.user when a valid session cookie
// is present. Routes opt-in to authentication via `requireAuth`.
app.use(API_BASE_PATH, loadUser);

app.get(apiPath("/prospects/research/stream"), researchStreamRoute);
app.use(API_BASE_PATH, router);

// CP1: the platform's startup health check, which asks for the literal
// "/api/healthz" declared in artifact.toml no matter what BASE_PATH is. Same
// router, same handler as the prefixed route above — this only adds a second
// address for it.
//
// Unconditional on purpose. Gating it on IS_PREFIXED would put the health of a
// deployment back under the control of the very variable this exists to be
// independent of, and unsetting BASE_PATH is the cutover's rollback: the
// rolled-back state has to stay healthy too.
//
// Mounted *after* the API router, which is what keeps the default base
// byte-identical: at BASE_PATH="/" the two mount points are the same string,
// the router above is registered first and answers /api/health and
// /api/healthz, and this line is never reached. Under a prefix the router
// above sits at /chat/api and this is the only thing serving /api/healthz.
app.use(PLATFORM_API_BASE_PATH, healthRouter);

// Bundle 2: serve the built dashboard under BASE_PATH. No-op at the default
// base, so with BASE_PATH unset the stack above is the whole app, exactly as
// before. Mounted last on purpose — the SPA catch-all must never shadow an
// API route, and it additionally refuses anything under API_BASE_PATH so an
// unmatched API path still answers with a JSON 404 rather than index.html.
mountSpa(app);

export default app;
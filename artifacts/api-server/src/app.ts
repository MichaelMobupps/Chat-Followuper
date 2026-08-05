import express, {
  type Express,
  type Request,
  type Response,
  type ErrorRequestHandler,
} from "express";
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
  IS_PREFIXED,
  PLATFORM_API_BASE_PATH,
  apiPath,
} from "./lib/appConfig";
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
app.use(API_BASE_PATH, apolloWebhookRouter);

// Cutover (TODO external registration 2): the webhook URL registered in the
// Apollo dashboard predates the prefix and points at the unprefixed
// "/api/apollo/webhook/phone-reveal". A redirect is not enough here — webhook
// senders do not reliably follow 3xx on POST — so the legacy address stays a
// first-class second mount of the same router, same HMAC gate, same raw-body
// capture (which is why it sits here, before express.json, like the mount
// above). Gated on IS_PREFIXED: at the default base the two mount points are
// the same string and this would register the router twice.
if (IS_PREFIXED) {
  app.use(PLATFORM_API_BASE_PATH, apolloWebhookRouter);
}

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

// Cutover (TODO open item 8, option (a)): everything else still asking for
// the unprefixed API — the "/api/followups/open/<id>?t=…" links already
// sitting in reps' inboxes, the OAuth callback address registered at Google
// and pinned in GOOGLE_OAUTH_REDIRECT_URI, any stale client — is answered
// with a method- and query-preserving redirect onto the prefixed mount. This
// is the option that keeps working if this origin is ever retired behind the
// gateway, and the only one that repairs mail that cannot be recalled.
//
// 307, not 301 or 302 — those permit a client to downgrade the POST of a
// webhook or a form to a GET, and the callback and the email links must keep
// their query strings. Not 308 either (L1a): 308 promises the same method
// preservation, but it is permanent and heuristically cacheable, and
// unsetting BASE_PATH is this migration's one-minute rollback. A client
// holding a cached permanent hop would keep rewriting /api/... onto a
// prefixed path that 404s the moment the prefix is withdrawn, and no
// server-side change can clear a cache entry a client already holds. The
// permanence was never load-bearing here; the method preservation is. Do not
// "upgrade" this back to 308.
//
// Ordering: after the platform health router, so /api/healthz and /api/health
// keep answering 200 directly — the startup probe must never depend on a
// redirect. Gated on IS_PREFIXED: at the default base this mount point IS the
// API mount, and a redirect here would loop. Unset BASE_PATH (the rollback)
// and this disappears with everything else.
//
// The target is same-origin by construction: API_BASE_PATH is a normalized
// rooted path ("/chat/api"), and whatever hostile suffix a request line
// carries is appended *after* it, so the Location header can never begin
// "//" or name another origin.
if (IS_PREFIXED) {
  app.use(PLATFORM_API_BASE_PATH, (req: Request, res: Response) => {
    const suffix = req.originalUrl.slice(PLATFORM_API_BASE_PATH.length);
    res.redirect(307, `${API_BASE_PATH}${suffix}`);
  });
}

// Bundle 2: serve the built dashboard under BASE_PATH. No-op at the default
// base, so with BASE_PATH unset the stack above is the whole app, exactly as
// before. Mounted last on purpose — the SPA catch-all must never shadow an
// API route, and it additionally refuses anything under API_BASE_PATH so an
// unmatched API path still answers with a JSON 404 rather than index.html.
mountSpa(app);

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
import express, {
  type Express,
  type Request,
  type Response,
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
// with a permanent, method- and query-preserving redirect onto the prefixed
// mount. 308 rather than 301 because the callback and the email links must
// keep their query strings and a permanent status lets browsers cache the
// hop. This is the option that keeps working if this origin is ever retired
// behind the gateway, and the only one that repairs mail that cannot be
// recalled.
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
    res.redirect(308, `${API_BASE_PATH}${suffix}`);
  });
}

// Bundle 2: serve the built dashboard under BASE_PATH. No-op at the default
// base, so with BASE_PATH unset the stack above is the whole app, exactly as
// before. Mounted last on purpose — the SPA catch-all must never shadow an
// API route, and it additionally refuses anything under API_BASE_PATH so an
// unmatched API path still answers with a JSON 404 rather than index.html.
mountSpa(app);

export default app;
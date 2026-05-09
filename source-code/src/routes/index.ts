import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./google-auth";
import whatsappLinkRouter from "./whatsappLink";
import apolloRouter from "./apollo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(whatsappLinkRouter);
router.use(apolloRouter);

// NOTE: the apollo webhook router is NOT mounted here. It is mounted
// directly in app.ts BEFORE express.json() so that express.raw can
// capture the original request bytes for HMAC verification. Mounting
// it here would put it behind the global JSON parser, which would
// destroy the raw body required for signature verification.

export default router;
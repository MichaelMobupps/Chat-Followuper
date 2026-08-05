import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./google-auth";
import whatsappLinkRouter from "./whatsappLink";
import apolloRouter from "./apollo";
import prospectorRouter from "./prospector";
import prospectsRouter from "./prospects";
import campaignsRouter from "./campaigns";
import generateMessageRouter from "./generateMessage";
import followupsRouter from "./followups";
import sequenceConfigRouter from "./sequenceConfig";
import adminRouter from "./admin";
import followupOpenRouter from "./followupOpen";
import prepareFirstMessageRouter from "./prepareFirstMessage";
import testChannelLinkRouter from "./testChannelLink";
import notificationSettingsRouter from "./notificationSettings";
import userExtrasRouter from "./userExtras";
import followupFallbackRouter from "./followupFallback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(whatsappLinkRouter);
router.use(apolloRouter);
router.use(prospectorRouter);
// NOTE: mounted BEFORE prepareFirstMessageRouter, which owns the literal-segment
// routes POST /prospects/preview-first-message and GET
// /prospects/preview-progress/:draftId. Those are safe today only because this
// router has no POST /prospects/:id and no GET /prospects/:a/:b — a params route
// added here would silently swallow them, with no test failure. If you add one,
// move prepareFirstMessageRouter above this line.
router.use(prospectsRouter);
router.use(campaignsRouter);
router.use(generateMessageRouter);
router.use(followupsRouter);
router.use(sequenceConfigRouter);
router.use(adminRouter);
router.use(followupOpenRouter);
router.use(prepareFirstMessageRouter);
router.use(testChannelLinkRouter);
router.use(notificationSettingsRouter);
router.use(userExtrasRouter);
router.use(followupFallbackRouter);

// NOTE: the apollo webhook router is NOT mounted here. It is mounted
// directly in app.ts BEFORE express.json() so that express.raw can
// capture the original request bytes for HMAC verification. Mounting
// it here would put it behind the global JSON parser, which would
// destroy the raw body required for signature verification.

export default router;
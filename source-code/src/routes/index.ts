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

export default router;
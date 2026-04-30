import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./google-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);

export default router;

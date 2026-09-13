import { Router } from "express";
import { authenticateJwt, authenticateJwtAllowUnverified } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  requestClientEmailChange,
  requestClientVerification,
  requestGuestVerification,
  requestInternalVerification,
  verifyClientEmailChange,
  verifyClientVerification,
  verifyGuestVerification,
  verifyInternalVerification,
} from "./emailVerification.controller.js";

const router = Router();

router.post("/guest/request", requestGuestVerification);
router.post("/guest/verify", verifyGuestVerification);

router.post("/internal/request", authenticateJwtAllowUnverified, verifyRoles(["MANAGER", "CASHIER", "WAREHOUSE"]), requestInternalVerification);
router.post("/internal/verify", authenticateJwtAllowUnverified, verifyRoles(["MANAGER", "CASHIER", "WAREHOUSE"]), verifyInternalVerification);

router.use(authenticateJwt);
router.use(verifyRoles(["CLIENT"]));
router.post("/client/request", requestClientVerification);
router.post("/client/verify", verifyClientVerification);
router.post("/client/email-change/request", requestClientEmailChange);
router.post("/client/email-change/verify", verifyClientEmailChange);

export default router;

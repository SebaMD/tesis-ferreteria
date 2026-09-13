import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  getCustomerNoticeConfiguration,
  getPublicCustomerNotice,
  updateCustomerNotice,
} from "./customerNotice.controller.js";

const router = Router();

router.get("/", getPublicCustomerNotice);
router.get("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), getCustomerNoticeConfiguration);
router.put("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCustomerNotice);

export default router;

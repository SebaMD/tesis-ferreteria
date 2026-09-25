import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createCustomerNoticeController,
  deleteCustomerNoticeController,
  getCustomerNoticeConfiguration,
  getPublicCustomerNotice,
  updateCustomerNoticeController,
} from "./customerNotice.controller.js";

const router = Router();

router.get("/", getPublicCustomerNotice);
router.get("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), getCustomerNoticeConfiguration);
router.post("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), createCustomerNoticeController);
router.put("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCustomerNoticeController);
router.delete("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), deleteCustomerNoticeController);

export default router;

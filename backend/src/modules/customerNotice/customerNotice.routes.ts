import { raw, Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createCustomerNoticeController,
  deleteCustomerNoticeController,
  getCustomerNoticeConfiguration,
  getPublicCustomerNotice,
  removeCatalogPresentationImageController,
  removeCustomerNoticeImageController,
  reorderCustomerNoticesController,
  updateCatalogPresentationController,
  updateCustomerNoticeController,
  uploadCatalogPresentationImageController,
  uploadCustomerNoticeImageController,
} from "./customerNotice.controller.js";
import { MAX_IMAGE_FILE_SIZE } from "../../utils/imageFiles.js";

const router = Router();

router.get("/", getPublicCustomerNotice);
router.get("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), getCustomerNoticeConfiguration);
router.put("/configuration/presentation", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCatalogPresentationController);
router.post(
  "/configuration/presentation/image",
  authenticateJwt,
  verifyRoles(["ADMIN", "MANAGER"]),
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_FILE_SIZE }),
  uploadCatalogPresentationImageController,
);
router.delete("/configuration/presentation/image", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), removeCatalogPresentationImageController);
router.patch("/configuration/order", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), reorderCustomerNoticesController);
router.post("/configuration", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), createCustomerNoticeController);
router.post(
  "/configuration/:id/image",
  authenticateJwt,
  verifyRoles(["ADMIN", "MANAGER"]),
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_FILE_SIZE }),
  uploadCustomerNoticeImageController,
);
router.delete("/configuration/:id/image", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), removeCustomerNoticeImageController);
router.put("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), updateCustomerNoticeController);
router.delete("/configuration/:id", authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]), deleteCustomerNoticeController);

export default router;

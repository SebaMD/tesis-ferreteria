import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { MAX_IMAGE_FILE_SIZE } from "../../utils/imageFiles.js";
import {
  getDeliveryProofController,
  getLogisticsOrderByIdController,
  getLogisticsOrdersController,
  transitionLogisticsOrderController,
} from "./orderLogistics.controller.js";

const router = Router();
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_FILE_SIZE, files: 1, fields: 4 },
}).single("proofImage");

function parseEvidenceUpload(req: Request, res: Response, next: NextFunction) {
  evidenceUpload(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "La fotografia no puede superar 5 MB"
      : "No se pudo procesar la fotografia comprobante";
    return res.status(400).json({ message });
  });
}

router.use(authenticateJwt);
router.get("/", verifyRoles(["WAREHOUSE", "ADMIN", "MANAGER"]), getLogisticsOrdersController);
router.get(
  "/:origin/:id/delivery-proof",
  verifyRoles(["WAREHOUSE", "ADMIN", "MANAGER"]),
  getDeliveryProofController,
);
router.get(
  "/:origin/:id",
  verifyRoles(["WAREHOUSE", "ADMIN", "MANAGER"]),
  getLogisticsOrderByIdController,
);
router.post(
  "/:origin/:id/start-preparation",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("START_PREPARATION"),
);
router.post(
  "/:origin/:id/finish-preparation",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("FINISH_PREPARATION"),
);
router.post(
  "/:origin/:id/start-delivery",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("START_DELIVERY"),
);
router.post(
  "/:origin/:id/complete-delivery",
  verifyRoles(["WAREHOUSE"]),
  parseEvidenceUpload,
  transitionLogisticsOrderController("COMPLETE_DELIVERY"),
);

export default router;

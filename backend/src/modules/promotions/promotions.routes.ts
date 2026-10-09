import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createPromotionController,
  deletePromotionController,
  getPromotionController,
  getPromotionTargetsController,
  listPromotionsController,
  setPromotionStatusController,
  updatePromotionController,
} from "./promotions.controller.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["ADMIN", "MANAGER"]));

router.get("/targets", getPromotionTargetsController);
router.get("/", listPromotionsController);
router.get("/:id", getPromotionController);
router.post("/", createPromotionController);
router.patch("/:id/status", setPromotionStatusController);
router.patch("/:id", updatePromotionController);
router.delete("/:id", deletePromotionController);

export default router;

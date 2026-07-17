import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createInventoryMovementController,
  getInventoryMovementById,
  getInventoryMovements,
} from "./inventory.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER"]), getInventoryMovements);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER"]), getInventoryMovementById);
router.post("/", verifyRoles(["ADMIN"]), createInventoryMovementController);

export default router;

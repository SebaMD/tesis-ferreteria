import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createInventoryMovementController,
  deleteInventoryMovement,
  getInventoryMovementById,
  getInventoryMovements,
} from "./inventory.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "WAREHOUSE"]), getInventoryMovements);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "WAREHOUSE"]), getInventoryMovementById);
router.post("/", verifyRoles(["ADMIN", "WAREHOUSE"]), createInventoryMovementController);
router.delete("/:id", verifyRoles(["ADMIN"]), deleteInventoryMovement);

export default router;

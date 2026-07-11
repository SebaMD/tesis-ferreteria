import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { cancelSaleController, createSaleController, getSaleById, getSales, undoCancelSaleController } from "./sales.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSales);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSaleById);
router.post("/", verifyRoles(["CASHIER"]), createSaleController);
router.patch("/:id/undo-cancel", verifyRoles(["ADMIN"]), undoCancelSaleController);
router.delete("/:id", verifyRoles(["ADMIN"]), cancelSaleController);

export default router;

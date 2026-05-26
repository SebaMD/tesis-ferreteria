import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { createSaleController, deleteSale, editSaleStatus, getSaleById, getSales } from "./sales.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSales);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSaleById);
router.post("/", verifyRoles(["CASHIER"]), createSaleController);
router.patch("/:id/status", verifyRoles(["ADMIN"]), editSaleStatus);
router.delete("/:id", verifyRoles(["ADMIN"]), deleteSale);

export default router;

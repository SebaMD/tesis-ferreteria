import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  approveCancellationRequestController,
  cancelSaleController,
  createCancellationRequestController,
  createDirectReturnController,
  createSaleController,
  getCancellationRequestsController,
  getSaleById,
  getSales,
  rejectCancellationRequestController,
  undoCancellationRequestController,
} from "./sales.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSales);
router.get(
  "/cancellation-requests",
  verifyRoles(["ADMIN", "MANAGER"]),
  getCancellationRequestsController,
);
router.patch(
  "/cancellation-requests/:requestId/approve",
  verifyRoles(["ADMIN", "MANAGER"]),
  approveCancellationRequestController,
);
router.patch(
  "/cancellation-requests/:requestId/reject",
  verifyRoles(["ADMIN", "MANAGER"]),
  rejectCancellationRequestController,
);
router.patch(
  "/cancellation-requests/:requestId/undo",
  verifyRoles(["ADMIN"]),
  undoCancellationRequestController,
);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "CASHIER"]), getSaleById);
router.post("/", verifyRoles(["CASHIER"]), createSaleController);
router.post(
  "/:id/cancellation-requests",
  verifyRoles(["CASHIER"]),
  createCancellationRequestController,
);
router.post(
  "/:id/returns",
  verifyRoles(["ADMIN"]),
  createDirectReturnController,
);
router.delete("/:id", verifyRoles(["ADMIN"]), cancelSaleController);

export default router;

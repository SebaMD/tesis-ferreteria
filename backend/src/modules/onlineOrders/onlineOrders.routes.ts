import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  archiveOrderController,
  continueGuestPaymentController,
  continuePaymentController,
  createCheckoutController,
  createGuestCheckoutController,
  getDeliveryAddressController,
  getGuestOrderController,
  getGuestPendingOrderController,
  getMyOrderByIdController,
  getMyOrdersController,
  retryPaymentController,
  retryGuestPaymentController,
  webpayReturnController,
} from "./onlineOrders.controller.js";

const router = Router();

router.get("/payments/webpay/return", webpayReturnController);
router.post("/payments/webpay/return", webpayReturnController);
router.get("/guest/pending", getGuestPendingOrderController);
router.post("/guest/checkout", createGuestCheckoutController);
router.post("/guest/continue-payment", continueGuestPaymentController);
router.get("/guest/order", getGuestOrderController);
router.post("/guest/retry-payment", retryGuestPaymentController);

router.use(authenticateJwt);
router.use(verifyRoles(["CLIENT"]));

router.get("/", getMyOrdersController);
router.get("/delivery-address", getDeliveryAddressController);
router.post("/checkout", createCheckoutController);
router.post("/:id/continue-payment", continuePaymentController);
router.post("/:id/retry-payment", retryPaymentController);
router.patch("/:id/archive", archiveOrderController);
router.get("/:id", getMyOrderByIdController);

export default router;

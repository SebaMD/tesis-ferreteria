import { Router, raw } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createProductController,
  deleteProduct,
  editProduct,
  getProductByBarcode,
  getProductById,
  getProducts,
} from "./products.controller.js";
import {
  deleteProductImageController,
  reorderProductImagesController,
  setPrimaryProductImageController,
  uploadProductImageController,
} from "../productImages/productImages.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]), getProducts);
router.get(
  "/barcode/:barcode",
  verifyRoles(["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]),
  getProductByBarcode,
);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]), getProductById);
router.post(
  "/:id/images",
  verifyRoles(["ADMIN"]),
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  uploadProductImageController,
);
router.patch("/:id/images/order", verifyRoles(["ADMIN"]), reorderProductImagesController);
router.patch(
  "/:id/images/:imageId/primary",
  verifyRoles(["ADMIN"]),
  setPrimaryProductImageController,
);
router.delete("/:id/images/:imageId", verifyRoles(["ADMIN"]), deleteProductImageController);
router.post("/", verifyRoles(["ADMIN"]), createProductController);
router.patch("/:id", verifyRoles(["ADMIN"]), editProduct);
router.delete("/:id", verifyRoles(["ADMIN"]), deleteProduct);

export default router;

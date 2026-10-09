import { Router, raw, type NextFunction, type Request, type Response } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { handleErrorClient } from "../../utils/helpers.js";
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
const productImageBodyParser = raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "5mb",
});

function parseProductImageBody(req: Request, res: Response, next: NextFunction) {
  productImageBodyParser(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (
      typeof error === "object"
      && error !== null
      && "type" in error
      && error.type === "entity.too.large"
    ) {
      handleErrorClient(res, 413, "La imagen no puede superar 5 MB");
      return;
    }
    next(error);
  });
}

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
  parseProductImageBody,
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

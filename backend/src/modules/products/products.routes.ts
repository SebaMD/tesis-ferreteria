import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createProductController,
  deleteProduct,
  editProduct,
  getProductById,
  getProducts,
} from "./products.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]), getProducts);
router.get("/:id", verifyRoles(["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"]), getProductById);
router.post("/", verifyRoles(["ADMIN"]), createProductController);
router.patch("/:id", verifyRoles(["ADMIN"]), editProduct);
router.delete("/:id", verifyRoles(["ADMIN"]), deleteProduct);

export default router;

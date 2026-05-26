import { Router } from "express";
import authRoutes from "./auth/auth.routes.js";
import categoriesRoutes from "./categories/categories.routes.js";
import inventoryRoutes from "./inventory/inventory.routes.js";
import productsRoutes from "./products/products.routes.js";
import salesRoutes from "./sales/sales.routes.js";
import usersRoutes from "./users/users.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/categories", categoriesRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/products", productsRoutes);
router.use("/sales", salesRoutes);
router.use("/users", usersRoutes);

export default router;

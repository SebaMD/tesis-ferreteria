import { Router } from "express";
import authRoutes from "./auth/auth.routes.js";
import categoriesRoutes from "./categories/categories.routes.js";
import catalogRoutes from "./catalog/catalog.routes.js";
import inventoryRoutes from "./inventory/inventory.routes.js";
import onlineOrdersRoutes from "./onlineOrders/onlineOrders.routes.js";
import orderLogisticsRoutes from "./orderLogistics/orderLogistics.routes.js";
import productsRoutes from "./products/products.routes.js";
import reportsRoutes from "./reports/reports.routes.js";
import salesRoutes from "./sales/sales.routes.js";
import usersRoutes from "./users/users.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/catalog", catalogRoutes);
router.use("/categories", categoriesRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/online-orders", onlineOrdersRoutes);
router.use("/order-logistics", orderLogisticsRoutes);
router.use("/products", productsRoutes);
router.use("/reports", reportsRoutes);
router.use("/sales", salesRoutes);
router.use("/users", usersRoutes);

export default router;

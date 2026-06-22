import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  getDailySalesReport,
  getSalesByCashierReport,
  getSalesReport,
} from "./reports.controller.js";

const router = Router();

router.use(authenticateJwt);
router.use(verifyRoles(["ADMIN", "MANAGER"]));

router.get("/sales/daily", getDailySalesReport);
router.get("/sales/by-cashier", getSalesByCashierReport);
router.get("/sales", getSalesReport);

export default router;

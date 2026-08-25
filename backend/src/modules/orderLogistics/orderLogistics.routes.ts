import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  getLogisticsOrderByIdController,
  getLogisticsOrdersController,
  transitionLogisticsOrderController,
} from "./orderLogistics.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get(
  "/",
  verifyRoles(["WAREHOUSE", "ADMIN", "MANAGER"]),
  getLogisticsOrdersController,
);
router.get(
  "/:id",
  verifyRoles(["WAREHOUSE", "ADMIN", "MANAGER"]),
  getLogisticsOrderByIdController,
);

router.post(
  "/:id/start-preparation",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("START_PREPARATION"),
);
router.post(
  "/:id/finish-preparation",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("FINISH_PREPARATION"),
);
router.post(
  "/:id/start-delivery",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("START_DELIVERY"),
);
router.post(
  "/:id/complete-delivery",
  verifyRoles(["WAREHOUSE"]),
  transitionLogisticsOrderController("COMPLETE_DELIVERY"),
);

export default router;

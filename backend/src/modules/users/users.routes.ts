import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createUser,
  deactivateMyClientAccount,
  deleteUser,
  editUser,
  getUserById,
  getUserRoles,
  getUsers,
  updateCashierSchedule,
  updateMyClientProfile,
} from "./users.controller.js";

const router = Router();

router.patch("/me/profile", authenticateJwt, verifyRoles(["CLIENT"]), updateMyClientProfile);
router.post("/me/deactivate", authenticateJwt, verifyRoles(["CLIENT"]), deactivateMyClientAccount);

router.use(authenticateJwt);
router.use(verifyRoles(["ADMIN"]));

router.get("/", getUsers);
router.get("/roles", getUserRoles);
router.post("/", createUser);
router.patch("/:id/work-schedule", updateCashierSchedule);
router.get("/:id", getUserById);
router.patch("/:id", editUser);
router.delete("/:id", deleteUser);

export default router;

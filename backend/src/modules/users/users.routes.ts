import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createUser,
  deleteUser,
  editUser,
  getUserById,
  getUsers,
  updateCashierSchedule,
} from "./users.controller.js";

const router = Router();

router.use(authenticateJwt);
router.use(verifyRoles(["ADMIN"]));

router.get("/", getUsers);
router.post("/", createUser);
router.patch("/:id/work-schedule", updateCashierSchedule);
router.get("/:id", getUserById);
router.patch("/:id", editUser);
router.delete("/:id", deleteUser);

export default router;

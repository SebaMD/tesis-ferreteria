import { Router } from "express";
import { authenticateJwtAllowUnverified } from "../../middlewares/authentication.middleware.js";
import {
  confirmPasswordReset,
  login,
  logout,
  registerClient,
  requestPasswordReset,
} from "./auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/register", registerClient);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/confirm", confirmPasswordReset);
router.post("/logout", authenticateJwtAllowUnverified, logout);

export default router;

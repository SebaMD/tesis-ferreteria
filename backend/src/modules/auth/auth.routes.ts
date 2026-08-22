import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { login, logout, registerClient } from "./auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/register", registerClient);
router.post("/logout", authenticateJwt, logout);

export default router;

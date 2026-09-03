import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import { changeFavorite, listFavorites } from "./favorites.controller.js";

const router = Router();
router.use(authenticateJwt, verifyRoles(["CLIENT"]));
router.get("/", listFavorites);
router.put("/:productId", changeFavorite);
router.delete("/:productId", changeFavorite);
export default router;

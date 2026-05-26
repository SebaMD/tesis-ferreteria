import { Router } from "express";
import { authenticateJwt } from "../../middlewares/authentication.middleware.js";
import { verifyRoles } from "../../middlewares/authorization.middleware.js";
import {
  createCategoryController,
  deleteCategory,
  editCategory,
  getCategories,
  getCategoryById,
} from "./categories.controller.js";

const router = Router();

router.use(authenticateJwt);

router.get("/", verifyRoles(["ADMIN"]), getCategories);
router.get("/:id", verifyRoles(["ADMIN"]), getCategoryById);
router.post("/", verifyRoles(["ADMIN"]), createCategoryController);
router.patch("/:id", verifyRoles(["ADMIN"]), editCategory);
router.delete("/:id", verifyRoles(["ADMIN"]), deleteCategory);

export default router;

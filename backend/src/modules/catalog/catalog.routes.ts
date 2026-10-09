import { Router } from "express";
import { getCatalogProductById, getCatalogProducts } from "./catalog.controller.js";

const router = Router();

router.get("/products", getCatalogProducts);
router.get("/products/:id", getCatalogProductById);

export default router;

import { Router } from "express";
import { getCatalogProductById, getCatalogProducts, getCatalogFamily } from "./catalog.controller.js";

const router = Router();

router.get("/products", getCatalogProducts);
router.get("/products/:id", getCatalogProductById);
router.get("/families/:id", getCatalogFamily);

export default router;

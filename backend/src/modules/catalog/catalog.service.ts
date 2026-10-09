import { findCatalogProductById, findCatalogProductsPage } from "./catalog.repository.js";
import type { CatalogQuery } from "./catalog.validation.js";

export async function getCatalogProductsService(query: CatalogQuery) {
  return findCatalogProductsPage(query);
}

export async function getCatalogProductByIdService(id: number) {
  const product = await findCatalogProductById(id);
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

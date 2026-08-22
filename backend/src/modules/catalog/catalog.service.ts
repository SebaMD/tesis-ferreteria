import { findCatalogProductById, findCatalogProducts } from "./catalog.repository.js";

export async function getCatalogProductsService() {
  return findCatalogProducts();
}

export async function getCatalogProductByIdService(id: number) {
  const product = await findCatalogProductById(id);
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

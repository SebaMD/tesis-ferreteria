import {
  createProduct,
  deleteProductById,
  findProductById,
  findProducts,
  updateProductById,
} from "./products.repository.js";
import type { EditProductBody, ProductBody } from "./products.validation.js";

export async function getProductsService() {
  return findProducts();
}

export async function getProductByIdService(id: number) {
  const product = await findProductById(id);
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

export async function createProductService(data: ProductBody) {
  return createProduct(data);
}

export async function editProductService(id: number, data: EditProductBody) {
  const product = await updateProductById(id, data);
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

export async function deleteProductService(id: number) {
  return Boolean(await deleteProductById(id));
}

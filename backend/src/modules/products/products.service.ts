import {
  createProduct,
  deleteProductById,
  findProductByCategoryAndName,
  findProductById,
  findProducts,
  updateProductById,
} from "./products.repository.js";
import type { EditProductBody, ProductBody } from "./products.validation.js";

export class ProductError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProductError";
  }
}

export async function getProductsService(includeInactive = false) {
  return findProducts(includeInactive);
}

export async function getProductByIdService(id: number, includeInactive = false) {
  const product = await findProductById(id, includeInactive);
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

export async function createProductService(data: ProductBody) {
  const duplicate = await findProductByCategoryAndName(data.categoryId, data.name);
  if (duplicate) {
    throw new ProductError("Ya existe un producto con ese nombre en la categoria seleccionada", 409);
  }

  return createProduct(data);
}

export async function editProductService(id: number, data: EditProductBody) {
  const currentProduct = await findProductById(id, true);
  if (!currentProduct) throw new ProductError("Producto no encontrado", 404);

  const categoryId = data.categoryId ?? currentProduct.categoryId;
  const name = data.name ?? currentProduct.name;
  const duplicate = await findProductByCategoryAndName(categoryId, name, id);

  if (duplicate) {
    throw new ProductError("Ya existe un producto con ese nombre en la categoria seleccionada", 409);
  }

  const product = await updateProductById(id, data);
  if (!product) throw new ProductError("Producto no encontrado", 404);
  return product;
}

export async function deleteProductService(id: number) {
  return Boolean(await deleteProductById(id));
}

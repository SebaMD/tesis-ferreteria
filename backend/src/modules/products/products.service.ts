import { db } from "../../db/index.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "../inventory/stockAvailability.repository.js";
import {
  createProductTx,
  deleteProductById,
  findProductByBarcode,
  findProductByCategoryAndName,
  findProductById,
  findProducts,
  updateProductByIdTx,
} from "./products.repository.js";
import type { EditProductBody, ProductBody } from "./products.validation.js";
import { assertProductPromotionCompatibilityTx } from "../promotions/promotions.service.js";
import { PromotionError } from "../promotions/promotions.service.js";

export class ProductError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProductError";
  }
}

async function attachAvailableStock<T extends { id: number; currentStock: number }>(products: T[]) {
  const reservedByProduct = await findActiveReservedQuantities(
    db,
    products.map((product) => product.id),
  );

  return products.map((product) => {
    const reservedQuantity = reservedByProduct.get(product.id) || 0;
    return {
      ...product,
      reservedQuantity,
      availableStock: calculateAvailableStock(product.currentStock, reservedQuantity),
    };
  });
}

export async function getProductsService(includeInactive = false) {
  return attachAvailableStock(await findProducts(includeInactive));
}

export async function getProductByIdService(id: number, includeInactive = false) {
  const product = await findProductById(id, includeInactive);
  if (!product) throw new Error("Producto no encontrado");
  return (await attachAvailableStock([product]))[0];
}

export async function getProductByBarcodeService(barcode: string) {
  const product = await findProductByBarcode(barcode);
  if (!product) throw new ProductError("No existe un producto asociado a este codigo de barra", 404);
  if (!product.status) throw new ProductError("El producto asociado a este codigo de barra esta desactivado", 409);
  return (await attachAvailableStock([product]))[0];
}

export async function createProductService(data: ProductBody) {
  const duplicate = await findProductByCategoryAndName(data.categoryId, data.name);
  if (duplicate) {
    throw new ProductError("Ya existe un producto con ese nombre en la categoria seleccionada", 409);
  }

  if (data.barcode && await findProductByBarcode(data.barcode)) {
    throw new ProductError("El codigo de barra ya esta asociado a otro producto", 409);
  }

  let createdId: number;
  try {
    createdId = await db.transaction(async (tx) => {
      const product = await createProductTx(tx, data);
      await assertProductPromotionCompatibilityTx(tx, {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        status: product.status,
      });
      return product.id;
    });
  } catch (error) {
    if (error instanceof PromotionError) {
      throw new ProductError(error.message, error.statusCode);
    }
    throw error;
  }
  return findProductById(createdId, true);
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

  if (data.barcode && await findProductByBarcode(data.barcode, id)) {
    throw new ProductError("El codigo de barra ya esta asociado a otro producto", 409);
  }

  try {
    await db.transaction(async (tx) => {
      const prospective = {
        productId: id,
        productName: data.name ?? currentProduct.name,
        categoryId,
        status: data.status ?? currentProduct.status,
      };
      await assertProductPromotionCompatibilityTx(tx, prospective);
      if (!await updateProductByIdTx(tx, id, data)) {
        throw new ProductError("Producto no encontrado", 404);
      }
    });
  } catch (error) {
    if (error instanceof PromotionError) {
      throw new ProductError(error.message, error.statusCode);
    }
    throw error;
  }
  return findProductById(id, true);
}

export async function deleteProductService(id: number) {
  return Boolean(await deleteProductById(id));
}

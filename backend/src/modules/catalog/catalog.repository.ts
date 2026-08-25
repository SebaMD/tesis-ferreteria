import { db } from "../../db/index.js";
import {
  calculateAvailableStock,
  findActiveReservedQuantities,
} from "../inventory/stockAvailability.repository.js";
import { findProductById, findProducts } from "../products/products.repository.js";

function toCatalogProduct(
  product: NonNullable<Awaited<ReturnType<typeof findProductById>>>,
  reservedQuantity: number,
) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    name: product.name,
    description: product.description,
    price: product.price,
    unitMeasure: product.unitMeasure,
    currentStock: product.currentStock,
    reservedQuantity,
    availableStock: calculateAvailableStock(product.currentStock, reservedQuantity),
    images: product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      position: image.position,
      isPrimary: image.isPrimary,
    })),
  };
}

export async function findCatalogProducts() {
  const products = await findProducts(false);
  const reservedByProduct = await findActiveReservedQuantities(
    db,
    products.map((product) => product.id),
  );
  return products.map((product) => toCatalogProduct(
    product,
    reservedByProduct.get(product.id) || 0,
  ));
}

export async function findCatalogProductById(id: number) {
  const product = await findProductById(id, false);
  if (!product) return null;
  const reservedByProduct = await findActiveReservedQuantities(db, [product.id]);
  return toCatalogProduct(product, reservedByProduct.get(product.id) || 0);
}

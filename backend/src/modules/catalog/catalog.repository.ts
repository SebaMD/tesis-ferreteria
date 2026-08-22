import { findProductById, findProducts } from "../products/products.repository.js";

function toCatalogProduct(product: NonNullable<Awaited<ReturnType<typeof findProductById>>>) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    name: product.name,
    description: product.description,
    price: product.price,
    unitMeasure: product.unitMeasure,
    currentStock: product.currentStock,
    images: product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      position: image.position,
      isPrimary: image.isPrimary,
    })),
  };
}

export async function findCatalogProducts() {
  return (await findProducts(false)).map(toCatalogProduct);
}

export async function findCatalogProductById(id: number) {
  const product = await findProductById(id, false);
  return product ? toCatalogProduct(product) : null;
}

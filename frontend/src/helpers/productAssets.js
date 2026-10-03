import { resolveApiAssetUrl } from "./apiAssets.js";

export function resolveProductImageAsset(image, apiBaseUrl) {
  if (!image || typeof image !== "object") return image;
  return {
    ...image,
    imageUrl: resolveApiAssetUrl(image.imageUrl, apiBaseUrl),
  };
}

export function resolveProductAssets(product, apiBaseUrl) {
  if (!product || typeof product !== "object") return product;
  return {
    ...product,
    images: Array.isArray(product.images)
      ? product.images.map((image) => resolveProductImageAsset(image, apiBaseUrl))
      : product.images,
  };
}

export function resolveProductListAssets(products, apiBaseUrl) {
  return Array.isArray(products)
    ? products.map((product) => resolveProductAssets(product, apiBaseUrl))
    : [];
}

export function resolveOrderProductAssets(order, apiBaseUrl) {
  if (!order || typeof order !== "object") return order;
  return {
    ...order,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          ...item,
          productImageUrl: resolveApiAssetUrl(item.productImageUrl, apiBaseUrl),
        }))
      : order.items,
  };
}

export function resolveOrderListProductAssets(orders, apiBaseUrl) {
  return Array.isArray(orders)
    ? orders.map((order) => resolveOrderProductAssets(order, apiBaseUrl))
    : [];
}

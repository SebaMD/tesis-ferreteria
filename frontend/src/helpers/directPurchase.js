const DIRECT_PURCHASE_ORDER_PREFIX = "fyf_direct_purchase_order_";

export function createDirectPurchaseItem(product, quantity) {
  const productId = Number(product?.id);
  const normalizedQuantity = Number(quantity);

  if (
    !Number.isInteger(productId)
    || productId < 1
    || !Number.isInteger(normalizedQuantity)
    || normalizedQuantity < 1
    || product?.inStoreOnly
  ) {
    return null;
  }

  return { product, quantity: normalizedQuantity };
}

export function readDirectPurchaseItem(state) {
  return createDirectPurchaseItem(
    state?.directPurchase?.product,
    state?.directPurchase?.quantity,
  );
}

function directPurchaseOrderKey(orderId) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId < 1) return "";
  return `${DIRECT_PURCHASE_ORDER_PREFIX}${normalizedOrderId}`;
}

export function markDirectPurchaseOrder(orderId, storage = globalThis.localStorage) {
  const key = directPurchaseOrderKey(orderId);
  if (!key || !storage) return false;

  try {
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function isDirectPurchaseOrder(orderId, storage = globalThis.localStorage) {
  const key = directPurchaseOrderKey(orderId);
  if (!key || !storage) return false;

  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

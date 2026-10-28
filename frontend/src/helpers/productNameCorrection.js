export const productNameCorrectionStorageKey = (userId, productId) => `fyf-product-name-${userId}-${productId}`;
export function readPendingProductNameCorrection(userId, productId, storage = sessionStorage) {
  try {
    const v = JSON.parse(storage.getItem(productNameCorrectionStorageKey(userId, productId)) || "null");
    if (v?.id === productId && typeof v.name === "string" && typeof v.body?.name === "string" && typeof v.body.reason === "string"
      && typeof v.body.expectedRevision === "string" && Number.isFinite(Date.parse(v.body.expectedRevision))
      && /^[a-zA-Z0-9-]{20,80}$/.test(v.body.operationKey) && v.body.confirmed === true) return v;
  } catch { /* Never replay automatically when storage is unavailable or invalid. */ }
  return null;
}
export function productNameDraftIsDirty(form, unit, product, files = []) {
  if (!product || files.length) return true;
  return ["name", "brand", "barcode", "description"].some(k => String(form[k] || "") !== String(product[k] || ""))
    || ["price", "minimumStock", "categoryId"].some(k => Number(form[k]) !== Number(product[k]))
    || ["status", "inStoreOnly"].some(k => Boolean(form[k]) !== Boolean(product[k]))
    || unit !== product.unitMeasure || Boolean(form.associationReason);
}

export function getProductPromotionPricing(product, quantity = 1) {
  const baseUnitPrice = Number(product?.price || 0);
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const baseSubtotal = baseUnitPrice * safeQuantity;
  const promotion = product?.promotion || null;

  if (!promotion || safeQuantity === 0) {
    return { baseUnitPrice, promotionalUnitPrice: null, baseSubtotal, discountAmount: 0, finalSubtotal: baseSubtotal, freeUnits: 0, promotion };
  }
  if (promotion.type === "PERCENTAGE_DISCOUNT") {
    const promotionalUnitPrice = Number(product.promotionalPrice);
    const finalSubtotal = promotionalUnitPrice * safeQuantity;
    return { baseUnitPrice, promotionalUnitPrice, baseSubtotal, discountAmount: baseSubtotal - finalSubtotal, finalSubtotal, freeUnits: 0, promotion };
  }
  const freeUnits = Math.floor(safeQuantity / 2);
  const finalSubtotal = (safeQuantity - freeUnits) * baseUnitPrice;
  return { baseUnitPrice, promotionalUnitPrice: null, baseSubtotal, discountAmount: freeUnits * baseUnitPrice, finalSubtotal, freeUnits, promotion };
}

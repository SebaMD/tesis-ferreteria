import { formatQuantityWithUnit } from './units.js';
// Only server-confirmed stock replaces the saved SKU snapshot. Never replay an entry.
export function reviewAfterEntry(review, productId, movement) {
  const stock = Number(movement.stock?.currentStock);
  const unit = review.items.find(item => item.product.id === productId)?.product.unitMeasure || 'unidad';
  return { ...review, confirmation: `Entrada registrada correctamente · SKU #${productId} · ${formatQuantityWithUnit(movement.quantity, unit)}.`,
    items: review.items.map(item => item.product.id === productId && movement.stock?.currentStock != null && Number.isFinite(stock)
      ? { ...item, product: { ...item.product, currentStock: stock } } : item) };
}

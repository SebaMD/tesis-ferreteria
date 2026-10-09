export function getOnlineAvailableStock(product) {
  const value = Number(product?.availableStock ?? product?.currentStock ?? 0);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

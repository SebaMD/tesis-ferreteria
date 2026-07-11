const LOSS_REASON_PATTERN = /(p[eé]rdida|merma|dañ|dano|roto|rotura)/i;

export function isLowStockProduct(product) {
  const currentStock = Number(product?.currentStock);
  const minimumStock = Number(product?.minimumStock);

  return (
    product?.status !== false &&
    Number.isFinite(currentStock) &&
    Number.isFinite(minimumStock) &&
    currentStock <= minimumStock
  );
}

export function getMovementTone(movement) {
  if (movement?.movementType === "ENTRY") return "success";
  if (movement?.movementType === "EXIT") return "info";

  if (movement?.movementType === "ADJUSTMENT") {
    return LOSS_REASON_PATTERN.test(String(movement.reason || "")) ? "critical" : "neutral";
  }

  return "neutral";
}

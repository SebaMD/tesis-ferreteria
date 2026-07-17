const LOSS_REASON_PATTERN = /(p[eé]rdida|merma|dañ|dano|roto|rotura)/i;

export function isLowStockProduct(product) {
  const currentStock = Number(product?.currentStock);
  const minimumStock = Number(product?.minimumStock);

  return (
    product?.status !== false &&
    Number.isFinite(currentStock) &&
    Number.isFinite(minimumStock) &&
    currentStock > 0 &&
    currentStock <= minimumStock
  );
}

export function isOutOfStockProduct(product) {
  const currentStock = Number(product?.currentStock);

  return (
    product?.status !== false &&
    Number.isFinite(currentStock) &&
    currentStock <= 0
  );
}

export function getStockStatus(product, role) {
  const currentStock = Number(product?.currentStock);
  const minimumStock = Number(product?.minimumStock);
  const isCashier = role === "CASHIER";

  if (!Number.isFinite(currentStock) || !Number.isFinite(minimumStock)) {
    return { label: "Disponible", tone: "success" };
  }

  if (currentStock <= 0) {
    return {
      label: "Sin stock",
      tone: "critical",
    };
  }

  if (currentStock <= minimumStock) {
    return {
      label: isCashier ? "Bajo" : "Reponer",
      tone: "warning",
    };
  }

  return { label: "Disponible", tone: "success" };
}

export function getAvailableStockStatus(product, availableStock) {
  const stock = Number(availableStock);
  const minimumStock = Number(product?.minimumStock);

  if (!Number.isFinite(stock)) {
    return { label: "Agregar", tone: "default", disabled: false };
  }

  if (stock <= 0) {
    return { label: "Sin stock", tone: "critical", disabled: true };
  }

  if (Number.isFinite(minimumStock) && stock <= minimumStock) {
    return { label: "Agregar", tone: "warning", disabled: false };
  }

  return { label: "Agregar", tone: "default", disabled: false };
}

export function getMovementTone(movement) {
  if (movement?.movementType === "ENTRY") return "success";
  if (movement?.movementType === "EXIT") return "info";

  if (movement?.movementType === "ADJUSTMENT") {
    return LOSS_REASON_PATTERN.test(String(movement.reason || "")) ? "critical" : "neutral";
  }

  return "neutral";
}

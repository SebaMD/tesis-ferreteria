// Validate a confirmed quantity, not the temporary text while an input is edited.
export function getRemainingCartCapacity(availableStock, quantityInCart = 0) {
  const stock = Number(availableStock);
  const current = Number(quantityInCart);
  return Number.isFinite(stock) && Number.isSafeInteger(current) && current >= 0
    ? Math.max(0, stock - current)
    : 0;
}

export function validateCartQuantity(value, availableStock) {
  const text = typeof value === "string" ? value.trim() : String(value);
  const quantity = Number(text);

  if (!/^\d+$/.test(text) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return { valid: false, message: "Ingresa una cantidad entera mayor o igual a 1." };
  }

  const stock = Number(availableStock);
  if (!Number.isFinite(stock) || stock < 1) {
    return { valid: false, message: "Este producto no tiene stock disponible." };
  }
  if (quantity > stock) {
    return { valid: false, message: `Solo hay ${stock} unidades disponibles.` };
  }

  return { valid: true, quantity };
}

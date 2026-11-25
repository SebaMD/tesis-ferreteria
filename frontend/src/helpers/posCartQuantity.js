export function getPosCartQuantityError(value, availableStock) {
  const text = String(value ?? "").trim();
  if (!text) return "Ingresa una cantidad.";
  const quantity = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(quantity)) return "La cantidad debe ser un número entero.";
  if (quantity < 1) return "La cantidad mínima es 1.";
  if (quantity > availableStock) return "La cantidad no puede superar el stock disponible.";
  return "";
}

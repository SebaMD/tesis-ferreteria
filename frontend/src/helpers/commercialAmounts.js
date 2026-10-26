import { formatClp } from "./formatters.js";

// The backend supplies the ordered historical breakdown. The fallback is only
// for older API responses: never infer an unrecorded delivery tariff/benefit.
export function commercialAmountLines(order) {
  if (Array.isArray(order.commercialAmounts?.lines)) return order.commercialAmounts.lines;
  const subtotal = order.productsSubtotal ?? order.baseSubtotal ?? (order.items || []).reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const discount = order.productsDiscountTotal ?? order.totalDiscount ?? (order.items || []).reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
  return [
    { key: "productsSubtotal", label: "Subtotal original de productos", amount: subtotal },
    { key: "deliveryBaseFee", label: order.deliveryFee == null ? "Despacho: sin cargo registrado (histórico)" : "Costo de despacho", amount: order.deliveryFee ?? null },
    { key: "productsDiscount", label: "Descuentos de productos", amount: discount, discount: true },
    { key: "total", label: "Total final", amount: order.total },
  ];
}
export function formatCommercialAmount(line) {
  return line.amount == null ? "No registrado" : `${line.discount ? "−" : ""}${formatClp(line.amount)}`;
}

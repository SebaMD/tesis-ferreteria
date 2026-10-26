// Presentation contract shared by quotes, persisted orders, receipts and mail.
// All arithmetic is in integer CLP. Never consult the current delivery policy here.
export type AmountLine = { key: string; label: string; amount: string | null; discount: boolean };
export type CommercialAmounts = { lines: AmountLine[]; consistent: boolean; legacy: boolean; note: string | null };
type Source = {
  productsSubtotal?: string | null; productsDiscountTotal?: string | null;
  baseSubtotal?: string | null; totalDiscount?: string | null;
  deliveryFee?: string | null; deliveryBaseFee?: string | null;
  deliveryFeeReason?: string | null; deliveryType?: string; total: string;
  items?: Array<{ unitPrice: string; quantity: number; discountAmount?: string | null }>;
};
function clp(value: unknown): number | null {
  if (value == null || !/^\d+(?:\.0+)?$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
export function buildCommercialAmounts(source: Source): CommercialAmounts {
  const itemSubtotal = source.items?.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const itemDiscount = source.items?.reduce((sum, item) => sum + Number(item.discountAmount ?? 0), 0);
  const subtotal = clp(source.productsSubtotal ?? source.baseSubtotal ?? itemSubtotal);
  const discount = clp(source.productsDiscountTotal ?? source.totalDiscount ?? itemDiscount);
  const fee = clp(source.deliveryFee);
  const total = clp(source.total);
  const historicalBase = clp(source.deliveryBaseFee);
  const reconstructBenefit = source.deliveryType === "DELIVERY" && source.deliveryFeeReason === "FREE_THRESHOLD"
    && fee === 0 && historicalBase !== null && historicalBase > 0;
  const base = reconstructBenefit ? historicalBase : fee;
  const benefit = reconstructBenefit ? historicalBase : 0;
  const legacy = source.deliveryFee == null;
  const consistent = subtotal !== null && discount !== null && total !== null && (legacy || fee !== null)
    && subtotal + (base ?? 0) - discount - benefit === total;
  const line = (key: string, label: string, amount: number | null, isDiscount = false): AmountLine =>
    ({ key, label, amount: amount === null ? null : amount.toFixed(2), discount: isDiscount });
  return {
    lines: [
      line("productsSubtotal", "Subtotal original de productos", subtotal),
      line("deliveryBaseFee", legacy ? "Despacho: sin cargo registrado (histórico)" : "Costo de despacho", base),
      line("productsDiscount", "Descuentos de productos", discount, true),
      ...(reconstructBenefit ? [line("deliveryDiscount", "Descuento por despacho gratis", benefit, true)] : []),
      { key: "total", label: "Total final", amount: source.total, discount: false },
    ],
    consistent,
    legacy,
    note: !consistent ? "El desglose histórico disponible no permite conciliar todos los conceptos. Se conserva el total registrado."
      : source.deliveryFeeReason === "FREE_THRESHOLD" && !reconstructBenefit && historicalBase === null
        ? "Despacho sin cargo. La tarifa anterior al beneficio no está disponible en el registro histórico." : null,
  };
}

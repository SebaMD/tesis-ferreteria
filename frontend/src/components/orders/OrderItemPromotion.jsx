import { formatClp } from "../../helpers/formatters.js";

export default function OrderItemPromotion({ item, compact = false }) {
  if (!item?.promotionTypeSnapshot || Number(item.discountAmount || 0) <= 0) return null;
  const freeUnits = item.promotionTypeSnapshot === "BUY_2_PAY_1" ? Math.floor(Number(item.quantity) / 2) : 0;
  const label = item.promotionTypeSnapshot === "BUY_2_PAY_1"
    ? `2x1 · ${freeUnits} ${freeUnits === 1 ? "unidad" : "unidades"} sin costo`
    : `${item.promotionValueSnapshot}% de descuento`;
  return (
    <span className={`block font-bold text-rust-700 ${compact ? "text-[11px]" : "mt-1 text-xs"}`}>
      {item.promotionNameSnapshot || "Promoción"} · {label} · -{formatClp(item.discountAmount)}
    </span>
  );
}

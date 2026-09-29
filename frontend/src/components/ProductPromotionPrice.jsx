import { formatClp } from "../helpers/formatters.js";
import { getProductPromotionPricing } from "../helpers/promotionPricing.js";

export default function ProductPromotionPrice({ product, quantity = 1, size = "card", showLineSummary = false, showBadge = true }) {
  const pricing = getProductPromotionPricing(product, quantity);
  const large = size === "detail";
  if (!pricing.promotion) {
    return <strong className={`font-mono text-ink-950 ${large ? "text-3xl" : "text-xl max-[600px]:text-base"}`}>{formatClp(product.price)}</strong>;
  }

  return (
    <div className="grid gap-1">
      {showBadge && <span className="w-fit rounded-full bg-rust-600 px-2.5 py-1 text-[11px] font-black text-white">{pricing.promotion.label}</span>}
      {pricing.promotion.type === "PERCENTAGE_DISCOUNT" ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-sm text-slate-500 line-through">{formatClp(pricing.baseUnitPrice)}</span>
          <strong className={`font-mono text-rust-700 ${large ? "text-3xl" : "text-xl max-[600px]:text-base"}`}>{formatClp(pricing.promotionalUnitPrice)}</strong>
        </div>
      ) : (
        <div className="grid gap-0.5">
          <strong className={`font-mono text-ink-950 ${large ? "text-3xl" : "text-xl max-[600px]:text-base"}`}>{formatClp(pricing.baseUnitPrice)}</strong>
          <span className="text-xs font-extrabold text-rust-700">Lleva 2 y paga 1</span>
        </div>
      )}
      {showLineSummary && pricing.discountAmount > 0 && (
        <span className="text-xs font-semibold text-positive-700">
          {pricing.promotion.type === "BUY_2_PAY_1" ? `${pricing.freeUnits} ${pricing.freeUnits === 1 ? "unidad" : "unidades"} sin costo · ` : ""}
          Ahorras {formatClp(pricing.discountAmount)}
        </span>
      )}
    </div>
  );
}

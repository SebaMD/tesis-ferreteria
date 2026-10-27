import { getStockStatus } from "../helpers/inventory.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import { badgeClass } from "../helpers/uiClasses.js";

const stockTones = {
  critical: { border: "border-critical-600", label: "Sin stock" },
  warning: { border: "border-rust-500", label: "A reponer" },
  success: { border: "border-positive-600", label: "Stock suficiente" },
};

export default function VariantStockSummary({ product, draftMinimumStock }) {
  if (!product) return <p className="m-0 text-sm">Stock actual no disponible. Recarga la información.</p>;
  const status = getStockStatus(product, "ADMIN");
  const tone = stockTones[status.tone];
  const minimumChanged = draftMinimumStock === "" || Number(draftMinimumStock) !== Number(product.minimumStock);
  return <div role="group" aria-label="Stock actual guardado al cargar el artículo" className="grid min-w-0 content-start gap-1.75">
    <span className="text-[13px] font-semibold text-ink-700">Stock actual</span>
    <div className={`flex min-h-10.25 min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-l-4 bg-slate-50 px-2.75 py-1.5 ${tone.border}`}>
      <strong className="text-sm">{formatQuantityWithUnit(product.currentStock, product.unitMeasure)}</strong>
      <span className={`${badgeClass(status.tone)} ml-auto shrink-0`}>{tone.label}</span>
    </div>
    {minimumChanged && <span className="text-xs text-slate-500">Estado según el mínimo guardado.</span>}
  </div>;
}

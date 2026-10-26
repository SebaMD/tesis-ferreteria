import { commercialAmountLines, formatCommercialAmount } from "../../helpers/commercialAmounts.js";

export default function OrderAmounts({ order }) {
  return <div className="grid gap-1.5 text-sm" aria-label="Desglose histórico del pedido">
    {commercialAmountLines(order).map(line => <div key={line.key} className={`flex flex-wrap justify-between gap-x-3 gap-y-1 ${line.key === "total" ? "mt-2 border-t border-slate-200 pt-3 font-bold" : ""}`}><span className="min-w-0 flex-1">{line.label}</span><strong className="shrink-0 font-mono">{formatCommercialAmount(line)}</strong></div>)}
    {order.commercialAmounts?.note && <small className="text-slate-500">{order.commercialAmounts.note}</small>}
    {(order.deliveryIsDemo || order.isDemo) && <small className="text-slate-500">Tarifa DEMO ficticia. No corresponde a una tarifa oficial de FYF.</small>}
  </div>;
}

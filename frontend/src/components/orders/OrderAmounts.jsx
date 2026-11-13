import { commercialAmountLines, formatCommercialAmount } from "../../helpers/commercialAmounts.js";

export default function OrderAmounts({ order, checkout = false, provisional = false }) {
  // Checkout is an authoritative current quote, not a reconstruction of history.
  const lines = checkout ? [
    { key: "productsSubtotal", label: "Productos", amount: order.productsSubtotal },
    { key: "productsDiscount", label: "Descuentos aplicados", amount: order.productsDiscountTotal, discount: true },
    { key: "productsNet", label: "Subtotal después de descuentos", amount: order.productsNet },
    { key: "deliveryFee", label: "Costo de despacho", amount: order.deliveryFee },
    { key: "total", label: "Total final", amount: order.total },
  ] : commercialAmountLines(order);
  return <div className="grid gap-1.5 text-sm" aria-label={checkout ? provisional ? "Último resumen, pendiente de validación" : "Resumen definitivo de la compra" : "Desglose histórico del pedido"}>
    {order.deliveryPricingMode==='LOCAL_FIXED'&&order.deliveryType==='DELIVERY'&&<p className="m-0 text-xs text-slate-500">Despacho local · Santa Juana{order.deliveryFeeReason==='FREE_THRESHOLD'?' · Gratuidad aplicada':''}</p>}
    {lines.map(line => <div key={line.key} className={`flex flex-wrap justify-between gap-x-3 gap-y-1 ${line.key === "total" ? "mt-2 border-t border-slate-200 pt-3 font-bold" : ""}`}><span className="min-w-0 flex-1">{line.label}</span><strong className="shrink-0 font-mono">{formatCommercialAmount(line)}</strong></div>)}
    {order.commercialAmounts?.note && <small className="text-slate-500">{order.commercialAmounts.note}</small>}
    {(order.deliveryIsDemo || order.isDemo) && <small className="text-slate-500">Tarifa DEMO ficticia. No corresponde a una tarifa oficial de FYF.</small>}
  </div>;
}

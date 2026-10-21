import { formatClp } from "../../helpers/formatters.js";

export default function OrderAmounts({ order }) {
  const legacy = order.deliveryFee == null;
  const subtotal = order.productsSubtotal ?? order.baseSubtotal ?? (order.items || []).reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const discount = order.productsDiscountTotal ?? order.totalDiscount ?? (order.items || []).reduce((s, i) => s + Number(i.discountAmount || 0), 0);
  return <div className="grid gap-1.5 text-sm" aria-label="Desglose histórico del pedido">
    <div className="flex flex-wrap justify-between gap-2"><span>Subtotal de productos</span><strong>{formatClp(subtotal)}</strong></div>
    <div className="flex flex-wrap justify-between gap-2"><span>Descuentos de productos</span><strong>−{formatClp(discount)}</strong></div>
    <div className="flex flex-wrap justify-between gap-2"><span>Despacho</span><strong>{legacy ? "Sin cargo registrado (histórico)" : formatClp(order.deliveryFee)}</strong></div>
    {order.deliveryFeeReason === "FREE_THRESHOLD" && <small>Despacho gratuito por monto de productos.</small>}
    {(order.deliveryIsDemo || order.isDemo) && <small className="text-slate-500">Tarifa DEMO ficticia. No corresponde a una tarifa oficial de FYF.</small>}
  </div>;
}

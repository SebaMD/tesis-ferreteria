import { formatOnlineOrderFolio } from "../../helpers/onlineOrders.js";

export default function PaymentAttentionNotice({ orders }) {
  const pending = orders.find(order => order.payment?.status !== "AUTHORIZED");
  if (!pending) return null;
  return <aside className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
    Tienes un pago cuyo resultado aún se está verificando. No vuelvas a pagar ese pedido. Puedes realizar una compra independiente. {" "}
    <a className="font-bold underline" href={`#order-${pending.id}`}>Consultar {formatOnlineOrderFolio(pending.id)}</a>
  </aside>;
}

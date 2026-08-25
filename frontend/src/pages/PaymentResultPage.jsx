import { AlertTriangle, CheckCircle2, Clock3, ShoppingCart, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp } from "../helpers/formatters.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderStatus,
  getOnlinePaymentStatus,
  isOnlineOrderPaid,
} from "../helpers/onlineOrders.js";
import { badgeClass } from "../helpers/uiClasses.js";
import useCart from "../hooks/useCart.js";
import { getMyOnlineOrderByIdRequest } from "../services/onlineOrders.service.js";

function resultIcon(status) {
  if (isOnlineOrderPaid(status)) return <CheckCircle2 className="text-positive-600" size={52} />;
  if (["PAYMENT_FAILED", "CANCELLED", "EXPIRED"].includes(status)) {
    return <XCircle className="text-critical-600" size={52} />;
  }
  if (status === "PAYMENT_REVIEW") return <AlertTriangle className="text-rust-600" size={52} />;
  return <Clock3 className="text-rust-600" size={52} />;
}

function missingResultMessage(statusHint) {
  if (statusHint === "INVALID_RETURN") {
    return "No pudimos identificar el retorno de Webpay. Revisa Mis pedidos antes de volver a pagar.";
  }
  return "No pudimos confirmar el resultado todavía. Revisa Mis pedidos para conocer el estado actualizado.";
}

export default function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const parsedOrderId = Number(searchParams.get("orderId"));
  const orderId = Number.isInteger(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : null;
  const statusHint = searchParams.get("status") || "PROCESSING";
  const { removePurchasedItems } = useCart();
  const removePurchasedItemsRef = useRef(removePurchasedItems);
  const cartAdjustedRef = useRef(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    removePurchasedItemsRef.current = removePurchasedItems;
  }, [removePurchasedItems]);

  useEffect(() => {
    if (!orderId) return undefined;
    let active = true;
    let refreshTimer;
    let attempts = 0;

    const loadResult = async () => {
      attempts += 1;
      try {
        const data = await getMyOnlineOrderByIdRequest(orderId);
        if (!active) return;
        setOrder(data);
        setErrorMessage("");
        if (isOnlineOrderPaid(data.status) && !cartAdjustedRef.current) {
          cartAdjustedRef.current = true;
          removePurchasedItemsRef.current(data.items || []);
        }

        if (data.status === "PENDING_PAYMENT" && attempts < 40) {
          refreshTimer = window.setTimeout(loadResult, 3_000);
        }
      } catch (error) {
        if (!active) return;
        const message = getApiError(error, "No se pudo consultar el resultado del pago");
        setErrorMessage(message);
        if (attempts === 1) toast.error(message);
        if (attempts < 40) refreshTimer = window.setTimeout(loadResult, 5_000);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadResult();

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
    };
  }, [orderId]);

  const orderStatus = order ? getOnlineOrderStatus(order.status) : null;
  const paymentStatus = order?.payment ? getOnlinePaymentStatus(order.payment.status) : null;
  const isPaid = isOnlineOrderPaid(order?.status);

  return (
    <main className="mx-auto grid min-h-120 w-full max-w-190 place-items-center px-6 py-10 max-[720px]:px-3.5">
      <LoadingOverlay active={loading} />

      {!loading && order ? (
        <section className="grid w-full justify-items-center gap-5 rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm max-[620px]:p-5">
          {resultIcon(order.status)}
          <div>
            <h1 className="m-0 text-2xl font-bold text-ink-950">
              {isPaid ? "Pago realizado correctamente" : orderStatus.label}
            </h1>
            <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">{orderStatus.description}</p>
          </div>

          <div className="grid w-full max-w-125 gap-3 rounded-[5px] bg-slate-50 p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-600">Pedido</span>
              <strong className="font-mono text-ink-950">{formatOnlineOrderFolio(order.id)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-600">Total</span>
              <strong className="font-mono text-xl text-ink-950">{formatClp(order.total)}</strong>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <span className={badgeClass(orderStatus.tone)}>{orderStatus.label}</span>
              {paymentStatus && <span className={badgeClass(paymentStatus.tone)}>{paymentStatus.label}</span>}
            </div>
          </div>

          {order.status === "PAYMENT_REVIEW" && (
            <p className="m-0 w-full max-w-125 rounded-[5px] bg-rust-50 px-3 py-3 text-xs leading-5 text-rust-700">
              Tu pago fue autorizado, pero requiere revisión. No vuelvas a pagar este pedido.
            </p>
          )}

          <div className="flex w-full max-w-125 flex-wrap justify-center gap-3 max-[520px]:flex-col">
            <Link className="inline-flex min-h-10 flex-1 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/orders">
              Ver mis pedidos
            </Link>
            <Link className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[5px] border border-slate-300 px-4 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100" to="/cart">
              <ShoppingCart size={17} /> Volver al carrito
            </Link>
          </div>
        </section>
      ) : !loading && (
        <section className="grid w-full justify-items-center gap-5 rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm max-[620px]:p-5">
          <AlertTriangle className="text-rust-600" size={52} />
          <div>
            <h1 className="m-0 text-2xl font-bold text-ink-950">Resultado de pago no disponible</h1>
            <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">
              {errorMessage || missingResultMessage(statusHint)}
            </p>
          </div>
          <div className="flex w-full max-w-125 flex-wrap justify-center gap-3 max-[520px]:flex-col">
            <Link className="inline-flex min-h-10 flex-1 items-center justify-center rounded-[5px] border border-ink-950 bg-ink-950 px-4 text-sm font-bold text-white no-underline hover:bg-ink-700" to="/orders">
              Ver mis pedidos
            </Link>
            <Link className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[5px] border border-slate-300 px-4 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100" to="/cart">
              <ShoppingCart size={17} /> Volver al carrito
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

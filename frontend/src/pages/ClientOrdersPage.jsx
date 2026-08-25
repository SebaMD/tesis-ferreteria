import { AlertTriangle, CreditCard, EyeOff, MapPin, PackageSearch, RefreshCw, ShoppingCart, Store, Truck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { formatClp, formatDate } from "../helpers/formatters.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
  getOnlinePaymentStatus,
  submitWebpayForm,
} from "../helpers/onlineOrders.js";
import { badgeClass } from "../helpers/uiClasses.js";
import {
  archiveOnlineOrderRequest,
  continueOnlineOrderPaymentRequest,
  getMyOnlineOrdersRequest,
  retryOnlineOrderPaymentRequest,
} from "../services/onlineOrders.service.js";

const ORDER_DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default function ClientOrdersPage() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [paymentActionOrderIds, setPaymentActionOrderIds] = useState(() => new Set());
  const [archivingOrderId, setArchivingOrderId] = useState(null);
  const paymentActionRefs = useRef(new Set());

  const loadOrders = useCallback(async ({ showLoading = true, notifyError = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      setOrders(await getMyOnlineOrdersRequest());
      setLoadError("");
    } catch (error) {
      const message = getApiError(error, "No se pudieron cargar tus pedidos");
      setLoadError(message);
      if (notifyError) toast.error(message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();

    const refreshOrders = () => loadOrders({ showLoading: false, notifyError: false });
    const refreshTimer = window.setInterval(refreshOrders, 30_000);
    window.addEventListener("focus", refreshOrders);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOrders);
    };
  }, [loadOrders]);

  useEffect(() => {
    if (loading || !location.hash.startsWith("#order-")) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, location.hash, orders]);

  const handlePaymentAction = async (order, action) => {
    const canRun = action === "continue" ? order.canContinuePayment : order.canRetryPayment;
    if (!canRun || paymentActionRefs.current.has(order.id)) return;

    paymentActionRefs.current.add(order.id);
    setPaymentActionOrderIds((current) => new Set(current).add(order.id));
    let redirectStarted = false;

    try {
      const payment = action === "continue"
        ? await continueOnlineOrderPaymentRequest(order.id)
        : await retryOnlineOrderPaymentRequest(order.id);
      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (error) {
      toast.error(getApiError(
        error,
        action === "continue" ? "No se pudo continuar el pago" : "No se pudo reintentar el pago",
      ));
      await loadOrders({ showLoading: false, notifyError: false });
    } finally {
      if (!redirectStarted) {
        paymentActionRefs.current.delete(order.id);
        setPaymentActionOrderIds((current) => {
          const next = new Set(current);
          next.delete(order.id);
          return next;
        });
      }
    }
  };

  const handleArchiveOrder = async (order) => {
    if (!order.canArchive || archivingOrderId === order.id) return;
    if (!window.confirm("Este intento dejará de aparecer en Mis pedidos, pero conservará su registro. ¿Deseas ocultarlo?")) return;

    setArchivingOrderId(order.id);
    try {
      await archiveOnlineOrderRequest(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      toast.success("El intento se ocultó de Mis pedidos");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo ocultar el pedido"));
      await loadOrders({ showLoading: false, notifyError: false });
    } finally {
      setArchivingOrderId(null);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-280 gap-5 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold text-ink-950">Mis pedidos</h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">Consulta tus pedidos online y el estado de sus pagos.</p>
        </div>
        <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-rust-600 no-underline" to="/catalog">
          <ShoppingCart size={17} /> Volver al catálogo
        </Link>
      </div>

      {!loading && loadError ? (
        <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="grid justify-items-center gap-3">
            <AlertTriangle className="text-rust-600" size={46} />
            <strong className="text-lg text-ink-950">No pudimos cargar tus pedidos</strong>
            <span className="text-sm text-slate-500">{loadError}</span>
            <button type="button" onClick={loadOrders}><RefreshCw size={17} /> Reintentar</button>
          </div>
        </section>
      ) : !loading && orders.length === 0 ? (
        <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="grid justify-items-center gap-3">
            <PackageSearch className="text-slate-400" size={46} />
            <strong className="text-lg text-ink-950">Todavía no tienes pedidos</strong>
            <span className="text-sm text-slate-500">Cuando inicies una compra aparecerá en este historial.</span>
            <Link className="font-bold text-rust-600" to="/catalog">Explorar catálogo</Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          {orders.map((order) => {
            const orderStatus = getOnlineOrderStatus(order.status);
            const paymentStatus = order.payment ? getOnlinePaymentStatus(order.payment.status) : null;
            const delivery = getOnlineOrderDeliveryType(order.deliveryType);
            const isProcessingPayment = paymentActionOrderIds.has(order.id);
            const isArchiving = archivingOrderId === order.id;

            return (
              <article className="scroll-mt-24 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm target:ring-2 target:ring-rust-500" id={`order-${order.id}`} key={order.id}>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 max-[620px]:px-4">
                  <div className="grid gap-1">
                    <strong className="font-mono text-base text-ink-950">{formatOnlineOrderFolio(order.id)}</strong>
                    <span className="text-xs text-slate-500">{formatDate(order.createdAt, ORDER_DATE_OPTIONS)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {paymentStatus && <span className={badgeClass(paymentStatus.tone)}>{paymentStatus.label}</span>}
                    <span className={badgeClass(orderStatus.tone)}>{orderStatus.label}</span>
                  </div>
                </header>

                <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5 p-5 max-[720px]:grid-cols-1 max-[620px]:p-4">
                  <div className="grid content-start gap-2">
                    <div className="flex items-start gap-3 rounded-[5px] border border-slate-200 bg-white px-3 py-3">
                      {order.deliveryType === "DELIVERY" ? <Truck className="mt-0.5 shrink-0 text-rust-600" size={18} /> : <Store className="mt-0.5 shrink-0 text-rust-600" size={18} />}
                      <div className="grid gap-0.5 text-xs leading-5">
                        <strong className="text-sm text-ink-950">{delivery.label}</strong>
                        {order.deliveryType === "DELIVERY" ? (
                          <>
                            <span className="flex items-start gap-1 text-slate-600"><MapPin className="mt-0.5 shrink-0" size={14} /> {order.deliveryAddress}, {order.deliveryCommune}</span>
                            <span className="text-slate-500">Recibe: {order.deliveryRecipientName} · {order.deliveryPhone}</span>
                            {order.deliveryReference && <span className="text-slate-500">Referencia: {order.deliveryReference}</span>}
                          </>
                        ) : <span className="text-slate-500">Podrás retirarlo cuando el estado indique que está listo.</span>}
                      </div>
                    </div>
                    {(order.items || []).map((item) => (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[5px] bg-slate-50 px-3 py-2.5 text-sm" key={`${order.id}-${item.productId}`}>
                        <div className="grid min-w-0 gap-0.5">
                          <strong className="truncate text-ink-950">{item.productName}</strong>
                          <span className="text-xs text-slate-500">{item.quantity} × {formatClp(item.unitPrice)}</span>
                        </div>
                        <strong className="font-mono text-ink-950">{formatClp(item.subtotal)}</strong>
                      </div>
                    ))}
                    {order.status === "PAYMENT_REVIEW" && (
                      <p className="m-0 rounded-[5px] bg-rust-50 px-3 py-2.5 text-xs leading-5 text-rust-700">
                        El pago está en revisión. No realices otro intento; el comercio debe revisar este pedido.
                      </p>
                    )}
                  </div>

                  <aside className="grid content-start gap-3 border-l border-slate-200 pl-5 max-[720px]:border-t max-[720px]:border-l-0 max-[720px]:pt-4 max-[720px]:pl-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-600">Total</span>
                      <strong className="font-mono text-xl text-ink-950">{formatClp(order.total)}</strong>
                    </div>
                    <p className="m-0 text-xs leading-5 text-slate-500">{orderStatus.description}</p>
                    {order.canContinuePayment && (
                      <button type="button" onClick={() => handlePaymentAction(order, "continue")} disabled={isProcessingPayment || isArchiving}>
                        {isProcessingPayment ? <RefreshCw className="animate-spin" size={17} /> : <CreditCard size={17} />}
                        {isProcessingPayment ? "Abriendo Webpay..." : "Continuar pago"}
                      </button>
                    )}
                    {order.canRetryPayment && (
                      <button type="button" onClick={() => handlePaymentAction(order, "retry")} disabled={isProcessingPayment || isArchiving}>
                        {isProcessingPayment ? <RefreshCw className="animate-spin" size={17} /> : <CreditCard size={17} />}
                        {isProcessingPayment ? "Iniciando..." : "Reintentar pago"}
                      </button>
                    )}
                    {order.canArchive && (
                      <button
                        className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
                        type="button"
                        onClick={() => handleArchiveOrder(order)}
                        disabled={isArchiving || isProcessingPayment}
                      >
                        {isArchiving ? <RefreshCw className="animate-spin" size={17} /> : <EyeOff size={17} />}
                        {isArchiving ? "Ocultando..." : "Ocultar"}
                      </button>
                    )}
                  </aside>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

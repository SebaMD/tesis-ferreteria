import { AlertTriangle, CreditCard, EyeOff, PackageSearch, RefreshCw, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import OrderDetailModal from "../components/orders/OrderDetailModal.jsx";
import OrderSummaryCard from "../components/orders/OrderSummaryCard.jsx";
import { submitWebpayForm } from "../helpers/onlineOrders.js";
import {
  archiveOnlineOrderRequest,
  continueOnlineOrderPaymentRequest,
  getMyOnlineOrdersRequest,
  retryOnlineOrderPaymentRequest,
} from "../services/onlineOrders.service.js";

const ACTIVE_STATUSES = new Set([
  "PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PREPARING",
  "READY_FOR_PICKUP", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY",
]);
const INCOMPLETE_STATUSES = new Set(["PAYMENT_FAILED", "CANCELLED", "EXPIRED"]);

function OrdersSection({ title, description, orders, renderOrder, emptyText }) {
  return (
    <section className="grid gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-bold text-ink-950 max-[520px]:text-lg">{title}</h2>
          {description && <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{orders.length}</span>
      </header>
      {orders.length ? <div className="grid gap-3">{orders.map(renderOrder)}</div> : (
        <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">{emptyText}</p>
      )}
    </section>
  );
}

export default function ClientOrdersPage() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [paymentActionOrderIds, setPaymentActionOrderIds] = useState(() => new Set());
  const [archivingOrderId, setArchivingOrderId] = useState(null);
  const paymentActionRefs = useRef(new Set());

  const loadOrders = useCallback(async ({ showLoading = true, notifyError = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getMyOnlineOrdersRequest();
      setOrders(data);
      setSelectedOrder((current) => current
        ? data.find((order) => order.id === current.id) || null
        : null);
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
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, location.hash, orders]);

  const grouped = useMemo(() => ({
    active: orders.filter((order) => ACTIVE_STATUSES.has(order.status)),
    delivered: orders.filter((order) => order.status === "DELIVERED"),
    incomplete: orders.filter((order) => INCOMPLETE_STATUSES.has(order.status)),
  }), [orders]);

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
      toast.error(getApiError(error, action === "continue" ? "No se pudo continuar el pago" : "No se pudo reintentar el pago"));
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
      setSelectedOrder((current) => current?.id === order.id ? null : current);
      toast.success("El intento se ocultó de Mis pedidos");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo ocultar el pedido"));
      await loadOrders({ showLoading: false, notifyError: false });
    } finally {
      setArchivingOrderId(null);
    }
  };

  const actionsFor = (order) => {
    const isProcessing = paymentActionOrderIds.has(order.id);
    const isArchiving = archivingOrderId === order.id;
    if (!order.canContinuePayment && !order.canRetryPayment && !order.canArchive) return null;
    return (
      <>
        {order.canContinuePayment && (
          <button type="button" onClick={() => handlePaymentAction(order, "continue")} disabled={isProcessing || isArchiving}>
            {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <CreditCard size={16} />}
            {isProcessing ? "Abriendo Webpay..." : "Continuar pago"}
          </button>
        )}
        {order.canRetryPayment && (
          <button type="button" onClick={() => handlePaymentAction(order, "retry")} disabled={isProcessing || isArchiving}>
            {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <CreditCard size={16} />}
            {isProcessing ? "Iniciando..." : "Reintentar pago"}
          </button>
        )}
        {order.canArchive && (
          <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => handleArchiveOrder(order)} disabled={isArchiving || isProcessing}>
            {isArchiving ? <RefreshCw className="animate-spin" size={16} /> : <EyeOff size={16} />}
            {isArchiving ? "Ocultando..." : "Ocultar"}
          </button>
        )}
      </>
    );
  };

  const renderOrder = (secondary = false) => (order) => (
    <OrderSummaryCard key={order.id} order={order} onView={setSelectedOrder} actions={actionsFor(order)} secondary={secondary} />
  );

  return (
    <main className="mx-auto grid w-full max-w-260 gap-8 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-3xl font-bold text-ink-950 max-[520px]:text-2xl">Mis compras</h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">Sigue tus pedidos en curso y consulta tus compras anteriores.</p>
        </div>
        <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-rust-600 no-underline" to="/catalog">
          <ShoppingCart size={17} /> Volver al catálogo
        </Link>
      </header>

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
            <strong className="text-lg text-ink-950">Todavía no tienes compras</strong>
            <span className="text-sm text-slate-500">Cuando inicies una compra aparecerá aquí.</span>
            <Link className="font-bold text-rust-600" to="/catalog">Explorar catálogo</Link>
          </div>
        </section>
      ) : !loading && (
        <>
          <OrdersSection title="Pedidos en curso" description="Pagos pendientes y pedidos que todavía están en preparación o entrega." orders={grouped.active} renderOrder={renderOrder()} emptyText="No tienes pedidos en curso." />
          <OrdersSection title="Historial" description="Compras que ya fueron entregadas o retiradas." orders={grouped.delivered} renderOrder={renderOrder()} emptyText="Todavía no tienes compras entregadas." />
          {grouped.incomplete.length > 0 && (
            <OrdersSection title="No completados" description="Intentos fallidos, cancelados o expirados que se conservan por trazabilidad." orders={grouped.incomplete} renderOrder={renderOrder(true)} emptyText="" />
          )}
        </>
      )}
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </main>
  );
}

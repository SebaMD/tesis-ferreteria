import { ClipboardList, CreditCard, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import OrderDetailModal from "../components/orders/OrderDetailModal.jsx";
import OrderSummaryCard from "../components/orders/OrderSummaryCard.jsx";
import { saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import { groupBuyerOrders } from "../helpers/buyerOrderGroups.js";
import { submitWebpayForm } from "../helpers/onlineOrders.js";
import {
  getGuestDeviceOrderReceiptRequest,
  getGuestDeviceOrderDeliveryProofRequest,
  getGuestDeviceOrdersRequest,
  retryGuestDeviceOrderPaymentRequest,
} from "../services/onlineOrders.service.js";

function OrdersSection({ title, description, orders, onView, renderActions, empty, secondary = false }) {
  return (
    <section className="grid gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-bold text-ink-950 max-[520px]:text-lg">{title}</h2>
          {description && <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{orders.length}</span>
      </header>
      {orders.length ? (
        <div className="grid gap-3">
          {orders.map((order) => (
            <OrderSummaryCard
              key={order.id}
              order={order}
              onView={onView}
              requestReceipt={({ id }) => getGuestDeviceOrderReceiptRequest(id)}
              actions={renderActions?.(order)}
              secondary={secondary}
            />
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

export default function GuestDeviceOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentActionOrderIds, setPaymentActionOrderIds] = useState(() => new Set());

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getGuestDeviceOrdersRequest();
      setOrders(data);
      setSelectedOrder((current) => current
        ? data.find((order) => order.id === current.id) || null
        : null);
    } catch (requestError) {
      setError(getApiError(requestError, "No se pudieron recuperar las compras de este dispositivo"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
  }, [loadOrders]);

  const grouped = useMemo(() => groupBuyerOrders(orders), [orders]);

  const handleRetryPayment = async (order) => {
    if (!order?.canRetryPayment || paymentActionOrderIds.has(order.id)) return;
    setPaymentActionOrderIds((current) => new Set(current).add(order.id));
    let redirectStarted = false;
    try {
      const payment = await retryGuestDeviceOrderPaymentRequest(order.id);
      if (payment.guestAccessToken) {
        saveGuestOrderAccessToken(payment.orderId, payment.guestAccessToken);
      }
      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (requestError) {
      toast.error(getApiError(requestError, "No se pudo reintentar el pago"));
      await loadOrders();
    } finally {
      if (!redirectStarted) {
        setPaymentActionOrderIds((current) => {
          const next = new Set(current);
          next.delete(order.id);
          return next;
        });
      }
    }
  };

  const actionsFor = (order) => {
    if (!order?.canRetryPayment) return null;
    const isProcessing = paymentActionOrderIds.has(order.id);
    return (
      <button type="button" onClick={() => handleRetryPayment(order)} disabled={isProcessing}>
        {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <CreditCard size={16} />}
        {isProcessing ? "Iniciando..." : "Reintentar pago"}
      </button>
    );
  };

  return (
    <main className="mx-auto grid w-full max-w-260 gap-8 px-6 py-8 max-[620px]:px-3.5 max-[620px]:py-6">
      <LoadingOverlay active={loading} />
      <header>
        <span className="text-xs font-extrabold text-rust-600 uppercase">Compras sin cuenta</span>
        <h1 className="mt-2 mb-2 text-3xl font-bold text-ink-950 max-[620px]:text-2xl">Mis compras en este dispositivo</h1>
        <p className="m-0 max-w-190 text-sm leading-6 text-slate-500">
          Aquí aparecen las compras invitadas realizadas desde este navegador. Si borras sus cookies, todavía puedes usar el enlace seguro enviado por correo.
        </p>
      </header>

      {error && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <span>{error}</span>
          <button className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100" type="button" onClick={loadOrders} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={17} /> Reintentar
          </button>
        </section>
      )}

      {!loading && !error && orders.length === 0 ? (
        <section className="grid justify-items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
          <ClipboardList className="text-slate-400" size={42} />
          <strong className="text-ink-950">Todavía no hay compras invitadas en este dispositivo</strong>
          <p className="m-0 max-w-130 text-sm leading-6 text-slate-500">Las compras aparecerán aquí sin guardar los tokens individuales de seguimiento en el navegador.</p>
        </section>
      ) : !loading && !error && (
        <>
          {grouped.payments.length > 0 && (
            <OrdersSection title="Pagos pendientes" description="Intentos pendientes o en revisión antes de convertirse en pedidos operativos." orders={grouped.payments} onView={setSelectedOrder} renderActions={actionsFor} empty="" secondary />
          )}
          <OrdersSection title="Pedidos en curso" description="Compras pagadas que continúan en preparación, retiro o entrega." orders={grouped.active} onView={setSelectedOrder} renderActions={actionsFor} empty="No hay compras en curso." />
          <OrdersSection title="Historial" description="Compras entregadas o retiradas desde este dispositivo." orders={grouped.delivered} onView={setSelectedOrder} renderActions={actionsFor} empty="No hay compras entregadas." />
          {grouped.incomplete.length > 0 && (
            <OrdersSection title="No completados" description="Intentos fallidos, cancelados o expirados." orders={grouped.incomplete} onView={setSelectedOrder} renderActions={actionsFor} empty="" secondary />
          )}
        </>
      )}

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        requestDeliveryProof={({ id }) => getGuestDeviceOrderDeliveryProofRequest(id)}
        actions={selectedOrder ? actionsFor(selectedOrder) : null}
      />
    </main>
  );
}

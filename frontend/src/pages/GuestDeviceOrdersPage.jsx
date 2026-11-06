import { ClipboardList, CreditCard, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppModal from "../components/AppModal.jsx";
import CatalogEmptyState from "../components/CatalogEmptyState.jsx";
import { InformationBackLink } from "../components/InformationNavigation.jsx";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import OrderDetailModal from "../components/orders/OrderDetailModal.jsx";
import OrderSummaryCard from "../components/orders/OrderSummaryCard.jsx";
import { saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import { groupBuyerOrders } from "../helpers/buyerOrderGroups.js";
import { canHideGuestOrder, readHiddenGuestOrderIds, writeHiddenGuestOrderIds } from "../helpers/guestOrderVisibility.js";
import { submitWebpayForm } from "../helpers/onlineOrders.js";
import {
  getGuestDeviceOrderReceiptRequest,
  getGuestDeviceOrderDeliveryProofRequest,
  getGuestDeviceOrdersRequest,
  retryGuestDeviceOrderPaymentRequest,
} from "../services/onlineOrders.service.js";

function OrdersSection({ title, description, orders, onView, renderActions, renderAfterDetail, empty, secondary = false }) {
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
              afterDetailActions={renderAfterDetail?.(order)}
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
  const paymentActionRefs = useRef(new Set());
  const [hiddenOrderIds, setHiddenOrderIds] = useState(() => readHiddenGuestOrderIds(sessionStorage));
  const [showHidden, setShowHidden] = useState(false);
  const [hideCandidate, setHideCandidate] = useState(null);

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

  const hiddenOrders = orders.filter(order => canHideGuestOrder(order) && hiddenOrderIds.has(order.id));
  const grouped = useMemo(() => groupBuyerOrders(orders.filter(order => !canHideGuestOrder(order) || !hiddenOrderIds.has(order.id))), [orders, hiddenOrderIds]);

  const changeVisibility = (order, hidden) => {
    if (!canHideGuestOrder(order) || paymentActionRefs.current.has(order.id)) return;
    const next = new Set(hiddenOrderIds);
    if (hidden) next.add(order.id); else next.delete(order.id);
    if (!writeHiddenGuestOrderIds(sessionStorage, next)) {
      toast.error("No se pudo guardar la preferencia en esta pestaña. El pedido sigue visible.");
      return;
    }
    setHiddenOrderIds(next);
    setSelectedOrder(null);
    setHideCandidate(null);
    toast.success(hidden ? "Intento ocultado en esta pestaña. Puedes recuperarlo en Mostrar ocultos." : "El intento volvió a aparecer en Mis pedidos");
  };

  const handleRetryPayment = async (order) => {
    if (!order?.canRetryPayment || paymentActionRefs.current.has(order.id)) return;
    paymentActionRefs.current.add(order.id);
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
        paymentActionRefs.current.delete(order.id);
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

  const visibilityActionFor = (order) => {
    if (!canHideGuestOrder(order)) return null;
    const hidden = hiddenOrderIds.has(order.id);
    return (
      <button
        className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100"
        type="button"
        disabled={paymentActionOrderIds.has(order.id)}
        onClick={() => hidden ? changeVisibility(order, false) : setHideCandidate(order)}
      >
        {hidden ? <Eye size={16} /> : <EyeOff size={16} />}{hidden ? "Restaurar" : "Ocultar"}
      </button>
    );
  };

  return (
    <main className="mx-auto grid w-full max-w-260 gap-8 px-6 py-8 max-[620px]:px-3.5 max-[620px]:py-6">
      <LoadingOverlay active={loading} />
      <header className="public-page-header">
        <div>
        <span className="text-xs font-extrabold text-rust-600 uppercase">Pedidos sin cuenta</span>
        <h1 className="mt-2 mb-2 text-3xl font-bold text-ink-950 max-[620px]:text-2xl">Mis pedidos en este dispositivo</h1>
        <p className="m-0 max-w-190 text-sm leading-6 text-slate-500">
          Aquí aparecen las compras invitadas realizadas desde este navegador. Si borras sus cookies, todavía puedes usar el enlace seguro enviado por correo.
        </p>
        </div>
        {!loading && !error && orders.length > 0 && <InformationBackLink />}
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
        <CatalogEmptyState icon={ClipboardList} title="Todavía no hay compras invitadas en este dispositivo">Las compras aparecerán aquí sin guardar los tokens individuales de seguimiento en el navegador.</CatalogEmptyState>
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
          {hiddenOrders.length > 0 && (
            <section className="grid gap-3">
              <div>
                <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" aria-expanded={showHidden} aria-controls="hidden-guest-orders" onClick={() => setShowHidden(value => !value)}>
                  <Eye size={16} />{showHidden ? "Cerrar ocultos" : "Mostrar ocultos"} ({hiddenOrders.length})
                </button>
                <p className="mt-2 mb-0 text-xs leading-5 text-slate-500">Solo se ocultan en esta pestaña. No se elimina el pedido ni su enlace seguro; puedes restaurarlo aquí. Al cerrar la pestaña se restablece esta preferencia.</p>
              </div>
              {showHidden && (
                <div id="hidden-guest-orders">
                  <OrdersSection title="Intentos ocultos" orders={hiddenOrders} onView={setSelectedOrder} renderActions={actionsFor} renderAfterDetail={visibilityActionFor} empty="" secondary />
                </div>
              )}
            </section>
          )}
        </>
      )}

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        requestDeliveryProof={({ id }) => getGuestDeviceOrderDeliveryProofRequest(id)}
        actions={selectedOrder ? <>{actionsFor(selectedOrder)}{visibilityActionFor(selectedOrder)}</> : null}
      />
      <AppModal
        open={Boolean(hideCandidate)}
        title="Ocultar intento de pago"
        description="Preferencia local y reversible, solo en esta pestaña."
        onClose={() => setHideCandidate(null)}
        size="small"
        footer={(
          <>
            <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => setHideCandidate(null)}>Cancelar</button>
            <button type="button" onClick={() => changeVisibility(hideCandidate, true)}><EyeOff size={16} />Ocultar</button>
          </>
        )}
      >
        <p className="m-0 text-sm leading-6 text-slate-600">El intento dejará de aparecer en No completados. Podrás recuperarlo con Mostrar ocultos y Restaurar, sin eliminar su historial ni el acceso enviado por correo.</p>
      </AppModal>
    </main>
  );
}

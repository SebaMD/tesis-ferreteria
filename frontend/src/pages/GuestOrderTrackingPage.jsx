import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Mail,
  RefreshCw,
  ShoppingCart,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import DownloadReceiptButton from "../components/orders/DownloadReceiptButton.jsx";
import DeliveryProofViewer from "../components/orders/DeliveryProofViewer.jsx";
import { formatClp, formatDate } from "../helpers/formatters.js";
import {
  captureGuestAccessTokenFromHash,
  readGuestOrderAccessToken,
  saveGuestOrderAccessToken,
} from "../helpers/guestCheckout.js";
import {
  formatOnlineOrderFolio,
  getOnlineOrderDeliveryType,
  getOnlineOrderStatus,
  getOnlinePaymentStatus,
  isOnlineOrderPaid,
  submitWebpayForm,
} from "../helpers/onlineOrders.js";
import { badgeClass } from "../helpers/uiClasses.js";
import useCart from "../hooks/useCart.js";
import {
  continueGuestOnlineOrderPaymentRequest,
  getGuestOnlineOrderRequest,
  getGuestOnlineOrderReceiptRequest,
  getGuestOnlineOrderDeliveryProofRequest,
  retryGuestOnlineOrderPaymentRequest,
} from "../services/onlineOrders.service.js";

function resultIcon(status) {
  if (isOnlineOrderPaid(status)) return <CheckCircle2 className="text-positive-600" size={52} />;
  if (["PAYMENT_FAILED", "CANCELLED", "EXPIRED"].includes(status)) {
    return <XCircle className="text-critical-600" size={52} />;
  }
  if (status === "PAYMENT_REVIEW") return <AlertTriangle className="text-rust-600" size={52} />;
  return <Clock3 className="text-rust-600" size={52} />;
}

function nextRefreshDelay(status) {
  if (status === "PENDING_PAYMENT") return 3_000;
  if (["PAID", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"].includes(status)) {
    return 30_000;
  }
  return null;
}

export default function GuestOrderTrackingPage() {
  const { removePurchasedItems } = useCart();
  const removePurchasedItemsRef = useRef(removePurchasedItems);
  const cartAdjustedRef = useRef(false);
  const accessTokenRef = useRef(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentAction, setPaymentAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    removePurchasedItemsRef.current = removePurchasedItems;
  }, [removePurchasedItems]);

  const loadOrder = useCallback(async (notifyError = false) => {
    const accessToken = accessTokenRef.current
      || captureGuestAccessTokenFromHash()
      || readGuestOrderAccessToken();
    accessTokenRef.current = accessToken;

    if (!accessToken) {
      setErrorMessage("El enlace de seguimiento no es válido o ya no está disponible.");
      setLoading(false);
      return null;
    }

    try {
      const data = await getGuestOnlineOrderRequest(accessToken);
      saveGuestOrderAccessToken(data.id, accessToken);
      setOrder(data);
      setErrorMessage("");
      if (isOnlineOrderPaid(data.status) && !cartAdjustedRef.current) {
        cartAdjustedRef.current = true;
        removePurchasedItemsRef.current(data.items || []);
      }
      return data;
    } catch (error) {
      const message = getApiError(error, "Pedido no encontrado o enlace inválido");
      setErrorMessage(message);
      if (notifyError) toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer;

    const refresh = async (firstLoad = false) => {
      const data = await loadOrder(firstLoad);
      if (!active || !data) return;
      const delay = nextRefreshDelay(data.status);
      if (delay) refreshTimer = window.setTimeout(() => refresh(false), delay);
    };

    refresh(true);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
    };
  }, [loadOrder]);

  const handlePaymentAction = async (action) => {
    if (paymentAction || !order) return;
    setPaymentAction(action);
    let redirectStarted = false;

    try {
      const payment = action === "continue"
        ? await continueGuestOnlineOrderPaymentRequest()
        : await retryGuestOnlineOrderPaymentRequest(accessTokenRef.current);
      if (payment.guestAccessToken) {
        accessTokenRef.current = payment.guestAccessToken;
        saveGuestOrderAccessToken(payment.orderId, payment.guestAccessToken);
      }
      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (error) {
      toast.error(getApiError(error, "No se pudo abrir el pago con Webpay"));
      await loadOrder(false);
    } finally {
      if (!redirectStarted) setPaymentAction("");
    }
  };

  const orderStatus = order ? getOnlineOrderStatus(order.status) : null;
  const paymentStatus = order?.payment ? getOnlinePaymentStatus(order.payment.status) : null;
  const isPaid = isOnlineOrderPaid(order?.status);
  const deliveryType = order ? getOnlineOrderDeliveryType(order.deliveryType) : null;

  return (
    <main className="mx-auto grid min-h-120 w-full max-w-190 place-items-center px-6 py-10 max-[720px]:px-3.5">
      <LoadingOverlay active={loading} />

      {!loading && order ? (
        <section className="grid min-w-0 w-full justify-items-center gap-5 rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm max-[620px]:p-5">
          {resultIcon(order.status)}
          <div>
            <h1 className="m-0 text-2xl font-bold text-ink-950">
              {isPaid && order.status === "PAID" ? "Pago realizado correctamente" : orderStatus.label}
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

          <section className="purchase-receipt grid min-w-0 w-full gap-5 rounded-[5px] border border-slate-200 bg-white p-5 text-left">
            <header className="border-b border-slate-200 pb-4 text-center">
              <strong className="block text-lg text-ink-950">FERRETERIA FYF</strong>
              <h2 className="mt-1 mb-0 text-xl font-bold text-ink-950">
                {isPaid ? "Comprobante de compra" : "Seguimiento de pedido"}
              </h2>
              <span className="mt-1 block text-xs text-slate-500">{orderStatus.label}</span>
            </header>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-[520px]:grid-cols-1">
              <div><dt className="text-xs font-bold text-slate-500">Folio</dt><dd className="mt-1 ml-0 font-mono font-bold text-ink-950">{formatOnlineOrderFolio(order.id)}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Fecha</dt><dd className="mt-1 ml-0 text-ink-950">{formatDate(order.paidAt || order.createdAt, { dateStyle: "long", timeStyle: "short" })}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Comprador</dt><dd className="mt-1 ml-0 text-ink-950">{order.buyerName || "Invitado"}</dd></div>
              <div><dt className="text-xs font-bold text-slate-500">Modalidad</dt><dd className="mt-1 ml-0 text-ink-950">{deliveryType.label}</dd></div>
              {order.deliveryType === "DELIVERY" && (
                <>
                  <div><dt className="text-xs font-bold text-slate-500">Dirección de entrega</dt><dd className="mt-1 ml-0 text-ink-950">{order.deliveryAddress}</dd></div>
                  <div><dt className="text-xs font-bold text-slate-500">Comuna</dt><dd className="mt-1 ml-0 text-ink-950">{order.deliveryCommune}</dd></div>
                </>
              )}
            </dl>

            <div className="w-full max-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th>Producto</th><th className="text-right">Cantidad</th><th className="text-right">Precio unitario</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>
                  {(order.items || []).map((item) => (
                    <tr key={`${item.productId}-${item.productName}`}>
                      <td>{item.productName}</td>
                      <td className="text-right font-mono">{item.quantity}</td>
                      <td className="text-right font-mono">{formatClp(item.unitPrice)}</td>
                      <td className="text-right font-mono font-bold">{formatClp(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-4 border-t border-slate-200 pt-4">
              <span className="font-bold text-slate-600">Total</span>
              <strong className="font-mono text-2xl text-ink-950">{formatClp(order.total)}</strong>
            </div>
          </section>

          <DeliveryProofViewer
            order={order}
            requestProof={() => getGuestOnlineOrderDeliveryProofRequest(accessTokenRef.current)}
          />

          {order.buyerEmail && (
            <p className="m-0 flex w-full items-start gap-2 rounded-[5px] bg-blue-50 px-4 py-3 text-left text-xs leading-5 text-blue-900">
              <Mail className="mt-0.5 shrink-0" size={17} />
              Enviamos el seguimiento y las actualizaciones de este pedido a <strong>{order.buyerEmail}</strong>.
            </p>
          )}

          {order.status === "PAYMENT_REVIEW" && (
            <p className="m-0 w-full max-w-125 rounded-[5px] bg-rust-50 px-3 py-3 text-xs leading-5 text-rust-700">
              Tu pago fue autorizado, pero requiere revisión. No vuelvas a pagar este pedido.
            </p>
          )}

          <div className="flex w-full flex-wrap justify-center gap-3 max-[520px]:flex-col">
            {order.canContinuePayment && (
              <button type="button" onClick={() => handlePaymentAction("continue")} disabled={Boolean(paymentAction)}>
                {paymentAction === "continue" ? <RefreshCw className="animate-spin" size={17} /> : <CreditCard size={17} />}
                {paymentAction === "continue" ? "Abriendo..." : "Continuar pago"}
              </button>
            )}
            {order.canRetryPayment && (
              <button type="button" onClick={() => handlePaymentAction("retry")} disabled={Boolean(paymentAction)}>
                {paymentAction === "retry" ? <RefreshCw className="animate-spin" size={17} /> : <CreditCard size={17} />}
                {paymentAction === "retry" ? "Reintentando..." : "Reintentar pago"}
              </button>
            )}
            <DownloadReceiptButton
              order={order}
              requestReceipt={() => getGuestOnlineOrderReceiptRequest(accessTokenRef.current)}
            />
            <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[5px] border border-slate-300 px-4 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100" to="/cart">
              <ShoppingCart size={17} /> Volver al carrito
            </Link>
          </div>

          {isPaid && (
            <div className="grid w-full max-w-125 gap-2 border-t border-slate-200 pt-5 text-center">
              <span className="text-xs leading-5 text-slate-500">¿Quieres guardar tus datos para compras futuras?</span>
              <Link className="inline-flex min-h-10 items-center justify-center gap-2 font-bold text-rust-600" to="/register">
                <UserPlus size={17} /> Crear una cuenta opcional
              </Link>
            </div>
          )}
        </section>
      ) : !loading && (
        <section className="grid min-w-0 w-full justify-items-center gap-5 rounded-lg border border-slate-200 bg-white p-7 text-center shadow-sm max-[620px]:p-5">
          <AlertTriangle className="text-rust-600" size={52} />
          <div>
            <h1 className="m-0 text-2xl font-bold text-ink-950">Seguimiento no disponible</h1>
            <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">
              {errorMessage || "El enlace no es válido, expiró o no corresponde a un pedido invitado."}
            </p>
          </div>
          <Link className="font-bold text-rust-600" to="/catalog">Volver al catálogo</Link>
        </section>
      )}
    </main>
  );
}

import { ArrowLeft, CreditCard, RefreshCw, ShieldCheck, ShoppingCart, Store, Truck, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { getApiError, isApiConnectionError } from "../api/httpClient.js";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import OrderAmounts from "../components/orders/OrderAmounts.jsx";
import DeliveryConditions from "../components/DeliveryConditions.jsx";
import DeliveryQuoteRequestForm from "../components/DeliveryQuoteRequestForm.jsx";
import { quotePinRequest, quotePinVerify } from "../services/deliveryQuotes.service.js";
import { receiveCheckoutQuote, acceptCheckoutQuote, checkoutQuoteFailure } from "../helpers/checkoutQuote.js";
import { markDirectPurchaseOrder, readDirectPurchaseItem } from "../helpers/directPurchase.js";
import { readCheckoutIntent, resolveCheckoutItems } from "../helpers/checkoutIntent.js";
import { formatClp } from "../helpers/formatters.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import { getOnlineAvailableStock, submitWebpayForm } from "../helpers/onlineOrders.js";
import { readGuestOrderAccessToken, saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import { getCatalogProductsByIdsRequest } from "../services/catalog.service.js";
import {
  continueOnlineOrderPaymentRequest,
  continueGuestOnlineOrderPaymentRequest,
  createGuestOnlineOrderCheckoutRequest,
  createOnlineOrderCheckoutRequest,
  getGuestPendingOrderRequest,
  getMyOnlineOrdersRequest,
  quoteOnlineOrderRequest,
} from "../services/onlineOrders.service.js";
import {
  requestClientEmailVerification,
  requestGuestEmailVerification,
  verifyClientEmail,
  verifyGuestEmail,
} from "../services/emailVerification.service.js";
import { getProductPromotionPricing } from "../helpers/promotionPricing.js";

function getPrimaryImage(product) {
  return product?.images?.find((image) => image.isPrimary) || product?.images?.[0] || null;
}

function createCheckoutKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function CheckoutPage() {
  const location = useLocation();
  const { isAuthenticated, user, replaceSession } = useAuth();
  const { items } = useCart();
  const directPurchase = useMemo(
    () => readDirectPurchaseItem(location.state),
    [location.state],
  );
  const checkoutItems = useMemo(
    () => resolveCheckoutItems(location.state, items),
    [location.state, items],
  );
  const checkoutIntent = useMemo(() => readCheckoutIntent(location.state), [location.state]);
  const isClient = isAuthenticated && user?.role === "CLIENT";
  const [checkoutKey] = useState(createCheckoutKey);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrderLoading, setPendingOrderLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [pendingOrder, setPendingOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [continuingPayment, setContinuingPayment] = useState(false);
  const [deliveryType, setDeliveryType] = useState("PICKUP");
  const [quoteState, setQuoteState] = useState({ key: "", data: null, error: "" });
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [guestData, setGuestData] = useState({
    name: "",
    email: "",
    emailConfirmation: "",
    phone: "",
  });
  const [clientEmailVerified, setClientEmailVerified] = useState(
    Boolean(user?.emailVerifiedAt || user?.emailVerified),
  );
  const [guestEmailVerification, setGuestEmailVerification] = useState(null);
  const submittingRef = useRef(false);
  const checkoutProductIds = useMemo(
    () => checkoutItems.map((item) => item.product.id),
    [checkoutItems],
  );

  const loadAvailability = useCallback(async (notifyError = false) => {
    try {
      const products = await getCatalogProductsByIdsRequest(checkoutProductIds);
      setCatalogProducts(products);
      setCatalogError("");
      return true;
    } catch (error) {
      const message = getApiError(error, "No se pudo actualizar la disponibilidad del carrito");
      setCatalogError(message);
      if (notifyError) toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [checkoutProductIds]);

  const loadPendingOrder = useCallback(async (notifyError = false) => {
    try {
      if (isClient) {
        const orders = await getMyOnlineOrdersRequest();
        setPendingOrder(orders.find((order) => order.status === "PENDING_PAYMENT") || null);
      } else {
        setPendingOrder(await getGuestPendingOrderRequest());
      }
    } catch (error) {
      if (notifyError) toast.error(getApiError(error, "No se pudo consultar si existe un pago pendiente"));
    } finally {
      setPendingOrderLoading(false);
    }
  }, [isClient]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailability(true);
    loadPendingOrder(true);
    const refreshCheckout = () => {
      loadAvailability(false);
      loadPendingOrder(false);
      setQuoteRefresh(value => value + 1);
    };
    const refreshTimer = window.setInterval(refreshCheckout, 30_000);
    window.addEventListener("focus", refreshCheckout);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCheckout);
    };
  }, [loadAvailability, loadPendingOrder]);

  const liveProductById = useMemo(
    () => new Map(catalogProducts.map((product) => [Number(product.id), product])),
    [catalogProducts],
  );

  const rows = checkoutItems.map((item) => {
    const liveProduct = liveProductById.get(Number(item.product.id));
    const product = liveProduct || item.product;
    const quantity = Number(item.quantity || 0);
    const availableStock = liveProduct ? getOnlineAvailableStock(liveProduct) : 0;
    const validQuantity = Number.isInteger(quantity) && quantity > 0;
    const isAvailable = Boolean(liveProduct) && !liveProduct.inStoreOnly && availableStock > 0;
    const hasEnoughStock = validQuantity && quantity <= availableStock;

    const pricing = getProductPromotionPricing(product, quantity);
    return {
      product,
      quantity,
      availableStock,
      isAvailable,
      isValid: isAvailable && hasEnoughStock,
      pricing,
      subtotal: pricing.finalSubtotal,
    };
  });

  const quoteItemsKey = JSON.stringify(rows.map(row => ({ productId: Number(row.product.id), quantity: row.quantity })));
  const quoteKey = JSON.stringify([quoteItemsKey, deliveryType, rows.map(row => [row.product.price, row.subtotal]), quoteRefresh]);
  const quote = quoteState.key === quoteKey ? quoteState.data : null;
  const quoteError = quoteState.key === quoteKey ? quoteState.error : "";
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const selectedItems = JSON.parse(quoteItemsKey);
      if (!selectedItems.length) return;
      quoteOnlineOrderRequest({ items: selectedItems, deliveryType: "PICKUP" })
        .then(data => { if (active) setQuoteState(previous => receiveCheckoutQuote(previous, quoteKey, data)); })
        .catch(error => { if (active) setQuoteState(previous => ({ ...previous, key: quoteKey, data: null, ...checkoutQuoteFailure(error, { connection: isApiConnectionError(error), message: getApiError(error, "No se pudo calcular el pedido. Revisa los productos y cantidades.") }) })); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [quoteItemsKey, deliveryType, quoteKey]);
  const hasAvailabilityIssues = Boolean(catalogError) || rows.some((row) => !row.isValid);
  const normalizedGuestEmail = guestData.email.trim().toLowerCase();
  const guestDataIsValid = isClient || (
    guestData.name.trim().length >= 3
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuestEmail)
    && normalizedGuestEmail === guestData.emailConfirmation.trim().toLowerCase()
    && /^[+0-9()\s-]{7,20}$/.test(guestData.phone.trim())
  );
  const guestEmailFieldsAreValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuestEmail)
    && normalizedGuestEmail === guestData.emailConfirmation.trim().toLowerCase();
  const emailVerifiedForCheckout = isClient
    ? clientEmailVerified
    : Boolean(
      guestEmailVerification?.verified
      && guestEmailVerification.email === normalizedGuestEmail
      && guestEmailVerification.purpose === deliveryType,
    );
  const canStartPayment = !loading
    && deliveryType === "PICKUP"
    && !pendingOrderLoading
    && !submitting
    && !pendingOrder
    && rows.length > 0
    && !hasAvailabilityIssues
    && guestDataIsValid
    && emailVerifiedForCheckout
    && Boolean(quote)
    && !quoteState.needsAcceptance;
  const pendingGuestAccessToken = !isClient && pendingOrder
    ? readGuestOrderAccessToken(pendingOrder.id)
    : null;

  const handleContinuePayment = async () => {
    if (!pendingOrder?.canContinuePayment || continuingPayment) return;

    setContinuingPayment(true);
    let redirectStarted = false;
    try {
      const payment = isClient
        ? await continueOnlineOrderPaymentRequest(pendingOrder.id)
        : await continueGuestOnlineOrderPaymentRequest();
      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (error) {
      toast.error(getApiError(error, "No se pudo continuar el pago pendiente"));
      await loadPendingOrder(false);
    } finally {
      if (!redirectStarted) setContinuingPayment(false);
    }
  };

  const handlePayment = async () => {
    if (deliveryType === "DELIVERY") {
      toast.error("El despacho requiere una cotización manual aprobada. Por ahora puedes comprar con retiro en tienda.");
      return;
    }
    if (!canStartPayment || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    let redirectStarted = false;

    try {
      const checkoutData = {
        checkoutKey,
        quoteFingerprint: quote.quoteFingerprint,
        items: rows.map((row) => ({
          productId: Number(row.product.id),
          quantity: row.quantity,
        })),
        deliveryType,
        saveDeliveryAddress: false,
      };
      const payment = isClient
        ? await createOnlineOrderCheckoutRequest(checkoutData)
        : await createGuestOnlineOrderCheckoutRequest({
          ...checkoutData,
          guestName: guestData.name,
          guestEmail: guestData.email,
          guestEmailConfirmation: guestData.emailConfirmation,
          guestPhone: guestData.phone,
          emailVerificationChallengeId: guestEmailVerification?.challengeId,
          saveDeliveryAddress: false,
        });

      // Both temporary origins must leave the persistent CLIENT cart untouched.
      if (directPurchase || checkoutIntent?.source === "DIRECT" || (checkoutIntent && isClient)) {
        markDirectPurchaseOrder(payment.orderId);
      }

      if (!isClient && payment.guestAccessToken) {
        saveGuestOrderAccessToken(payment.orderId, payment.guestAccessToken);
      }

      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (error) {
      toast.error(getApiError(error, "No se pudo iniciar el pago con Webpay"));
      if (error?.response?.data?.code === "QUOTE_CHANGED") {
        setQuoteState(previous => ({ ...previous, data: null, needsAcceptance: true }));
      }
      setQuoteRefresh(value => value + 1);
      await Promise.all([loadAvailability(false), loadPendingOrder(false)]);
    } finally {
      if (!redirectStarted) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-300 gap-5 px-6 py-8 max-[720px]:px-3.5 max-[720px]:py-6">
      <LoadingOverlay active={loading} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold text-ink-950">Finalizar compra</h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">Revisa tu pedido antes de continuar al pago seguro.</p>
        </div>
        <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-ink-700 no-underline hover:text-rust-600" to="/cart">
          <ArrowLeft size={17} /> Volver al carrito
        </Link>
      </div>

      {!pendingOrderLoading && pendingOrder && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rust-200 bg-rust-50 px-5 py-4">
          <div className="grid gap-1">
            <strong className="text-sm text-rust-800">Tienes un pago pendiente</strong>
            <span className="text-xs leading-5 text-rust-700">
              Finaliza o revisa tu compra anterior antes de iniciar un nuevo pago.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-[520px]:w-full max-[520px]:*:flex-1">
            {pendingOrder.canContinuePayment && (
              <button type="button" onClick={handleContinuePayment} disabled={continuingPayment}>
                {continuingPayment ? <RefreshCw className="animate-spin" size={17} /> : <CreditCard size={17} />}
                {continuingPayment ? "Abriendo..." : "Continuar pago"}
              </button>
            )}
            {(isClient || pendingGuestAccessToken) && (
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-slate-300 bg-white px-4 text-sm font-bold text-ink-700 no-underline hover:bg-slate-100"
                to={isClient
                  ? `/orders#order-${pendingOrder.id}`
                  : `/order-tracking#token=${encodeURIComponent(pendingGuestAccessToken)}`}
              >
                Ver pedido
              </Link>
            )}
          </div>
        </section>
      )}

      {checkoutItems.length === 0 ? (
        <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="grid justify-items-center gap-3">
            <ShoppingCart className="text-slate-400" size={45} />
            <strong className="text-lg text-ink-950">{location.state?.checkoutIntent ? "La selección de compra venció. Vuelve a seleccionar tus productos." : "Tu carrito está vacío"}</strong>
            <Link className="font-bold text-rust-600" to="/catalog">Volver al catálogo</Link>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5 max-[900px]:grid-cols-1">
          <div className="grid gap-4">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 px-5 py-4">
                <h2 className="m-0 text-base font-bold text-ink-950">Productos del pedido</h2>
              </header>
              <div className="grid divide-y divide-slate-200">
                {rows.map((row) => {
                  const image = getPrimaryImage(row.product);

                  return (
                    <article className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 max-[620px]:grid-cols-[60px_1fr] max-[620px]:px-4" key={row.product.id}>
                      <div className="grid size-18 place-items-center overflow-hidden rounded-[5px] bg-slate-100 max-[620px]:size-15">
                        {image ? (
                          <img className="h-full w-full object-cover" src={image.imageUrl} alt={row.product.name} />
                        ) : (
                          <ShoppingCart className="text-slate-400" size={23} />
                        )}
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <strong className="truncate text-sm text-ink-950">{row.product.name}</strong>
                        <span className="text-xs text-slate-500">
                          {formatClp(row.pricing.baseUnitPrice)} × {formatQuantityWithUnit(row.quantity, row.product.unitMeasure)}
                        </span>
                        {row.pricing.promotion && <span className="text-xs font-bold text-rust-700">{row.pricing.promotion.type === "BUY_2_PAY_1" ? `2x1 · ${row.pricing.freeUnits} ${row.pricing.freeUnits === 1 ? "unidad" : "unidades"} sin costo` : `${row.pricing.promotion.label} · ahorras ${formatClp(row.pricing.discountAmount)}`}</span>}
                        {row.isValid ? (
                          <span className="text-xs font-bold text-positive-600">{formatQuantityWithUnit(row.availableStock, row.product.unitMeasure)} disponibles</span>
                        ) : (
                          <span className="text-xs font-bold text-critical-600">
                            {row.isAvailable
                              ? `Tienes ${row.quantity} en el carrito y ahora hay ${row.availableStock} disponibles.`
                              : "Este producto ya no está disponible."}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3 max-[620px]:col-span-2 max-[620px]:w-full max-[620px]:justify-end">
                        <div className="grid justify-items-end gap-0.5">
                          {row.pricing.discountAmount > 0 && <span className="font-mono text-xs text-slate-500 line-through">{formatClp(row.pricing.baseSubtotal)}</span>}
                          <strong className="font-mono text-sm text-ink-950">
                          {formatClp(row.subtotal)}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
                Para cambiar cantidades o eliminar productos, vuelve al carrito antes de pagar.
              </footer>
            </section>

            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="m-0 flex items-center gap-2 text-base font-bold text-ink-950">
                <UserRound size={18} /> {isClient ? "Datos del cliente" : "Datos del comprador"}
              </h2>
              {isClient ? (
                <dl className="grid grid-cols-2 gap-3 text-sm max-[620px]:grid-cols-1">
                  <div className="rounded-[5px] bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Nombre</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{user.names} {user.surnames}</dd></div>
                  <div className="rounded-[5px] bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">RUT</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{user.rut}</dd></div>
                  <div className="rounded-[5px] bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Correo</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{user.correo}</dd></div>
                  <div className="rounded-[5px] bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Teléfono</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{user.phone || "No registrado"}</dd></div>
                </dl>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  <label className="col-span-2 grid gap-1.5 text-xs font-bold text-slate-600 max-[620px]:col-span-1">
                    Nombre y apellido
                    <input
                      autoComplete="name"
                      maxLength="240"
                      required
                      value={guestData.name}
                      onChange={(event) => setGuestData((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nombre de quien realiza la compra"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                    Correo electrónico
                    <input
                      autoComplete="email"
                      maxLength="254"
                      required
                      type="email"
                      value={guestData.email}
                      onChange={(event) => setGuestData((current) => ({ ...current, email: event.target.value }))}
                      placeholder="correo@ejemplo.cl"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                    Confirmar correo
                    <input
                      autoComplete="email"
                      maxLength="254"
                      required
                      type="email"
                      value={guestData.emailConfirmation}
                      onChange={(event) => setGuestData((current) => ({ ...current, emailConfirmation: event.target.value }))}
                      placeholder="Repite tu correo"
                    />
                  </label>
                  <label className="col-span-2 grid gap-1.5 text-xs font-bold text-slate-600 max-[620px]:col-span-1">
                    Teléfono
                    <input
                      autoComplete="tel"
                      maxLength="20"
                      required
                      type="tel"
                      value={guestData.phone}
                      onChange={(event) => setGuestData((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="Ej: +56 9 1234 5678"
                    />
                  </label>
                  <p className="col-span-2 m-0 text-xs leading-5 text-slate-500 max-[620px]:col-span-1">
                    {deliveryType === "DELIVERY" ? "Usaremos este correo para verificar tu acceso a la solicitud. Consulta su estado manualmente." : "Usaremos este correo para enviarte el comprobante y las actualizaciones de tu pedido."}
                  </p>
                </div>
              )}
              {isClient && !clientEmailVerified && !pendingOrder && (
                <EmailVerificationPanel
                  key={`client-${user.correo}`}
                  email={user.correo}
                  requestCode={requestClientEmailVerification}
                  verifyCode={verifyClientEmail}
                  onVerified={(session) => {
                    replaceSession(session);
                    setClientEmailVerified(true);
                  }}
                  title="Verifica el correo de tu cuenta"
                  description="Solo debes hacerlo una vez antes de iniciar tu próxima compra."
                />
              )}
              {!isClient && !pendingOrder && (
                guestEmailFieldsAreValid ? (
                  <EmailVerificationPanel
                    key={`guest-${normalizedGuestEmail}-${deliveryType}`}
                    email={normalizedGuestEmail}
                    requestCode={() => deliveryType === "DELIVERY" ? quotePinRequest(normalizedGuestEmail) : requestGuestEmailVerification(normalizedGuestEmail)}
                    verifyCode={deliveryType === "DELIVERY" ? quotePinVerify : verifyGuestEmail}
                    verified={emailVerifiedForCheckout && guestEmailVerification?.purpose === deliveryType}
                    onVerified={(result) => setGuestEmailVerification({
                      challengeId: result.challengeId,
                      email: result.email,
                      verified: true,
                      purpose: deliveryType,
                    })}
                    title="Verifica el correo de esta compra"
                    description={deliveryType === "DELIVERY" ? "Confirma el correo para registrar tu solicitud, sin iniciar un pago." : "Debes confirmar el correo antes de iniciar Webpay."}
                  />
                ) : (
                  <p className="m-0 rounded-[5px] bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    Escribe y confirma el mismo correo para poder verificarlo.
                  </p>
                )
              )}
            </section>

            <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="m-0 flex items-center gap-2 text-base font-bold text-ink-950"><Truck size={18} /> ¿Cómo quieres recibir tu pedido?</h2>
                <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">La modalidad y los datos indicados quedarán asociados a este pedido.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className={`flex cursor-pointer items-start gap-3 rounded-[5px] border p-4 ${deliveryType === "PICKUP" ? "border-rust-500 bg-rust-50" : "border-slate-200 bg-white"}`}>
                  <input className="mt-1 size-4" type="radio" name="deliveryType" value="PICKUP" checked={deliveryType === "PICKUP"} onChange={() => setDeliveryType("PICKUP")} />
                  <span className="grid gap-1"><strong className="flex items-center gap-2 text-sm text-ink-950"><Store size={17} /> Retiro en tienda</strong><span className="text-xs leading-5 text-slate-500">Sin costo.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-[5px] border p-4 ${deliveryType === "DELIVERY" ? "border-rust-500 bg-rust-50" : "border-slate-200 bg-white"}`}>
                  <input className="mt-1 size-4" type="radio" name="deliveryType" value="DELIVERY" checked={deliveryType === "DELIVERY"} onChange={() => setDeliveryType("DELIVERY")} />
                  <span className="grid gap-1"><strong className="flex items-center gap-2 text-sm text-ink-950"><Truck size={17} /> Despacho a domicilio</strong><span className="text-xs leading-5 text-slate-500">Sujeto a ubicación y características del pedido.</span></span>
                </label>
              </div>

              {deliveryType === "DELIVERY" && (
                <div className="grid gap-3">
                  <DeliveryConditions />
                  <DeliveryQuoteRequestForm items={JSON.parse(quoteItemsKey)} isClient={isClient} user={user} guestData={guestData} verification={guestEmailVerification} verified={!hasAvailabilityIssues && guestDataIsValid && (isClient ? clientEmailVerified : emailVerifiedForCheckout && guestEmailVerification?.purpose === "DELIVERY")} />
                </div>
              )}
            </section>
          </div>

          <aside className="sticky top-22 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[900px]:static">
            <h2 className="m-0 text-lg font-bold text-ink-950">Resumen</h2>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-600">Entrega</span><strong className="text-right text-ink-950">{deliveryType === "DELIVERY" ? "Despacho a domicilio" : "Retiro en tienda"}</strong></div>
            {quote && deliveryType === "PICKUP" && <div aria-live="polite"><OrderAmounts order={quote} /></div>}
            {deliveryType === "DELIVERY" && <div className="grid gap-3 text-sm" aria-live="polite">
              <div className="flex flex-wrap justify-between gap-2"><span>Subtotal neto de productos</span><strong>{formatClp(rows.reduce((sum, row) => sum + row.subtotal, 0))}</strong></div>
              <div className="flex justify-between gap-2 font-semibold"><span>Despacho</span><span>Por cotizar</span></div>
              <p className="m-0 text-xs leading-5 text-slate-500">Este monto corresponde solo a productos. FYF debe aprobar el flete antes de que revises el total final y puedas pagar.</p>
              <button type="button" onClick={() => setDeliveryType("PICKUP")}>Seleccionar retiro en tienda</button>
            </div>}
            {deliveryType === "PICKUP" && quote && quoteState.needsAcceptance && <div role="status" className="grid gap-3 rounded-[5px] border border-rust-200 bg-rust-50 p-3 text-sm text-ink-950"><p className="m-0">El resumen cambió. Revisa los productos, condiciones e importes y acepta el resumen actualizado antes de iniciar el pago.</p><button type="button" onClick={() => setQuoteState(previous => acceptCheckoutQuote(previous, quoteKey, quote.commercialSignature))}>Aceptar resumen actualizado</button></div>}
            {quoteError && !(deliveryType === "DELIVERY" && quoteState.errorKind === "MANUAL_DELIVERY") && <div role="alert" className="checkout-quote-alert grid min-w-0 gap-4 rounded-[5px] p-4 text-sm">
              <p className="m-0 break-words font-semibold leading-6">{quoteError}</p>
              {quoteState.errorKind === "RETRY" && <button className="min-h-11 w-full max-w-full justify-self-center px-5 sm:w-auto sm:min-w-56" type="button" onClick={() => setQuoteRefresh(v => v + 1)}>Reintentar cálculo</button>}
              {quoteState.errorKind === "PRODUCTS" && <Link className="font-bold underline" to="/cart">Revisar productos y cantidades en el carrito</Link>}
            </div>}
            {deliveryType === "PICKUP" && !quote && !quoteError && <p role="status" className="text-sm text-slate-500">Actualizando cotización...</p>}

            {deliveryType === "PICKUP" && <div className="grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <strong className="flex items-center gap-2 text-ink-950"><CreditCard size={17} /> Webpay Plus</strong>
              <span>Para esta compra con retiro, serás redirigido al sitio seguro de Webpay.</span>
              <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-positive-600" size={15} /> Los precios, el total y el stock se validarán nuevamente en el servidor.</span>
            </div>}

            {hasAvailabilityIssues && !loading && (
              <p className="m-0 rounded-[5px] bg-critical-50 px-3 py-3 text-xs leading-5 text-critical-600">
                {catalogError || "Uno o más productos ya no están disponibles para compra online. Ajusta el carrito antes de continuar."}
              </p>
            )}

            {deliveryType === "PICKUP" && <button type="button" onClick={handlePayment} disabled={!canStartPayment}>
              <CreditCard size={18} />
              {submitting ? "Iniciando Webpay..." : "Pagar con Webpay Plus"}
            </button>}
            <Link className="text-center text-sm font-bold text-rust-600" to="/cart">Modificar carrito</Link>
          </aside>
        </div>
      )}
    </main>
  );
}

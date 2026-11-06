import { CreditCard, RefreshCw, ShieldCheck, ShoppingCart, Store, Truck, UserRound } from "lucide-react";
import CompactBackLink from "../components/CompactBackLink.jsx";
import AppModal from "../components/AppModal.jsx";
import { variantLabel } from "../helpers/productVariants.js";
import { createId } from "../helpers/createId.js";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType } from "react-router-dom";
import { toast } from "sonner";
import { getApiError, isApiConnectionError } from "../api/httpClient.js";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import OrderAmounts from "../components/orders/OrderAmounts.jsx";
import DeliveryConditions from "../components/DeliveryConditions.jsx";
import { DELIVERY_COMMUNE } from "../helpers/delivery.js";
import { receiveCheckoutQuote, acceptCheckoutQuote, checkoutQuoteFailure, createLatestCheckoutRequest } from "../helpers/checkoutQuote.js";
import { EMPTY_CHECKOUT_DESTINATION, mergeSavedCheckoutDestination, savedCheckoutDestination, savedCheckoutAddressIsUsable } from "../helpers/checkoutDestination.js";
import CheckoutDraftContext from "../context/CheckoutDraftContext.js";
import { markDirectPurchaseOrder, readDirectPurchaseItem } from "../helpers/directPurchase.js";
import { readCheckoutIntent, resolveCheckoutItems, checkoutReturn } from "../helpers/checkoutIntent.js";
import { formatClp } from "../helpers/formatters.js";
import { formatQuantityWithUnit } from "../helpers/units.js";
import { getOnlineAvailableStock, submitWebpayForm } from "../helpers/onlineOrders.js";
import { getOrCreateGuestSessionId, readGuestOrderAccessToken, saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import { guestCheckoutEmailIsVerified } from "../helpers/checkoutEmailVerification.js";
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
  getClientDeliveryAddressRequest,
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
  return createId();
}

export default function CheckoutPage() {
  const draftStore = useContext(CheckoutDraftContext);
  return <CheckoutForm key={draftStore.owner} draftStore={draftStore} />;
}

function CheckoutForm({ draftStore }) {
  const location = useLocation();
  const navigationType = useNavigationType();
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
  const back = checkoutReturn(location.state);
  const checkoutScope = JSON.stringify([checkoutIntent?.source || (directPurchase ? "DIRECT" : "CART"), checkoutIntent?.checkoutKey || checkoutIntent?.createdAt, checkoutItems.map(item => [Number(item.product.id), item.quantity])]);
  const [initialDraft] = useState(() => location.state?.resumeCheckout || navigationType === "POP" ? draftStore.read(checkoutScope) : null);
  const [checkoutKey] = useState(() => initialDraft?.checkoutKey || checkoutIntent?.checkoutKey || createCheckoutKey());
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrderLoading, setPendingOrderLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [pendingOrder, setPendingOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [continuingPayment, setContinuingPayment] = useState(false);
  const [deliveryType, setDeliveryType] = useState(initialDraft?.deliveryType || "PICKUP");
  const [destination,setDestination]=useState(initialDraft?.destination || EMPTY_CHECKOUT_DESTINATION);
  const destinationTouched = useRef(initialDraft?.touched || {});
  const [savedAddressNote, setSavedAddressNote] = useState("");
  const [savedAddress, setSavedAddress] = useState(null);
  const [savedAddressLoading, setSavedAddressLoading] = useState(isClient);
  const [addressMode, setAddressMode] = useState(initialDraft?.addressMode || "AUTO");
  const addressModeRef = useRef(initialDraft?.addressMode || "AUTO");
  const alternativeDestination = useRef(initialDraft?.alternativeDestination || null);
  const recipientInputRef = useRef(null);
  const anotherAddressButtonRef = useRef(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [confirmAddressReplacement, setConfirmAddressReplacement] = useState(false);
  const destinationField=key=>({value:destination[key],onChange:e=>{addressModeRef.current="ALTERNATIVE";setAddressMode("ALTERNATIVE");destinationTouched.current[key]=true;setDestination(v=>({...v,[key]:e.target.value}));if(savedAddress)setSaveAddress(false);}});
  const useAnotherAddress = () => {
    destinationTouched.current = Object.fromEntries(Object.keys(EMPTY_CHECKOUT_DESTINATION).map(key => [key, true]));
    addressModeRef.current = "ALTERNATIVE"; setAddressMode("ALTERNATIVE");
    setDestination({ ...(alternativeDestination.current || EMPTY_CHECKOUT_DESTINATION) }); setSaveAddress(false); setSavedAddressNote("");
    requestAnimationFrame(() => recipientInputRef.current?.focus());
  };
  const useSavedAddress = () => {
    if (!savedCheckoutAddressIsUsable(savedAddress)) return;
    if (addressModeRef.current !== "SAVED") alternativeDestination.current = { ...destination };
    const saved = savedCheckoutDestination(savedAddress);
    destinationTouched.current = Object.fromEntries(Object.keys(EMPTY_CHECKOUT_DESTINATION).map(key => [key, true]));
    addressModeRef.current = "SAVED"; setAddressMode("SAVED");
    setDestination({ ...EMPTY_CHECKOUT_DESTINATION, ...saved.values }); setSaveAddress(false); setSavedAddressNote(saved.note);
    requestAnimationFrame(() => anotherAddressButtonRef.current?.focus());
  };
  const usingSavedAddress = isClient && addressMode === "SAVED" && savedCheckoutAddressIsUsable(savedAddress);
  const loadingSavedAddress = isClient && addressMode === "AUTO" && savedAddressLoading;
  const destinationValid=deliveryType==="PICKUP"||(destination.deliveryRecipientName.trim().length>0&&/^[+0-9()\s-]{7,20}$/.test(destination.deliveryPhone)&&destination.deliveryAddress.trim().length>0);
  const [quoteState, setQuoteState] = useState({ key: "", data: null, error: "", acceptedSignature: initialDraft?.acceptedSignature || null, requireAcceptance: Boolean(initialDraft?.requireAcceptance) });
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [guestData, setGuestData] = useState(initialDraft?.guestData || {
    name: "",
    email: "",
    emailConfirmation: "",
    phone: "",
  });
  const clientEmailVerified = Boolean(user?.emailVerifiedAt || user?.emailVerified);
  const [guestEmailVerification, setGuestEmailVerification] = useState(initialDraft?.guestEmailVerification || null);
  const submittingRef = useRef(false);
  const refreshingRef = useRef(false);
  const [availabilityRequests] = useState(createLatestCheckoutRequest);
  const [pendingRequests] = useState(createLatestCheckoutRequest);
  const [quoteRequests] = useState(createLatestCheckoutRequest);
  const checkoutProductIds = useMemo(
    () => checkoutItems.map((item) => item.product.id),
    [checkoutItems],
  );

  useEffect(() => {
    draftStore.write(checkoutScope, { checkoutKey, deliveryType, destination, addressMode, alternativeDestination: alternativeDestination.current, touched: destinationTouched.current,
      guestData, guestEmailVerification, acceptedSignature: quoteState.acceptedSignature, requireAcceptance: quoteState.requireAcceptance });
  }, [draftStore, checkoutScope, checkoutKey, deliveryType, destination, addressMode, guestData, guestEmailVerification, quoteState.acceptedSignature, quoteState.requireAcceptance]);

  useEffect(() => {
    if (isClient || !guestEmailVerification) return undefined;
    const timer = window.setTimeout(() => setGuestEmailVerification(null), Math.max(0, new Date(guestEmailVerification.expiresAt).getTime() - Date.now()));
    const sessionChanged = () => {
      if (guestEmailVerification.sessionId !== getOrCreateGuestSessionId()) setGuestEmailVerification(null);
    };
    window.addEventListener("storage", sessionChanged);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sessionChanged); };
  }, [isClient, guestEmailVerification]);

  useEffect(() => {
    if (!isClient) return undefined;
    const controller = new AbortController();
    getClientDeliveryAddressRequest({ signal: controller.signal }).then(saved => {
      if (controller.signal.aborted) return;
      setSavedAddress(saved);
      setSavedAddressLoading(false);
      const usable = savedCheckoutAddressIsUsable(saved);
      const useDefault = usable && (addressModeRef.current === "SAVED" || addressModeRef.current === "AUTO" && !Object.values(destinationTouched.current).some(Boolean));
      addressModeRef.current = useDefault ? "SAVED" : "ALTERNATIVE"; setAddressMode(addressModeRef.current);
      setDestination(current => useDefault ? { ...EMPTY_CHECKOUT_DESTINATION, ...savedCheckoutDestination(saved).values } : mergeSavedCheckoutDestination(current, destinationTouched.current, saved));
      setSavedAddressNote(savedCheckoutDestination(saved).note);
    }).catch(() => {
      if (!controller.signal.aborted) { setSavedAddressLoading(false); setSavedAddressNote("No se pudo cargar la dirección guardada. Puedes ingresar los datos de entrega manualmente. Para guardar una dirección, vuelve a consultar Mi cuenta."); }
    });
    return () => controller.abort();
  }, [isClient, user?.id]);

  const loadAvailability = useCallback(async (notifyError = false) => {
    const isCurrent = availabilityRequests.begin();
    try {
      const products = await getCatalogProductsByIdsRequest(checkoutProductIds);
      if (!isCurrent()) return false;
      setCatalogProducts(products);
      setCatalogError("");
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const message = getApiError(error, "No se pudo actualizar la disponibilidad del carrito");
      setCatalogError(message);
      if (notifyError) toast.error(message);
      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [checkoutProductIds, availabilityRequests]);

  const loadPendingOrder = useCallback(async (notifyError = false) => {
    const isCurrent = pendingRequests.begin();
    try {
      if (isClient) {
        const orders = await getMyOnlineOrdersRequest();
        if (!isCurrent()) return;
        setPendingOrder(orders.find((order) => order.status === "PENDING_PAYMENT") || null);
      } else {
        const order = await getGuestPendingOrderRequest();
        if (isCurrent()) setPendingOrder(order);
      }
    } catch (error) {
      if (isCurrent() && notifyError) toast.error(getApiError(error, "No se pudo consultar si existe un pago pendiente"));
    } finally {
      if (isCurrent()) setPendingOrderLoading(false);
    }
  }, [isClient, pendingRequests]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailability(true);
    loadPendingOrder(true);
    const refreshCheckout = () => {
      if (refreshingRef.current || document.visibilityState === "hidden") return;
      refreshingRef.current = true;
      setQuoteRefresh(value => value + 1);
      Promise.all([loadAvailability(false), loadPendingOrder(false)]).finally(() => { refreshingRef.current = false; });
    };
    const refreshTimer = window.setInterval(refreshCheckout, 30_000);
    window.addEventListener("focus", refreshCheckout);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCheckout);
      availabilityRequests.invalidate();
      pendingRequests.invalidate();
    };
  }, [loadAvailability, loadPendingOrder, availabilityRequests, pendingRequests]);

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
  const quote = quoteState.key === quoteKey && !quoteState.error ? quoteState.data : null;
  const displayQuote = quoteState.data;
  const quotePending = rows.length > 0 && quoteState.key !== quoteKey;
  const quoteError = quoteState.key === quoteKey ? quoteState.error : "";
  useEffect(() => {
    const isCurrent = quoteRequests.begin();
    const controller = new AbortController();
    if (loading) return () => { quoteRequests.invalidate(); controller.abort(); };
    const timer = window.setTimeout(() => {
      const selectedItems = JSON.parse(quoteItemsKey);
      if (!selectedItems.length) return;
      quoteOnlineOrderRequest({ items: selectedItems, deliveryType, deliveryCommune:deliveryType==="DELIVERY"?DELIVERY_COMMUNE:null }, { signal: controller.signal })
        .then(data => { if (isCurrent()) setQuoteState(previous => receiveCheckoutQuote(previous, quoteKey, data, deliveryType)); })
        .catch(error => { if (isCurrent() && !controller.signal.aborted) setQuoteState(previous => ({ ...previous, key: quoteKey, ...checkoutQuoteFailure(error, { connection: isApiConnectionError(error), message: getApiError(error, "No se pudo calcular el pedido. Revisa los productos y cantidades.") }) })); });
    }, 180);
    return () => { quoteRequests.invalidate(); controller.abort(); window.clearTimeout(timer); };
  }, [quoteItemsKey, deliveryType, quoteKey, loading, quoteRequests]);
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
    : guestCheckoutEmailIsVerified(guestEmailVerification, { email: normalizedGuestEmail, checkoutKey, sessionId: getOrCreateGuestSessionId() });
  const canStartPayment = !loading
    && destinationValid
    && !pendingOrderLoading
    && !submitting
    && !pendingOrder
    && rows.length > 0
    && !hasAvailabilityIssues
    && guestDataIsValid
    && emailVerifiedForCheckout
    && Boolean(quote)
    && Boolean(quote.quoteFingerprint && quote.commercialSignature)
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
    if (!canStartPayment || submittingRef.current) return;
    if (!isClient && !guestCheckoutEmailIsVerified(guestEmailVerification, { email: normalizedGuestEmail, checkoutKey, sessionId: getOrCreateGuestSessionId() })) {
      setGuestEmailVerification(null);
      toast.error("La verificación del correo venció. Solicita un nuevo código antes de pagar.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setQuoteState(previous => acceptCheckoutQuote(previous, quoteKey, quote.commercialSignature));
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
        ...(deliveryType==="DELIVERY"?{...destination,deliveryCommune:DELIVERY_COMMUNE}:{}),
        saveDeliveryAddress: isClient && deliveryType === "DELIVERY" && saveAddress && addressMode === "ALTERNATIVE",
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
      if (!isClient && error?.response?.status === 403) setGuestEmailVerification(null);
      if (error?.response?.data?.code === "QUOTE_CHANGED") {
        setQuoteState(previous => ({ ...previous, requireAcceptance: true, needsAcceptance: true }));
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

      <div className="public-page-header">
        <div>
          <h1 className="m-0 text-2xl font-bold text-ink-950">Finalizar compra</h1>
          <p className="mt-1.5 mb-0 text-sm text-slate-500">Revisa tu pedido antes de continuar al pago seguro.</p>
        </div>
        <CompactBackLink {...back} />
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
                        {variantLabel(row.product)&&<span className="break-words text-xs text-slate-500">{variantLabel(row.product)}</span>}
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
                {checkoutIntent?.source === "DIRECT" || directPurchase ? "Para cambiar esta selección, vuelve al producto antes de pagar. Tu carrito habitual no se modifica." : "Para cambiar cantidades o eliminar productos, vuelve al carrito antes de pagar."}
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
                      onChange={(event) => {
                        if (event.target.value.trim().toLowerCase() !== normalizedGuestEmail) setGuestEmailVerification(null);
                        setGuestData((current) => ({ ...current, email: event.target.value }));
                      }}
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
                    Usaremos este correo para enviarte el comprobante y las actualizaciones de tu pedido.
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
                  }}
                  title="Verifica el correo de tu cuenta"
                  description="Solo debes hacerlo una vez antes de iniciar tu próxima compra."
                />
              )}
              {!isClient && !pendingOrder && (
                guestEmailFieldsAreValid ? (
                  <EmailVerificationPanel
                    key={`guest-${normalizedGuestEmail}-${guestEmailVerification?.challengeId || "pending"}`}
                    email={normalizedGuestEmail}
                    requestCode={() => requestGuestEmailVerification(normalizedGuestEmail)}
                    verifyCode={verifyGuestEmail}
                    verified={emailVerifiedForCheckout}
                    onVerified={(result, challenge) => setGuestEmailVerification({
                      challengeId: result.challengeId,
                      email: result.email,
                      verified: true,
                      purpose: "GUEST_CHECKOUT",
                      expiresAt: challenge.expiresAt,
                      checkoutKey,
                      sessionId: getOrCreateGuestSessionId(),
                    })}
                    title="Verifica el correo de esta compra"
                    description="Debes confirmar el correo antes de iniciar Webpay."
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
                  <span className="grid gap-1"><strong className="flex items-center gap-2 text-sm text-ink-950"><Truck size={17} /> Despacho local</strong><span className="text-xs leading-5 text-slate-500">Solo Santa Juana, Región del Biobío. Costo definitivo antes del pago.</span></span>
                </label>
              </div>

              {deliveryType === "DELIVERY" && (
                <div className="grid gap-3">
                  <DeliveryConditions />
                  {loadingSavedAddress && <p role="status" className="text-sm text-slate-600">Cargando dirección de Mi cuenta…</p>}
                  {usingSavedAddress && <section className="grid gap-2 rounded-[5px] border border-slate-300 bg-slate-50 p-3 text-sm" aria-label="Dirección guardada">
                    <strong>Dirección guardada en Mi cuenta</strong>
                    <span>{savedAddress.recipientName} · {savedAddress.phone}</span>
                    <span>{savedAddress.address} · {savedAddress.commune}</span>
                    {savedAddress.reference && <span>{savedAddress.reference}</span>}
                    <p className="m-0 text-xs">Esta dirección se utilizará para este pedido.</p>
                    <button ref={anotherAddressButtonRef} className="w-fit border-slate-300 bg-white text-ink-700" type="button" onClick={useAnotherAddress} disabled={submitting}>Usar otra dirección</button>
                  </section>}
                  {!usingSavedAddress && !loadingSavedAddress && <>
                  {isClient && savedCheckoutAddressIsUsable(savedAddress) && <button className="w-fit border-slate-300 bg-white text-ink-700" type="button" onClick={useSavedAddress} disabled={submitting}>Volver a usar dirección guardada</button>}
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <label>Destinatario<input ref={recipientInputRef} required maxLength={240} autoComplete="shipping name" {...destinationField("deliveryRecipientName")}/></label>
                    <label>Teléfono de contacto<input required maxLength={20} type="tel" autoComplete="shipping tel" {...destinationField("deliveryPhone")}/></label>
                    <label>Comuna<select value={DELIVERY_COMMUNE} onChange={()=>{}} aria-describedby="local-coverage-help"><option value={DELIVERY_COMMUNE}>{DELIVERY_COMMUNE}</option></select></label>
                    <label>Dirección, numeración o sector<input required maxLength={300} autoComplete="shipping street-address" {...destinationField("deliveryAddress")}/></label>
                    <label className="sm:col-span-2">Referencia u observaciones de entrega<textarea className="min-h-24 w-full min-w-0 resize-y rounded-[5px] border border-slate-300 bg-white p-3 text-sm text-ink-950" maxLength={500} placeholder="Para una dirección sin numeración, indica cómo identificar el lugar." {...destinationField("deliveryReference")}/></label>
                  </div>
                  {isClient && <label className="delivery-settings-checkbox text-sm">
                    <input className="mt-1 size-4 shrink-0" type="checkbox" checked={saveAddress} disabled={savedAddressLoading || submitting || !destinationValid || Boolean(savedAddressNote && !savedAddress)} onChange={event => { if (event.target.checked && savedAddress) setConfirmAddressReplacement(true); else setSaveAddress(event.target.checked); }} />
                    <span>{savedAddress ? "Guardar esta dirección y reemplazar la de Mi cuenta" : "Guardar dirección en Mi cuenta"}<small className="mt-1 block">Se guardará al crear el pedido al iniciar el pago, no al marcar esta casilla.</small></span>
                  </label>}
                  </>}
                  {savedAddressNote && <p role="status" className="m-0 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-ink-700">{savedAddressNote}</p>}
                  <p id="local-coverage-help" className="m-0 text-xs text-slate-500">Solo se admite Santa Juana. No verificamos físicamente la dirección mediante mapas o geocodificación. Revisa los datos antes de pagar.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="sticky top-22 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[900px]:static">
            <h2 className="m-0 text-lg font-bold text-ink-950">Resumen</h2>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-600">Entrega{!quote && displayQuote ? " (último resumen)" : ""}</span><strong className="text-right text-ink-950">{(displayQuote ? quoteState.deliveryType : deliveryType) === "DELIVERY" ? "Despacho a domicilio · Santa Juana" : "Retiro en tienda"}</strong></div>
            {displayQuote && <div aria-live="polite" aria-busy={quotePending}><OrderAmounts order={displayQuote} checkout provisional={!quote} />{quoteState.deliveryType === "DELIVERY" && displayQuote.deliveryBenefit?.active && <p className="mt-2 mb-0 text-xs text-slate-600">Gratuidad solo si los productos después de descuentos superan estrictamente {formatClp(displayQuote.deliveryBenefit.threshold)}.</p>}</div>}
            {quotePending && <p role="status" className="m-0 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-ink-700">Actualizando resumen para {deliveryType === "DELIVERY" ? "despacho local" : "retiro en tienda"}…{displayQuote ? " Los importes mostrados son del último resumen validado, no están confirmados para pagar." : " Se validan los importes en el servidor."}</p>}
            {quote && quoteState.needsAcceptance && <div role="status" className="grid gap-3 rounded-[5px] border border-rust-200 bg-rust-50 p-3 text-sm text-ink-950"><p className="m-0">El resumen cambió. Revisa los productos, condiciones e importes y acepta el resumen actualizado antes de iniciar el pago.</p><button type="button" onClick={() => setQuoteState(previous => acceptCheckoutQuote(previous, quoteKey, quote.commercialSignature))}>Aceptar resumen actualizado · {formatClp(quote.total)}</button></div>}
            {quoteError && <div role="alert" className="checkout-quote-alert grid min-w-0 gap-4 rounded-[5px] p-4 text-sm">
              <p className="m-0 break-words font-semibold leading-6">{quoteError}</p>
              {quoteState.errorKind === "RETRY" && <button className="min-h-11 w-full max-w-full justify-self-center px-5 sm:w-auto sm:min-w-56" type="button" onClick={() => setQuoteRefresh(v => v + 1)}>Reintentar cálculo</button>}
              {quoteState.errorKind === "PRODUCTS" && <Link className="font-bold underline" to={back.to} state={back.state}>{checkoutIntent?.source === "DIRECT" || directPurchase ? "Revisar producto y cantidad" : "Revisar productos y cantidades en el carrito"}</Link>}
            </div>}
            {!quote && displayQuote && !quotePending && <p className="m-0 text-xs text-slate-600">El último resumen es solo una referencia. Debes obtener un cálculo válido antes de pagar.</p>}

            <div className="grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <strong className="flex items-center gap-2 text-ink-950"><CreditCard size={17} /> Webpay Plus</strong>
              <span>Serás redirigido al sitio seguro de Webpay para pagar el total final indicado, incluido el despacho cuando corresponda.</span>
              <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-positive-600" size={15} /> Los precios, el total y el stock se validarán nuevamente en el servidor.</span>
            </div>

            {hasAvailabilityIssues && !loading && (
              <p className="m-0 rounded-[5px] bg-critical-50 px-3 py-3 text-xs leading-5 text-critical-600">
                {catalogError || "Uno o más productos ya no están disponibles para compra online. Revisa tu selección antes de continuar."}
              </p>
            )}

            <button type="button" onClick={handlePayment} disabled={!canStartPayment}>
              <CreditCard size={18} />
              {submitting ? "Iniciando Webpay..." : "Pagar con Webpay Plus"}
            </button>
            {quote && !quoteState.needsAcceptance && <p className="m-0 text-xs leading-5 text-slate-600">Al pulsar Pagar aceptas este resumen y su total de {formatClp(quote.total)}. El servidor lo validará nuevamente antes de iniciar Webpay.</p>}
            <Link className="text-center text-sm font-bold text-rust-600" to={back.to} state={back.state}>{checkoutIntent?.source === "DIRECT" || directPurchase ? "Modificar selección en el producto" : "Modificar carrito"}</Link>
          </aside>
        </div>
      )}
      <AppModal open={confirmAddressReplacement} title="Reemplazar dirección guardada" onClose={() => setConfirmAddressReplacement(false)} size="small" footer={<>
        <button type="button" onClick={() => setConfirmAddressReplacement(false)}>Cancelar</button>
        <button className="product-positive-action" type="button" onClick={() => { setSaveAddress(true); setConfirmAddressReplacement(false); }}>Confirmar reemplazo al crear el pedido</button>
      </>}>
        <p>Tu cuenta admite una dirección. La anterior se reemplazará por estos datos únicamente al crear el pedido. Los pedidos anteriores no cambian.</p>
        <p className="break-words">{destination.deliveryRecipientName} · {destination.deliveryPhone}<br />{destination.deliveryAddress} · {DELIVERY_COMMUNE}<br />{destination.deliveryReference}</p>
      </AppModal>
    </main>
  );
}

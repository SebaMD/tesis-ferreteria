import { ArrowLeft, CreditCard, MapPin, RefreshCw, ShieldCheck, ShoppingCart, Store, Trash2, Truck, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import DeliveryLocationPicker from "../components/DeliveryLocationPicker.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import { DELIVERY_COMMUNE } from "../helpers/delivery.js";
import { formatClp } from "../helpers/formatters.js";
import { getOnlineAvailableStock, submitWebpayForm } from "../helpers/onlineOrders.js";
import { readGuestOrderAccessToken, saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import useAuth from "../hooks/useAuth.js";
import useCart from "../hooks/useCart.js";
import { getCatalogProductsRequest } from "../services/catalog.service.js";
import {
  continueOnlineOrderPaymentRequest,
  continueGuestOnlineOrderPaymentRequest,
  createGuestOnlineOrderCheckoutRequest,
  createOnlineOrderCheckoutRequest,
  getClientDeliveryAddressRequest,
  getGuestPendingOrderRequest,
  getMyOnlineOrdersRequest,
} from "../services/onlineOrders.service.js";

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
  const { isAuthenticated, user } = useAuth();
  const { items, removeItem } = useCart();
  const isClient = isAuthenticated && user?.role === "CLIENT";
  const [checkoutKey] = useState(createCheckoutKey);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingOrderLoading, setPendingOrderLoading] = useState(true);
  const [savedAddressLoading, setSavedAddressLoading] = useState(isClient);
  const [catalogError, setCatalogError] = useState("");
  const [pendingOrder, setPendingOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [continuingPayment, setContinuingPayment] = useState(false);
  const [deliveryType, setDeliveryType] = useState("PICKUP");
  const [saveDeliveryAddress, setSaveDeliveryAddress] = useState(false);
  const [guestData, setGuestData] = useState({
    name: "",
    email: "",
    emailConfirmation: "",
    phone: "",
  });
  const [deliveryData, setDeliveryData] = useState(() => ({
    recipientName: `${user?.names || ""} ${user?.surnames || ""}`.trim(),
    phone: user?.phone || "",
    address: "",
    reference: "",
    latitude: null,
    longitude: null,
  }));
  const submittingRef = useRef(false);
  const deliveryTouchedRef = useRef(false);

  const loadAvailability = useCallback(async (notifyError = false) => {
    try {
      const products = await getCatalogProductsRequest();
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
  }, []);

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

  const loadSavedDeliveryAddress = useCallback(async () => {
    if (!isClient) {
      setSavedAddressLoading(false);
      return;
    }
    try {
      const savedAddress = await getClientDeliveryAddressRequest();
      if (!savedAddress || deliveryTouchedRef.current) return;
      setDeliveryData({
        recipientName: savedAddress.recipientName || "",
        phone: savedAddress.phone || "",
        address: savedAddress.address || "",
        reference: savedAddress.reference || "",
        latitude: savedAddress.latitude ?? null,
        longitude: savedAddress.longitude ?? null,
      });
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cargar tu dirección guardada"));
    } finally {
      setSavedAddressLoading(false);
    }
  }, [isClient]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailability(true);
    loadPendingOrder(true);
    loadSavedDeliveryAddress();
    const refreshCheckout = () => {
      loadAvailability(false);
      loadPendingOrder(false);
    };
    const refreshTimer = window.setInterval(refreshCheckout, 30_000);
    window.addEventListener("focus", refreshCheckout);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshCheckout);
    };
  }, [loadAvailability, loadPendingOrder, loadSavedDeliveryAddress]);

  const liveProductById = useMemo(
    () => new Map(catalogProducts.map((product) => [Number(product.id), product])),
    [catalogProducts],
  );

  const rows = items.map((item) => {
    const liveProduct = liveProductById.get(Number(item.product.id));
    const product = liveProduct || item.product;
    const quantity = Number(item.quantity || 0);
    const availableStock = liveProduct ? getOnlineAvailableStock(liveProduct) : 0;
    const validQuantity = Number.isInteger(quantity) && quantity > 0;
    const isAvailable = Boolean(liveProduct) && availableStock > 0;
    const hasEnoughStock = validQuantity && quantity <= availableStock;

    return {
      product,
      quantity,
      availableStock,
      isAvailable,
      isValid: isAvailable && hasEnoughStock,
      subtotal: Number(product?.price || 0) * Math.max(quantity, 0),
    };
  });

  const total = rows.reduce((sum, row) => sum + row.subtotal, 0);
  const hasAvailabilityIssues = Boolean(catalogError) || rows.some((row) => !row.isValid);
  const normalizedGuestEmail = guestData.email.trim().toLowerCase();
  const guestDataIsValid = isClient || (
    guestData.name.trim().length >= 3
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuestEmail)
    && normalizedGuestEmail === guestData.emailConfirmation.trim().toLowerCase()
    && /^[+0-9()\s-]{7,20}$/.test(guestData.phone.trim())
  );
  const deliveryDataIsValid = deliveryType === "PICKUP" || (
    deliveryData.recipientName.trim()
    && /^[+0-9()\s-]{7,20}$/.test(deliveryData.phone.trim())
    && deliveryData.address.trim()
  );
  const canStartPayment = !loading
    && !pendingOrderLoading
    && !savedAddressLoading
    && !submitting
    && !pendingOrder
    && rows.length > 0
    && !hasAvailabilityIssues
    && guestDataIsValid
    && Boolean(deliveryDataIsValid);
  const pendingGuestAccessToken = !isClient && pendingOrder
    ? readGuestOrderAccessToken(pendingOrder.id)
    : null;

  const updateDeliveryData = (field, value) => {
    deliveryTouchedRef.current = true;
    setDeliveryData((current) => ({ ...current, [field]: value }));
  };

  const handleRemoveProduct = (productId) => {
    if (pendingOrder) {
      toast.warning("Finaliza o revisa el pago pendiente antes de modificar el carrito");
      return;
    }
    if (submitting) return;

    removeItem(productId);
    toast.success("Producto eliminado del carrito");
  };

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
    if (deliveryType === "DELIVERY" && !deliveryDataIsValid) {
      toast.error("Completa correctamente los datos obligatorios del despacho");
      return;
    }
    if (!canStartPayment || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    let redirectStarted = false;

    try {
      const checkoutData = {
        checkoutKey,
        items: rows.map((row) => ({
          productId: Number(row.product.id),
          quantity: row.quantity,
        })),
        deliveryType,
        deliveryRecipientName: deliveryType === "DELIVERY" ? deliveryData.recipientName : null,
        deliveryPhone: deliveryType === "DELIVERY" ? deliveryData.phone : null,
        deliveryAddress: deliveryType === "DELIVERY" ? deliveryData.address : null,
        deliveryCommune: deliveryType === "DELIVERY" ? DELIVERY_COMMUNE : null,
        deliveryReference: deliveryType === "DELIVERY" ? deliveryData.reference : null,
        deliveryLatitude: deliveryType === "DELIVERY" ? deliveryData.latitude : null,
        deliveryLongitude: deliveryType === "DELIVERY" ? deliveryData.longitude : null,
        saveDeliveryAddress: isClient && deliveryType === "DELIVERY" && saveDeliveryAddress,
      };
      const payment = isClient
        ? await createOnlineOrderCheckoutRequest(checkoutData)
        : await createGuestOnlineOrderCheckoutRequest({
          ...checkoutData,
          guestName: guestData.name,
          guestEmail: guestData.email,
          guestEmailConfirmation: guestData.emailConfirmation,
          guestPhone: guestData.phone,
          saveDeliveryAddress: false,
        });

      if (!isClient && payment.guestAccessToken) {
        saveGuestOrderAccessToken(payment.orderId, payment.guestAccessToken);
      }

      submitWebpayForm(payment);
      redirectStarted = true;
    } catch (error) {
      toast.error(getApiError(error, "No se pudo iniciar el pago con Webpay"));
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
      <LoadingOverlay active={loading || savedAddressLoading} />

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
          <div className="flex flex-wrap items-center gap-2 max-[520px]:w-full max-[520px]:[&>*]:flex-1">
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

      {items.length === 0 ? (
        <section className="grid min-h-70 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="grid justify-items-center gap-3">
            <ShoppingCart className="text-slate-400" size={45} />
            <strong className="text-lg text-ink-950">Tu carrito está vacío</strong>
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
                          {formatClp(row.product.price)} × {row.quantity}
                        </span>
                        {row.isValid ? (
                          <span className="text-xs font-bold text-positive-600">{row.availableStock} disponibles</span>
                        ) : (
                          <span className="text-xs font-bold text-critical-600">
                            {row.isAvailable
                              ? `Tienes ${row.quantity} en el carrito y ahora hay ${row.availableStock} disponibles.`
                              : "Este producto ya no está disponible."}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3 max-[620px]:col-span-2 max-[620px]:w-full max-[620px]:justify-between">
                        <strong className="font-mono text-sm text-ink-950">
                          {formatClp(row.subtotal)}
                        </strong>
                        <button
                          className="size-9 min-h-9 shrink-0 border-critical-200 bg-critical-50 p-0 text-critical-600 hover:bg-critical-100"
                          type="button"
                          onClick={() => handleRemoveProduct(row.product.id)}
                          disabled={Boolean(pendingOrder) || submitting}
                          aria-label={`Eliminar ${row.product.name} del carrito`}
                          title={pendingOrder
                            ? "No puedes modificar el carrito mientras exista un pago pendiente"
                            : `Eliminar ${row.product.name}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
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
                    Usaremos este correo para enviarte el comprobante y las actualizaciones de tu pedido.
                  </p>
                </div>
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
                  <span className="grid gap-1"><strong className="flex items-center gap-2 text-sm text-ink-950"><Store size={17} /> Retiro en tienda</strong><span className="text-xs leading-5 text-slate-500">Retira el pedido en la ferretería cuando aparezca como listo.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-[5px] border p-4 ${deliveryType === "DELIVERY" ? "border-rust-500 bg-rust-50" : "border-slate-200 bg-white"}`}>
                  <input className="mt-1 size-4" type="radio" name="deliveryType" value="DELIVERY" checked={deliveryType === "DELIVERY"} onChange={() => setDeliveryType("DELIVERY")} />
                  <span className="grid gap-1"><strong className="flex items-center gap-2 text-sm text-ink-950"><Truck size={17} /> Despacho a domicilio</strong><span className="text-xs leading-5 text-slate-500">Ingresa los datos de la persona y dirección que recibirá el pedido.</span></span>
                </label>
              </div>

              {deliveryType === "DELIVERY" && (
                <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">Nombre del destinatario
                    <input maxLength="240" required value={deliveryData.recipientName} onChange={(event) => updateDeliveryData("recipientName", event.target.value)} placeholder="Nombre y apellido" />
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">Teléfono de contacto
                    <input maxLength="20" required value={deliveryData.phone} onChange={(event) => updateDeliveryData("phone", event.target.value)} placeholder="Ej: +56 9 1234 5678" />
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">Dirección
                    <div className="relative"><MapPin className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={16} /><input className="w-full pl-9" maxLength="300" required value={deliveryData.address} onChange={(event) => updateDeliveryData("address", event.target.value)} placeholder="Calle, número, casa o departamento" /></div>
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">Comuna
                    <input readOnly value={DELIVERY_COMMUNE} aria-readonly="true" />
                  </label>
                  <label className="col-span-2 grid gap-1.5 text-xs font-bold text-slate-600 max-[620px]:col-span-1">Referencia / indicaciones <span className="font-normal text-slate-400">(opcional)</span>
                    <textarea className="min-h-20 w-full resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2 text-ink-950 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500" maxLength="500" value={deliveryData.reference} onChange={(event) => updateDeliveryData("reference", event.target.value)} placeholder="Ej: portón azul, llamar al llegar" />
                  </label>
                  <DeliveryLocationPicker
                    latitude={deliveryData.latitude}
                    longitude={deliveryData.longitude}
                    address={deliveryData.address}
                    commune={DELIVERY_COMMUNE}
                    onChange={({ latitude, longitude }) => {
                      deliveryTouchedRef.current = true;
                      setDeliveryData((current) => ({ ...current, latitude, longitude }));
                    }}
                    disabled={submitting}
                  />
                  {isClient && (
                    <label className="col-span-2 flex cursor-pointer items-start gap-2 rounded-[5px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-ink-950 max-[620px]:col-span-1">
                      <input
                        className="mt-0.5 size-4 shrink-0"
                        type="checkbox"
                        checked={saveDeliveryAddress}
                        onChange={(event) => setSaveDeliveryAddress(event.target.checked)}
                      />
                      <span>
                        Guardar esta dirección para próximas compras
                        <small className="mt-0.5 block font-normal leading-5 text-slate-500">
                          Solo se actualizará tu dirección guardada si mantienes esta opción seleccionada.
                        </small>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="sticky top-22 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm max-[900px]:static">
            <h2 className="m-0 text-lg font-bold text-ink-950">Resumen</h2>
            <div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-600">Entrega</span><strong className="text-right text-ink-950">{deliveryType === "DELIVERY" ? "Despacho a domicilio" : "Retiro en tienda"}</strong></div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-bold text-slate-600">Total estimado</span>
              <strong className="font-mono text-2xl text-ink-950">{formatClp(total)}</strong>
            </div>

            <div className="grid gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <strong className="flex items-center gap-2 text-ink-950"><CreditCard size={17} /> Webpay Plus</strong>
              <span>Será el único medio de pago. Serás redirigido al sitio seguro de Webpay.</span>
              <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-positive-600" size={15} /> Los precios, el total y el stock se validarán nuevamente en el servidor.</span>
            </div>

            {hasAvailabilityIssues && !loading && (
              <p className="m-0 rounded-[5px] bg-critical-50 px-3 py-3 text-xs leading-5 text-critical-600">
                {catalogError || "El stock disponible cambió. Ajusta el carrito antes de continuar."}
              </p>
            )}

            <button type="button" onClick={handlePayment} disabled={!canStartPayment}>
              <CreditCard size={18} />
              {submitting ? "Iniciando Webpay..." : "Pagar con Webpay Plus"}
            </button>
            <Link className="text-center text-sm font-bold text-rust-600" to="/cart">Modificar carrito</Link>
          </aside>
        </div>
      )}
    </main>
  );
}

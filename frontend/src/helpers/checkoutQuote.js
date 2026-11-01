export function receiveCheckoutQuote(previous, key, data, deliveryType) {
  const signature = data.commercialSignature;
  // Receiving a preview is not the buyer accepting it. The first acceptance is
  // the explicit pay action; subsequent material changes require review.
  return { ...previous, key, data, deliveryType, error: "", errorKind: "",
    needsAcceptance: !signature || Boolean(
      (previous.acceptedSignature || previous.requireAcceptance)
      && signature !== previous.acceptedSignature,
    ) };
}
export function acceptCheckoutQuote(previous, key, signature) {
  if (!signature || previous.error || previous.key !== key || previous.data?.commercialSignature !== signature) return previous;
  return { ...previous, acceptedSignature: signature, requireAcceptance: false, needsAcceptance: false };
}

// A superseded or unmounted request may never publish a quote/address/catalog.
export function createLatestCheckoutRequest() {
  let generation = 0;
  return { begin() { const request = ++generation; return () => request === generation; }, invalidate() { generation++; } };
}
export function checkoutQuoteFailure(error, { connection = false, message = "No se pudo calcular el pedido. Revisa los productos y cantidades." } = {}) {
  const code = error?.response?.data?.code;
  const status = error?.response?.status;
  const errorKind = code === "DELIVERY_UNAVAILABLE" ? "DELIVERY_UNAVAILABLE"
    : code === "DELIVERY_MANUAL_QUOTE_REQUIRED" ? "MANUAL_DELIVERY"
    : connection || (!code && status >= 500) ? "RETRY"
      : code === "POLICY_UNAVAILABLE" || code === "PICKUP_UNAVAILABLE" ? "POLICY"
        : "PRODUCTS";
  return { error: errorKind === "MANUAL_DELIVERY" ? "La tarifa local aún no está activada. Puedes elegir retiro en tienda; no se iniciará un pago de despacho sin tarifa definitiva." : message, errorKind };
}

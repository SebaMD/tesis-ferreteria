export function receiveCheckoutQuote(previous, key, data) {
  return { key, data, error: "", errorKind: "", lastFingerprint: data.quoteFingerprint,
    needsAcceptance: Boolean(previous.needsAcceptance || (previous.lastFingerprint && previous.lastFingerprint !== data.quoteFingerprint)) };
}
export function checkoutQuoteFailure(error, { connection = false, message = "No se pudo calcular el pedido. Revisa los productos y cantidades." } = {}) {
  const code = error?.response?.data?.code;
  const status = error?.response?.status;
  const errorKind = code === "DELIVERY_UNAVAILABLE" ? "DELIVERY_UNAVAILABLE"
    : connection || (!code && status >= 500) ? "RETRY"
      : code === "POLICY_UNAVAILABLE" || code === "PICKUP_UNAVAILABLE" ? "POLICY"
        : "PRODUCTS";
  return { error: message, errorKind };
}

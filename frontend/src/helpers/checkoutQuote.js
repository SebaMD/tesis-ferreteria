export function receiveCheckoutQuote(previous, key, data) {
  const signature = data.commercialSignature;
  // A missing commercial contract must never authorize a payment.
  const reviewedSignatures = previous.reviewedSignatures || [];
  const first = reviewedSignatures.length === 0 && !previous.hadQuote;
  const reviewed = first && signature ? [signature] : reviewedSignatures;
  return { key, data, error: "", errorKind: "", hadQuote: true, reviewedSignatures: reviewed,
    needsAcceptance: !signature || !reviewed.includes(signature) };
}
export function acceptCheckoutQuote(previous, key, signature) {
  if (!signature || previous.key !== key || previous.data?.commercialSignature !== signature) return previous;
  return { ...previous, reviewedSignatures: [...new Set([...(previous.reviewedSignatures || []), signature])], needsAcceptance: false };
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

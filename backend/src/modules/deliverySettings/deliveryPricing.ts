import { createHash } from "node:crypto";

export class DeliveryPolicyError extends Error {
  constructor(message: string, public readonly statusCode = 409, public readonly code = "DELIVERY_POLICY_ERROR") { super(message); }
}

export type DeliveryPolicy = {
  id: number; version: number; pickupEnabled: boolean; deliveryEnabled: boolean;
  flatFee: string; minimumProductsTotal: string | null; freeShippingFrom: string | null; isDemo: boolean;
  pricingMode?: string | null; conditionalFreeEnabled?: boolean | null; conditionalFreeFrom?: string | null;
};

// Public commercial identity, distinct from the policy revision used to validate checkout.
// Includes each item: equal grand totals do not imply equivalent purchases.
export function commercialQuoteSignature(data: Parameters<typeof quoteFingerprint>[0], conditions: unknown) {
  const { revisionId: _revisionId, ...commercial } = data;
  return createHash("sha256").update(JSON.stringify({ ...commercial,
    items: [...commercial.items].sort((a, b) => a.productId - b.productId), conditions })).digest("hex");
}

export const MANUAL_DELIVERY_REQUIRED = "El despacho requiere una cotización manual aprobada antes de pagar. La solicitud online de cotización aún no está habilitada; puedes continuar con retiro en tienda.";

// Informational answers supplied by FYF, NOT an approved tariff or a pricing formula.
// The conditional benefit cannot reuse the old automatic freeShippingFrom policy.
export function publicDeliveryInformation(policy: DeliveryPolicy | null) {
  return {
    mode: "MANUAL_QUOTE", onlineQuoteRequestsEnabled: policy?.pricingMode==="MANUAL_QUOTE" && Boolean(policy.deliveryEnabled),
    deliveryEnabled: Boolean(policy?.deliveryEnabled),
    coverage: "Región del Biobío", noChargeRadiusKmReference: 5,
    minimumOutboundKmPriceReference: 1000, conditionalFreeThresholdReference: policy?.pricingMode==="MANUAL_QUOTE"?Number(policy.conditionalFreeFrom??500000):500000,
    conditionalBenefitEnabled: policy?.pricingMode==="MANUAL_QUOTE"&&Boolean(policy.deliveryEnabled&&policy.conditionalFreeEnabled),
    message: "El costo del despacho se calcula según la distancia de entrega, el vehículo necesario y la cantidad de viajes. La ferretería confirmará el valor antes de realizar el cobro correspondiente.",
    routeConfirmationRequired: true, coordinationRequired: true, nonUrgentDeliveryRequired: true,
  } as const;
}

export function calculateDelivery(policy: DeliveryPolicy | null, type: "PICKUP" | "DELIVERY", _productsNet: number) {
  if (!policy) throw new DeliveryPolicyError("El despacho aún no tiene una configuración disponible. Intenta más tarde.", 503, "POLICY_UNAVAILABLE");
  if (!(type === "PICKUP" ? policy.pickupEnabled : policy.deliveryEnabled)) {
    throw new DeliveryPolicyError(type === "PICKUP" ? "El retiro en tienda está temporalmente deshabilitado." : "El despacho no está disponible por ahora", 409, type === "PICKUP" ? "PICKUP_UNAVAILABLE" : "DELIVERY_UNAVAILABLE");
  }
  if (type === "PICKUP") return { fee: 0, reason: "PICKUP" as const };
  // Fail closed for ALL new delivery quotes/checkouts, including direct API calls.
  // Existing orders, callbacks and payment retries use persisted amounts, not this function.
  throw new DeliveryPolicyError(MANUAL_DELIVERY_REQUIRED, 409, "DELIVERY_MANUAL_QUOTE_REQUIRED");
}

export function deliveryBenefit(_policy: DeliveryPolicy, _type: string, _productsNet: number) {
  // No approval has been recorded by the current model. Never infer free freight from a cart total.
  return { active: false, threshold: null, remaining: null, qualified: false };
}

// Explicit public projection: never serialize the administrative policy/actor.
export function deliveryAnnouncement(policy: DeliveryPolicy | null) {
  if (!policy) return null;
  if (!policy.deliveryEnabled) return { kind: "SUSPENDED", title: "El despacho no está disponible por ahora", message: "Puedes elegir retiro en tienda.", isDemo: false };
  if(policy.pricingMode==="MANUAL_QUOTE")return {kind:"MANUAL_QUOTE",title:"Despacho sujeto a cotización",message:policy.conditionalFreeEnabled?`Consulta por despacho gratis en compras desde $${Number(policy.conditionalFreeFrom).toLocaleString("es-CL")}. Sujeto a coordinación, entrega no urgente y aprobación de FYF.`:"Solicita la evaluación de tu despacho al finalizar compra. FYF debe aprobar el flete antes de habilitar el pago.",isDemo:false};
  return { kind: "MANUAL_QUOTE", title: "Despacho sujeto a cotización",
    message: "Entregas en la Región del Biobío. El valor depende del destino, vehículo y viajes, y requiere confirmación de FYF. Por ahora, la compra online está disponible con retiro en tienda.", isDemo: false };
}

// Digest of server-calculated economics. Never accepts client money as authority.
export function quoteFingerprint(data: { revisionId: number; deliveryType: string; items: Array<{ productId: number; quantity: number; unitPrice: string; subtotal: string; discountAmount: string; promotionId: number | null; promotionTypeSnapshot: string | null; promotionNameSnapshot: string | null; promotionValueSnapshot: number | null }>; fee: number }) {
  return createHash("sha256").update(JSON.stringify({ ...data, items: [...data.items].sort((a, b) => a.productId - b.productId) })).digest("hex");
}

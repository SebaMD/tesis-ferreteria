import { createHash } from "node:crypto";

export class DeliveryPolicyError extends Error {
  constructor(message: string, public readonly statusCode = 409, public readonly code = "DELIVERY_POLICY_ERROR") { super(message); }
}

export type DeliveryPolicy = {
  id: number; version: number; pickupEnabled: boolean; deliveryEnabled: boolean;
  flatFee: string; minimumProductsTotal: string | null; freeShippingFrom: string | null; isDemo: boolean;
};

export function calculateDelivery(policy: DeliveryPolicy | null, type: "PICKUP" | "DELIVERY", productsNet: number) {
  if (!policy) throw new DeliveryPolicyError("El despacho aún no tiene una configuración disponible. Intenta más tarde.", 503, "POLICY_UNAVAILABLE");
  if (!(type === "PICKUP" ? policy.pickupEnabled : policy.deliveryEnabled)) {
    throw new DeliveryPolicyError(type === "PICKUP" ? "El retiro en tienda está temporalmente deshabilitado." : "El despacho no está disponible por ahora", 409, type === "PICKUP" ? "PICKUP_UNAVAILABLE" : "DELIVERY_UNAVAILABLE");
  }
  if (type === "PICKUP") return { fee: 0, reason: "PICKUP" as const };
  if (policy.minimumProductsTotal !== null && productsNet < Number(policy.minimumProductsTotal)) {
    throw new DeliveryPolicyError(`El despacho requiere un total de productos, después de descuentos, de al menos $${Number(policy.minimumProductsTotal).toLocaleString("es-CL")}.`);
  }
  if (Number(policy.flatFee) > 0 && policy.freeShippingFrom !== null && productsNet >= Number(policy.freeShippingFrom)) return { fee: 0, reason: "FREE_THRESHOLD" as const };
  return { fee: Number(policy.flatFee), reason: "FLAT" as const };
}

export function deliveryBenefit(policy: DeliveryPolicy, type: string, productsNet: number) {
  const active = type === "DELIVERY" && policy.deliveryEnabled && Number(policy.flatFee) > 0 && policy.freeShippingFrom !== null;
  const threshold = active ? Math.max(Number(policy.freeShippingFrom), Number(policy.minimumProductsTotal ?? 0)) : null;
  return { active, threshold, remaining: threshold === null ? null : Math.max(0, threshold - productsNet), qualified: threshold !== null && productsNet >= threshold };
}

// Explicit public projection: never serialize the administrative policy/actor.
export function deliveryAnnouncement(policy: DeliveryPolicy | null) {
  if (!policy) return null;
  const suffix = policy.isDemo ? " Tarifa DEMO ficticia, no oficial de FYF." : "";
  if (!policy.deliveryEnabled) return { kind: "SUSPENDED", title: "El despacho no está disponible por ahora", message: `${policy.pickupEnabled ? "Puedes elegir retiro en tienda." : "Consulta la disponibilidad de las modalidades antes de comprar."}${suffix}`, isDemo: policy.isDemo };
  const benefit = deliveryBenefit(policy, "DELIVERY", 0);
  if (!benefit.active) return null;
  return { kind: "FREE_SHIPPING", title: `¡Despacho gratis en compras desde $${benefit.threshold!.toLocaleString("es-CL")}!`, message: `El monto corresponde al valor neto de productos después de descuentos.${suffix}`, isDemo: policy.isDemo };
}

// Digest of server-calculated economics. Never accepts client money as authority.
export function quoteFingerprint(data: { revisionId: number; deliveryType: string; items: Array<{ productId: number; quantity: number; unitPrice: string; subtotal: string; discountAmount: string; promotionId: number | null; promotionTypeSnapshot: string | null; promotionNameSnapshot: string | null; promotionValueSnapshot: number | null }>; fee: number }) {
  return createHash("sha256").update(JSON.stringify({ ...data, items: [...data.items].sort((a, b) => a.productId - b.productId) })).digest("hex");
}

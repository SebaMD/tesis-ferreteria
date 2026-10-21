import { createHash } from "node:crypto";

export class DeliveryPolicyError extends Error {
  constructor(message: string, public readonly statusCode = 409) { super(message); }
}

export type DeliveryPolicy = {
  id: number; version: number; pickupEnabled: boolean; deliveryEnabled: boolean;
  flatFee: string; minimumProductsTotal: string | null; freeShippingFrom: string | null; isDemo: boolean;
};

export function calculateDelivery(policy: DeliveryPolicy | null, type: "PICKUP" | "DELIVERY", productsNet: number) {
  if (!policy) throw new DeliveryPolicyError("El despacho aún no tiene una configuración disponible. Intenta más tarde.", 503);
  if (!(type === "PICKUP" ? policy.pickupEnabled : policy.deliveryEnabled)) {
    throw new DeliveryPolicyError(type === "PICKUP" ? "El retiro en tienda está temporalmente deshabilitado." : "El despacho a domicilio está temporalmente deshabilitado.");
  }
  if (type === "PICKUP") return { fee: 0, reason: "PICKUP" as const };
  if (policy.minimumProductsTotal !== null && productsNet < Number(policy.minimumProductsTotal)) {
    throw new DeliveryPolicyError(`El despacho requiere un total de productos, después de descuentos, de al menos $${Number(policy.minimumProductsTotal).toLocaleString("es-CL")}.`);
  }
  if (policy.freeShippingFrom !== null && productsNet >= Number(policy.freeShippingFrom)) return { fee: 0, reason: "FREE_THRESHOLD" as const };
  return { fee: Number(policy.flatFee), reason: "FLAT" as const };
}

// Digest of server-calculated economics. Never accepts client money as authority.
export function quoteFingerprint(data: { revisionId: number; deliveryType: string; items: Array<{ productId: number; quantity: number; unitPrice: string; subtotal: string; discountAmount: string; promotionId: number | null; promotionTypeSnapshot: string | null; promotionNameSnapshot: string | null; promotionValueSnapshot: number | null }>; fee: number }) {
  return createHash("sha256").update(JSON.stringify({ ...data, items: [...data.items].sort((a, b) => a.productId - b.productId) })).digest("hex");
}

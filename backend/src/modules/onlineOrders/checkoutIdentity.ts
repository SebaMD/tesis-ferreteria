import { createHash } from "node:crypto";
import type { CreateCheckoutBody } from "./onlineOrders.validation.js";

// A key identifies one immutable request, not every purchase made by its owner.
export function checkoutRequestHash(data: CreateCheckoutBody, guest?: { guestName: string; guestEmail: string; guestPhone: string }) {
  return createHash("sha256").update(JSON.stringify({
    items: [...data.items].sort((a, b) => a.productId - b.productId),
    quoteFingerprint: data.quoteFingerprint ?? null,
    deliveryType: data.deliveryType, deliveryRecipientName: data.deliveryRecipientName,
    deliveryPhone: data.deliveryPhone, deliveryAddress: data.deliveryAddress,
    deliveryCommune: data.deliveryCommune, deliveryReference: data.deliveryReference,
    deliveryLatitude: data.deliveryLatitude, deliveryLongitude: data.deliveryLongitude,
    saveDeliveryAddress: data.saveDeliveryAddress,
    guest: guest ? { name: guest.guestName, email: guest.guestEmail, phone: guest.guestPhone } : null,
  })).digest("hex");
}

export const PROVIDER_QUERY_WINDOW_MS = 7 * 24 * 60 * 60_000;
export function providerQueryWindowEnded(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() >= PROVIDER_QUERY_WINDOW_MS;
}

import assert from "node:assert/strict";
export async function initializeTestDelivery(actorId) {
  const target = new URL(process.env.DATABASE_URL || "http://missing");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && ["55441", "55444", "55445"].includes(target.port), "Only isolated integration databases");
  await (await import("../../dist/modules/deliverySettings/deliverySettings.service.js")).saveDeliverySettings(actorId, {
    expectedRevisionId: null, pickupEnabled: true, deliveryEnabled: true, flatFee: 3000, minimumProductsTotal: null, freeShippingFrom: null, isDemo: true,
  });
}
export async function acceptTestQuote(base, body) {
  const res = await fetch(base + "/online-orders/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: body.items, deliveryType: body.deliveryType, ...(body.deliveryCommune ? { deliveryCommune: body.deliveryCommune } : {}) }) });
  const payload = await res.json(); assert.equal(res.status, 200, JSON.stringify(payload));
  return { ...body, quoteFingerprint: payload.data.quoteFingerprint };
}

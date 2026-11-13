import assert from "node:assert/strict";
import test from "node:test";
import { guestCheckoutEmailIsVerified } from "../src/helpers/checkoutEmailVerification.js";
import { canHideGuestOrder, readHiddenGuestOrderIds, writeHiddenGuestOrderIds } from "../src/helpers/guestOrderVisibility.js";
import { groupBuyerOrders } from "../src/helpers/buyerOrderGroups.js";

const now = Date.parse("2026-11-05T20:00:00Z");
const scope = { email: "guest@example.test", checkoutKey: "checkout-a", sessionId: "guest-session-a" };
const verification = { ...scope, challengeId: 7, purpose: "GUEST_CHECKOUT", verified: true, expiresAt: new Date(now + 600_000).toISOString() };

test("la verificación de checkout no depende de la modalidad, dirección ni cotización", () => {
  for (const deliveryType of ["PICKUP", "DELIVERY", "PICKUP"]) {
    assert.equal(guestCheckoutEmailIsVerified(verification, { ...scope, deliveryType, quote: deliveryType, address: "otra" }, now), true);
  }
});

test("verificación limitada al correo, sesión y proceso, sin aceptar propósitos históricos", () => {
  for (const changed of [{ email: "other@example.test" }, { checkoutKey: "checkout-b" }, { sessionId: "guest-session-b" }]) {
    assert.equal(guestCheckoutEmailIsVerified(verification, { ...scope, ...changed }, now), false);
  }
  for (const changed of [{ purpose: "DELIVERY" }, { purpose: "PICKUP" }, { verified: false }, { challengeId: 0 }, { expiresAt: null }, { expiresAt: "invalid" }]) {
    assert.equal(guestCheckoutEmailIsVerified({ ...verification, ...changed }, scope, now), false);
  }
  assert.equal(guestCheckoutEmailIsVerified(null, scope, now), false);
});

test("una verificación expirada no habilita el pago, incluso exactamente en su vencimiento", () => {
  const expires = Date.parse(verification.expiresAt);
  assert.equal(guestCheckoutEmailIsVerified(verification, scope, expires - 1), true);
  assert.equal(guestCheckoutEmailIsVerified(verification, scope, expires), false);
  assert.equal(guestCheckoutEmailIsVerified(verification, scope, expires + 1), false);
});

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test("ocultamiento invitado reversible conserva solamente IDs locales, nunca tokens ni pedidos", () => {
  const tab = storage();
  assert.deepEqual([...readHiddenGuestOrderIds(tab)], []);
  assert.equal(writeHiddenGuestOrderIds(tab, new Set([8, 9])), true);
  assert.deepEqual([...readHiddenGuestOrderIds(tab)], [8, 9]);
  const hidden = readHiddenGuestOrderIds(tab);
  hidden.delete(8);
  writeHiddenGuestOrderIds(tab, hidden);
  assert.deepEqual([...readHiddenGuestOrderIds(tab)], [9]);
  assert.deepEqual([...readHiddenGuestOrderIds(storage())], [], "otra pestaña/visitante no hereda esta preferencia");
  assert.equal([...tab.values.values()][0], "[9]");
});

test("no se ocultan pagos en revisión, pedidos completados ni IDs ajenos a la respuesta autorizada", () => {
  for (const status of ["PAID", "DELIVERED", "PENDING_PAYMENT", "PAYMENT_REVIEW", "PREPARING"]) {
    assert.equal(canHideGuestOrder({ status }), false);
  }
  for (const status of ["FAILED", "CANCELLED", "EXPIRED"]) {
    assert.equal(canHideGuestOrder({ status: "EXPIRED", payment: { status } }), true);
  }
  for (const status of ["AUTHORIZED", "REVIEW", "PENDING", "CREATED", "UNKNOWN"]) {
    assert.equal(canHideGuestOrder({ status: "EXPIRED", payment: { status } }), false);
  }
  const hidden = new Set([8]);
  const authorized = [{ id: 8, status: "PAID" }, { id: 10, status: "EXPIRED" }];
  const grouped = groupBuyerOrders(authorized.filter(order => !canHideGuestOrder(order) || !hidden.has(order.id)));
  assert.deepEqual(grouped.active, [authorized[0]], "un pedido pagado vuelve a ser visible aunque su ID estuviera oculto");
  assert.deepEqual(grouped.incomplete, [authorized[1]]);
});

test("almacenamiento dañado o no disponible no pierde pedidos ni oculta un fallo", () => {
  const tab = storage();
  tab.setItem("fyf_hidden_guest_order_ids", '{broken');
  assert.deepEqual([...readHiddenGuestOrderIds(tab)], []);
  tab.setItem("fyf_hidden_guest_order_ids", '[2,2,0,-3,"4",null]');
  assert.deepEqual([...readHiddenGuestOrderIds(tab)], [2]);
  assert.equal(writeHiddenGuestOrderIds({ setItem() { throw new Error("denied"); } }, new Set([2])), false);
  assert.deepEqual([...readHiddenGuestOrderIds({ getItem() { throw new Error("denied"); } })], []);
});

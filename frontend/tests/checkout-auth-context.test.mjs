import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  checkoutContinuationState,
  createCheckoutIntent,
  readCheckoutIntent,
  resolveCheckoutItems,
  shouldMergeGuestCartOnAuthentication,
} from "../src/helpers/checkoutIntent.js";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const row = (id, quantity = 1) => ({ product: { id, price: 999999, name: `Producto ${id}` }, quantity });
const selectionIds = (selection) => selection.map(({ product, quantity }) => ({ productId: product.id, quantity }));

for (const [name, source, guestSelection, clientCart] of [
  ["A: Comprar ahora + login con carrito CLIENT vacío", "DIRECT", [row(1, 2)], []],
  ["B: Comprar ahora + login conserva carrito CLIENT B", "DIRECT", [row(1, 2)], [row(2)]],
  ["C: carrito Invitado + login con carrito CLIENT vacío", "GUEST_CART", [row(1), row(2)], []],
  ["D: carrito Invitado + login no mezcla carrito CLIENT C/D", "GUEST_CART", [row(1), row(2)], [row(3), row(4)]],
]) {
  test(name, () => {
    const before = structuredClone(clientCart);
    const state = { checkoutIntent: createCheckoutIntent(source, guestSelection) };
    const loginState = { from: "/checkout", ...checkoutContinuationState(state) };
    assert.equal(shouldMergeGuestCartOnAuthentication(loginState), false);
    const checkoutState = checkoutContinuationState(loginState);
    assert.deepEqual(selectionIds(resolveCheckoutItems(checkoutState, clientCart)), selectionIds(guestSelection));
    assert.deepEqual(clientCart, before);
    assert.deepEqual(Object.keys(checkoutState.checkoutIntent.items[0]), ["productId", "quantity"]);
    assert.equal(JSON.stringify(checkoutState).includes("price"), false);
  });
}

for (const [name, source, selection] of [
  ["E/F: Comprar ahora + registro + verificar después/ahora", "DIRECT", [row(1, 2)]],
  ["G/H: carrito Invitado + registro + verificar después/ahora", "GUEST_CART", [row(1), row(2)]],
]) {
  test(name, async () => {
    const registerState = { from: "/checkout", checkoutIntent: createCheckoutIntent(source, selection) };
    assert.equal(shouldMergeGuestCartOnAuthentication(registerState), false);
    const verificationState = {
      ...checkoutContinuationState(registerState), from: "/checkout", fromRegistration: true,
    };
    for (const path of ["Verificar más tarde", "Continuar tras verificar"]) {
      const state = checkoutContinuationState(verificationState);
      assert.deepEqual(selectionIds(resolveCheckoutItems(state, [])), selectionIds(selection), path);
    }
    const [register, verification, checkout] = await Promise.all([
      read("pages/RegisterPage.jsx"), read("pages/ClientEmailVerificationPage.jsx"), read("pages/CheckoutPage.jsx"),
    ]);
    assert.match(register, /registerClient\([\s\S]*\}, checkoutState\)/);
    assert.match(register, /state: \{\s*\.\.\.checkoutState/);
    assert.equal((verification.match(/navigate\(destination, \{ replace: true, state: checkoutState \}\)/g) || []).length, 2);
    assert.match(checkout, /&& emailVerifiedForCheckout/);
    assert.match(checkout, /if \(!canStartPayment \|\| submittingRef\.current\) return/);
    assert.match(checkout, /Debes verificar tu correo antes de continuar con esta compra/);
    assert.match(checkout, /setClientEmailVerified\(true\)/);
  });
}

test("I/J: login y registro sin selección mantienen el uso normal del carrito", () => {
  const clientCart = [row(3), row(4)];
  assert.equal(checkoutContinuationState(undefined), undefined);
  assert.equal(shouldMergeGuestCartOnAuthentication(undefined), true);
  assert.equal(resolveCheckoutItems(undefined, clientCart), clientCart);
});

test("K/L: compra directa autenticada y continuar como Invitado preservan su selección", async () => {
  const clientCart = [row(3)];
  const directState = { directPurchase: row(1, 2) };
  assert.deepEqual(resolveCheckoutItems(directState, clientCart), [row(1, 2)]);
  const guestState = { checkoutIntent: createCheckoutIntent("GUEST_CART", [row(1), row(2)]) };
  assert.deepEqual(selectionIds(resolveCheckoutItems(guestState, clientCart)), [
    { productId: 1, quantity: 1 }, { productId: 2, quantity: 1 },
  ]);
  const choice = await read("pages/CheckoutChoicePage.jsx");
  assert.match(choice, /to="\/checkout\?mode=guest" state=\{checkoutState\}/);
  assert.equal((choice.match(/state=\{\{ from: "\/checkout", \.\.\.checkoutState \}\}/g) || []).length, 2);
});

test("autenticación, redirecciones y limpieza usan el mismo contexto sin alterar el carrito persistente", async () => {
  const [auth, cart, login, checkout, result, tracking] = await Promise.all([
    read("context/AuthProvider.jsx"), read("context/CartProvider.jsx"), read("pages/LoginPage.jsx"),
    read("pages/CheckoutPage.jsx"), read("pages/PaymentResultPage.jsx"), read("pages/GuestOrderTrackingPage.jsx"),
  ]);
  assert.equal((auth.match(/mergeGuestCart: shouldMergeGuestCartOnAuthentication\(checkoutState\)/g) || []).length, 2);
  assert.match(auth, /token, user, mergeGuestCart = false/);
  assert.match(cart, /mergeGuestCart=\{user\?\.role === "CLIENT" && mergeGuestCart\}/);
  assert.match(login, /password \}, checkoutState\)/);
  assert.match(login, /state: session\.user\.role === "CLIENT" \? checkoutState : undefined/);
  assert.match(login, /replace state=\{user\?\.role === "CLIENT" \? checkoutState : undefined\}/);
  assert.match(checkout, /checkoutIntent\?\.source === "DIRECT" \|\| \(checkoutIntent && isClient\)/);
  assert.match(checkout, /markDirectPurchaseOrder\(payment\.orderId\)/);
  assert.match(result, /!isDirectPurchaseOrder\(data\.id\)/);
  assert.match(tracking, /!isDirectPurchaseOrder\(data\.id\)/);
});

test("M: selección temporal no impide refrescar catálogo ni enviar solo IDs/cantidades al backend", async () => {
  const checkout = await read("pages/CheckoutPage.jsx");
  assert.match(checkout, /getCatalogProductsByIdsRequest\(checkoutProductIds\)/);
  assert.match(checkout, /!liveProduct\.inStoreOnly && availableStock > 0/);
  assert.match(checkout, /items: rows\.map\(\(row\) => \(\{\s*productId: Number\(row\.product\.id\),\s*quantity: row\.quantity/);
  assert.match(checkout, /&& !hasAvailabilityIssues/);
});

test("selección reciente, acotada y válida; vencida o corrupta nunca sustituye silenciosamente el checkout por otro carrito", () => {
  const now = Date.now();
  const intent = createCheckoutIntent("DIRECT", [row(1, 2)], now);
  assert.ok(readCheckoutIntent({ checkoutIntent: intent }, now));
  for (const invalid of [
    { ...intent, createdAt: now - 60 * 60_000 - 1 },
    { ...intent, createdAt: now + 1 },
    { ...intent, items: [null] },
    { ...intent, items: [{ productId: 1, quantity: -1 }] },
    { ...intent, source: "OTHER" },
  ]) {
    assert.equal(readCheckoutIntent({ checkoutIntent: invalid }, now), null);
    assert.deepEqual(resolveCheckoutItems({ checkoutIntent: invalid }, [row(3)], now), []);
  }
  const expiredState = checkoutContinuationState({ checkoutIntent: { ...intent, createdAt: now - 60 * 60_000 - 1 } });
  assert.deepEqual(resolveCheckoutItems(expiredState, [row(3)], now), []);
  assert.equal(shouldMergeGuestCartOnAuthentication(expiredState), false);
});

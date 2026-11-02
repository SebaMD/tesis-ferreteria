import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { carouselSwipeDirection } from "../src/helpers/carouselSwipe.js";
import { createCheckoutIntent, checkoutReturn, checkoutContinuationState, resolveCheckoutItems, shouldMergeGuestCartOnAuthentication } from "../src/helpers/checkoutIntent.js";
import { savedCheckoutDestination, mergeSavedCheckoutDestination, EMPTY_CHECKOUT_DESTINATION } from "../src/helpers/checkoutDestination.js";

const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("direct checkout keeps cart intact and preserves exact family variant through login, reload and information return", () => {
  const cart = [{ product: { id: 5 }, quantity: 8 }];
  const snapshot = structuredClone(cart);
  const state = { checkoutIntent: createCheckoutIntent("DIRECT", [{ product: { id: 99 }, quantity: 2 }]),
    checkoutReturn: { to: { pathname: "/catalog/families/18", search: "?variant=99" }, state: { productDetailOrigin: { source: "favorites" } } } };
  const continuation = checkoutContinuationState(state);
  assert.deepEqual(resolveCheckoutItems(continuation, cart), [{ product: { id: 99 }, quantity: 2 }]);
  assert.deepEqual(cart, snapshot);
  assert.equal(shouldMergeGuestCartOnAuthentication(continuation), false);
  assert.deepEqual(checkoutReturn(continuation), checkoutReturn(state));
  assert.equal(continuation.checkoutIntent.checkoutKey, state.checkoutIntent.checkoutKey);
  assert.deepEqual(checkoutReturn(structuredClone(state)).to, state.checkoutReturn.to);
  assert.deepEqual(checkoutReturn({}).to, "/cart");
  assert.equal(checkoutReturn({ ...state, checkoutReturn: { to: { pathname: "//evil.test" } } }).to, "/catalog/products/99");
  assert.deepEqual(resolveCheckoutItems({ checkoutIntent: { expired: true } }, cart), []);
  assert.equal(checkoutReturn({ checkoutIntent: { source: "DIRECT", expired: true } }).to, "/catalog");
});

test("swipes require deliberate horizontal movement; vertical scroll, taps and long presses do not advance", () => {
  const start = { x: 160, y: 100, at: 1000 };
  assert.equal(carouselSwipeDirection(start, { x: 50, y: 110, at: 1200 }, 360), 1);
  assert.equal(carouselSwipeDirection(start, { x: 260, y: 110, at: 1200 }, 360), -1);
  assert.equal(carouselSwipeDirection(start, { x: 150, y: 101, at: 1200 }, 360), 0);
  assert.equal(carouselSwipeDirection(start, { x: 50, y: 250, at: 1200 }, 360), 0);
  assert.equal(carouselSwipeDirection(start, { x: 50, y: 100, at: 2500 }, 360), 0);
  assert.equal(carouselSwipeDirection(null, start, 360), 0);
});

test("saved destination remains account data; outside-coverage and manually edited fields stay protected", () => {
  const saved = { recipientName: "Cliente de prueba", phone: "+56912345678", address: "Calle 123", commune: "Santa Juana", reference: "Portón verde" };
  assert.equal(savedCheckoutDestination(saved).values.deliveryAddress, "Calle 123");
  assert.equal(savedCheckoutDestination({ ...saved, commune: "Concepción" }).values.deliveryAddress, undefined);
  assert.match(savedCheckoutDestination({ ...saved, address: "" }).note, /incompleta/);
  const touched = Object.fromEntries(Object.keys(EMPTY_CHECKOUT_DESTINATION).map(key => [key, true]));
  assert.deepEqual(mergeSavedCheckoutDestination(EMPTY_CHECKOUT_DESTINATION, touched, saved), EMPTY_CHECKOUT_DESTINATION);
  assert.equal(saved.address, "Calle 123");
});

test("mobile filter clients edit only modal drafts; commit and orange primary are explicit", async () => {
  const tools = await read("components/MobileTableTools.jsx");
  assert.match(tools, /setDraft\(structuredClone\(value\)\)/);
  assert.match(tools, /onApply\?\.\(draft\)/);
  assert.match(tools, /className="product-positive-action"/);
  assert.match(tools, /onClose=\{\(\) => setOpen\(false\)\}/);
  assert.match(tools, />Cancelar<\/button>/);
  for (const file of ["ProductsPage", "SalesPage", "OnlineOrdersManagementPage"]) {
    const source = await read(`pages/${file}.jsx`);
    const block = source.match(/<MobileTableTools[\s\S]*?<\/MobileTableTools>/)[0];
    assert.match(block, /value=\{/); assert.match(block, /onApply=\{/);
    assert.match(block, /\(draft, setDraft\)/);
  }
});

test("creation initial stock stays in existing payload; mobile add and back controls have names and 44px targets", async () => {
  const [products, bundle, styles, checkout] = await Promise.all([read("pages/ProductsPage.jsx"), read("components/ProductBundleEditor.jsx"), read("styles/styles.css"), read("pages/CheckoutPage.jsx")]);
  assert.match(products, /showProductContinueAction = linkedRegistration\?\.step === "product" && Boolean\(editingProductId\)/);
  assert.match(products, /initialStock: ""/);
  assert.match(bundle, /aria-label="Agregar otro atributo" title="Agregar otro atributo"/);
  assert.match(bundle, /aria-label="Agregar otra variante" title="Agregar otra variante"/);
  assert.match(styles, /\.variant-section-add \{ width: 44px !important/);
  assert.match(checkout, /saveDeliveryAddress: isClient && deliveryType === "DELIVERY" && saveAddress/);
  assert.match(checkout, /title="Reemplazar dirección guardada"/);
  assert.match(checkout, /Usar otra dirección/);
  assert.match(checkout, /if\(savedAddress\)setSaveAddress\(false\)/);
});

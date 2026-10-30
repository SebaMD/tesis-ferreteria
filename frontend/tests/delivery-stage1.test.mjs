import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { receiveCheckoutQuote, acceptCheckoutQuote, checkoutQuoteFailure } from "../src/helpers/checkoutQuote.js";
import { commercialAmountLines, formatCommercialAmount } from "../src/helpers/commercialAmounts.js";
import { getAdministrativeOrderSections } from "../src/helpers/administrativeOrder.js";
import { buildCatalogSlides } from "../src/helpers/customerNoticeCarousel.js";
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("cotización actualizada requiere aceptación explícita, incluso tras error; nunca reenvía compra", async () => {
  let state = receiveCheckoutQuote({}, "cart:pickup", { quoteFingerprint: "first", commercialSignature: "A" });
  assert.equal(state.needsAcceptance, false);
  state = receiveCheckoutQuote(state, "refresh", { quoteFingerprint: "technical-revision", commercialSignature: "A" });
  assert.equal(state.needsAcceptance, false);
  state = receiveCheckoutQuote({ ...state, data: null }, "changed", { quoteFingerprint: "second", commercialSignature: "B" });
  assert.equal(state.needsAcceptance, true);
  state = receiveCheckoutQuote(state, "refresh", { quoteFingerprint: "second", commercialSignature: "B" });
  assert.equal(state.needsAcceptance, true);
  assert.equal(acceptCheckoutQuote(state, "obsolete", "B"), state);
  assert.equal(acceptCheckoutQuote(state, "refresh", "A"), state);
  state = acceptCheckoutQuote(state, "refresh", "B");
  assert.equal(state.needsAcceptance, false);
  assert.equal(receiveCheckoutQuote({ ...state, needsAcceptance: true }, "same-after-conflict", { quoteFingerprint: "third", commercialSignature: "B" }).needsAcceptance, false);
  assert.equal(receiveCheckoutQuote(state, "return-to-A", { quoteFingerprint: "fourth", commercialSignature: "A" }).needsAcceptance, false);
  assert.equal(receiveCheckoutQuote(state, "change-C", { commercialSignature: "C" }).needsAcceptance, true);
  assert.equal(receiveCheckoutQuote({}, "missing-contract", {}).needsAcceptance, true);
  const checkout = await read("pages/CheckoutPage.jsx");
  assert.match(checkout, /&& !quoteState.needsAcceptance/);
  assert.match(checkout, /Aceptar resumen actualizado/);
  assert.match(checkout, /code === "QUOTE_CHANGED"/);
  assert.doesNotMatch(checkout, /Actualizar cotización/);
  assert.match(checkout, /Retiro en tienda/);
  assert.match(checkout, /Reintentar cálculo/);
});
test("errores contextuales diferencian conexión, suspensión y productos", () => {
  assert.equal(checkoutQuoteFailure({}, { connection: true }).errorKind, "RETRY");
  assert.equal(checkoutQuoteFailure({ response: { data: { code: "DELIVERY_UNAVAILABLE" }, status: 409 } }).errorKind, "DELIVERY_UNAVAILABLE");
  assert.equal(checkoutQuoteFailure({ response: { data: { code: "POLICY_UNAVAILABLE" }, status: 503 } }).errorKind, "POLICY");
  assert.equal(checkoutQuoteFailure({ response: { status: 409 } }).errorKind, "PRODUCTS");
});
test("carrusel combina aviso derivado sin duplicar ni alterar avisos manuales", () => {
  const manual = [{ id: 5, title: "Aviso manual", message: "Intacto", displaySeconds: 5 }];
  const dynamic = { title: "Despacho sujeto a cotización", message: "FYF confirma el valor antes del cobro. Por ahora puedes elegir retiro.", isDemo: false };
  assert.deepEqual(buildCatalogSlides(null, manual, dynamic).map(slide => slide.id), ["institutional", "delivery-policy", "notice-5"]);
  assert.equal(buildCatalogSlides(null, manual, { ...dynamic, title: "El despacho no está disponible por ahora" })[1].title, "El despacho no está disponible por ahora");
  assert.deepEqual(buildCatalogSlides(null, manual, null).map(slide => slide.id), ["institutional", "notice-5"]);
});
test("importes autoritativos conservan orden, signos y legado en copia/impresión", () => {
  const lines = [
    { key: "productsSubtotal", label: "Subtotal original de productos", amount: "10000.00" },
    { key: "deliveryBaseFee", label: "Costo de despacho", amount: "3000.00" },
    { key: "productsDiscount", label: "Descuentos de productos", amount: "2000.00", discount: true },
    { key: "deliveryDiscount", label: "Descuento por despacho gratis", amount: "3000.00", discount: true },
    { key: "total", label: "Total final", amount: "8000.00" },
  ];
  const model = { commercialAmounts: { lines }, buyer: {}, delivery: {}, createdAt: new Date().toISOString() };
  assert.equal(commercialAmountLines(model), lines);
  assert.equal(formatCommercialAmount(lines[3]), "−$3.000");
  assert.deepEqual(getAdministrativeOrderSections(model)[2].fields.map(([label]) => label), lines.map(line => line.label));
  assert.equal(commercialAmountLines({ total: "10000.00", deliveryFee: null })[1].amount, null);
});
test("actualización entre navegadores y configuración simplificada mantienen controles existentes", async () => {
  const provider = await read("context/CustomerNoticeProvider.jsx");
  assert.match(provider, /30_000/); assert.match(provider, /visibilitychange/); assert.match(provider, /"focus", refreshVisible/); assert.match(provider, /request !== generation.current/);
  const settings = await read("components/DeliverySettingsManager.jsx");
  assert.doesNotMatch(settings, /checked=\{form.pickupEnabled\}|value=\{form.minimumProductsTotal\}/);
  assert.match(settings, /Cada guardado crea una revisión/);
  assert.match(settings, /max-\[720px\]:w-full/);
  assert.match(settings, /refreshNotices\(\)/);
});

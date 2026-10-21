import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAdministrativeOrderSections, formatAdministrativeOrderText } from "../src/helpers/administrativeOrder.js";
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
test("tarifa histórica en ficha/copia/impresión, DEMO y distinción de pedidos antiguos", () => {
  const model = { folio: "P-1", status: "PAID", createdAt: new Date().toISOString(), notice: "No constituye documento tributario", buyer: { name: "Comprador", type: "GUEST" }, delivery: { type: "PICKUP", label: "Retiro" }, items: [], baseSubtotal: "10000", totalDiscount: "2000", deliveryFee: "3000", total: "11000", deliveryIsDemo: true };
  const fields = getAdministrativeOrderSections(model)[2].fields;
  assert.ok(fields.some(([k,v]) => k === "Despacho" && v === "$3.000"));
  assert.match(formatAdministrativeOrderText(model), /DEMO ficticia/);
  assert.match(formatAdministrativeOrderText({ ...model, deliveryFee: null, deliveryIsDemo: false }), /Sin cargo registrado \(histórico\)/);
});
test("checkout usa cotización backend vinculada al carrito/modalidad y bloquea datos obsoletos", async () => {
  const source = await read("pages/CheckoutPage.jsx");
  assert.match(source, /quoteOnlineOrderRequest/); assert.match(source, /quoteState.key === quoteKey/);
  assert.match(source, /&& Boolean\(quote\)/); assert.match(source, /quoteFingerprint: quote.quoteFingerprint/);
  assert.match(source, /Tarifa DEMO ficticia/); assert.match(source, /No existe verificación geográfica/);
  assert.match(source, /setQuoteRefresh\(value => value \+ 1\)/);
});
test("configuración solo ADMIN/MANAGER, revisión previa, concurrencia y controles accesibles existentes", async () => {
  const source = await read("components/DeliverySettingsManager.jsx");
  assert.match(source, /const canConfigure = \["ADMIN", "MANAGER"\]\.includes\(role\)/);
  assert.match(source, /if \(!open \|\| !canConfigure\) return/);
  assert.match(source, /if \(!canConfigure\) return null/);
  assert.match(source, /if \(!canConfigure \|\| loading \|\| error\) return/);
  assert.match(source, /expectedRevisionId: current\?\.id \?\? null/);
  assert.match(source, /if \(!review\)/); assert.match(source, /Confirmar y guardar revisión/);
  assert.match(source, /AppModal/); assert.match(source, /focus-visible/);
});
test("compradores, supervisión y documentos comparten importes persistidos, sin consultar tarifas vigentes", async () => {
  for (const page of ["components/orders/OrderDetailModal.jsx", "pages/PaymentResultPage.jsx", "pages/GuestOrderTrackingPage.jsx", "pages/OnlineOrdersManagementPage.jsx"]) assert.match(await read(page), /<OrderAmounts order=/);
  const source = await read("components/orders/OrderAmounts.jsx"); assert.doesNotMatch(source, /api\.|quoteOnlineOrder|delivery-settings/);
  assert.match(source, /order.deliveryFee == null/);
});

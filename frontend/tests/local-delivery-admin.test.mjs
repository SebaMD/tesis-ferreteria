import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("operational orders exclude legacy quotations but preserve real logistics and local settings", async () => {
  const page = await read("pages/OnlineOrdersManagementPage.jsx");
  assert.doesNotMatch(page, /delivery-requests|Solicitudes de despacho|DeliveryQuotesPage|deliveryQuoteApi/);
  for (const action of ["startOrderPreparationRequest", "finishOrderPreparationRequest", "startOrderDeliveryRequest", "completeOrderDeliveryRequest", "getDeliveryProofRequest"])
    assert.ok(page.includes(action), action);
  assert.match(page, /<DeliverySettingsManager role=\{user\?\.role\}/);
  assert.match(page, /Consulta pedidos pagados/);
});

test("historical request routes and their completion actions remain separate and protected", async () => {
  const app = await read("App.jsx");
  assert.match(app, /path="\/delivery-requests\/:id\?" element=\{<ProtectedPage allowedRoles=\{ROUTE_PERMISSIONS.onlineOrdersManagement\}><DeliveryQuotesPage/);
  const legacy = await read("pages/DeliveryQuotesPage.jsx");
  assert.match(legacy, /Solicitudes de despacho anteriores/);
  assert.match(legacy, /Compatibilidad histórica/);
  assert.match(legacy, /Esta página no crea solicitudes nuevas/);
  for (const action of ["assign", "proposals", "approve", "request-changes", "reject", "cancel", "close-unpaid"])
    assert.ok(legacy.includes(action), action);
  assert.match(legacy, /HistoricalIdentityNote/);
  assert.doesNotMatch(await read("pages/CheckoutPage.jsx"), /DeliveryQuoteRequestForm|createDeliveryQuote|Solicitar cotización/);
});

test("local setting checkboxes are compact native controls with clickable enclosing labels", async () => {
  const settings = await read("components/DeliverySettingsManager.jsx");
  assert.equal((settings.match(/<label className="delivery-settings-checkbox"><input type="checkbox"/g) || []).length, 2);
  assert.match(settings, /<span>Despacho local habilitado<\/span><\/label>/);
  assert.match(settings, /<span>Habilitar despacho gratuito por monto<\/span><\/label>/);
  assert.match(settings, /\["ADMIN", "MANAGER"\]\.includes\(role\)/);
  assert.match(settings, /fieldset disabled=\{loading\|\|Boolean\(error\)\}/);
  assert.match(settings, /if \(!review\)\{setReview\(true\);return;\}/);
  assert.match(settings, /expectedRevisionId:current\?\.id\?\?null/);
  assert.match(settings, /type="button" disabled=\{loading\} onClick=\{\(\)=>setOpen\(false\)\}>Cancelar/);
  assert.match(settings, /form.freeShippingFrom!==null&&<label>Umbral/);
  const css = await read("styles/styles.css");
  assert.match(css, /\.delivery-settings-checkbox \{[^}]*display: flex;[^}]*align-items: center;[^}]*justify-content: flex-start;/s);
  assert.match(css, /\.delivery-settings-checkbox > input\[type="checkbox"\] \{[^}]*width: 16px;[^}]*height: 16px;[^}]*min-height: 16px;/s);
});

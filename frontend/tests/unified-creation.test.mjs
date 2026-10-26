import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { bundleDraft, bundlePayload, newBundleRow, setBundleRowOption, resumeBundleDraft, simpleDraftFromBundle, simpleProductPayload, SINGLE_VARIANT_MESSAGE } from "../src/helpers/productBundleForm.js";
import { deliveryConditionsInformation } from "../src/helpers/deliveryConditions.js";
import { getStoreContactDetails, FYF_CONTACT } from "../src/helpers/storeInformation.js";
const base = { name: "Lubricante", categoryId: "1", brand: "Marca", description: "Descripción", unitMeasure: "unidad", price: "5990", minimumStock: 5, initialStock: 7, status: true, inStoreOnly: false, barcode: "12345" };
const draft = () => {
  let value = resumeBundleDraft(bundleDraft(null, base), base);
  value.attributes[0].name = "Presentación";
  return setBundleRowOption(value, value.rows[0].key, 0, "400 ml");
};
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("one new variant offers explicit choice; a historical single member remains editable", () => {
  const d = draft(); assert.throws(() => bundlePayload(d, "key", [], []), { message: SINGLE_VARIANT_MESSAGE });
  d.familyId = 3; d.revision = "existing"; d.rows[0].id = 90; d.rows[0].name = "Lubricante de 400 ml";
  const p = bundlePayload(d, "key", [], []); assert.equal(p.variants.length, 1); assert.equal(p.variants[0].id, 90); assert.equal(p.variants[0].initialStock, undefined);
});

test("switching modes preserves compatible commercial data, initial stock, files and stable options", () => {
  const d = draft(), common = { name: "common.png" }, specific = { name: "specific.png" };
  d.rows[0].useCommon = true; d.rows[0].files = [specific]; d.rows[0].name = "Nombre manual"; d.rows[0].nameCustomized = true;
  d.rows[0].status = false; d.rows[0].inStoreOnly = true;
  const simple = simpleDraftFromBundle(d, [common]);
  assert.deepEqual(simple.files, [common, specific]); assert.equal(simple.fields.initialStock, 7); assert.equal(simple.fields.price, "5990");
  assert.equal(simple.fields.name, "Nombre manual"); assert.equal(simple.fields.description, base.description); assert.equal(simple.fields.status, false);
  const next = resumeBundleDraft(d, { ...simple.fields, price: 6000 });
  assert.equal(next.rows[0].price, 6000); assert.equal(next.rows[0].initialStock, 7);
  assert.equal(next.rows[0].selections[0], d.rows[0].selections[0]); assert.equal(next.attributes[0].key, d.attributes[0].key);
  assert.deepEqual(next.rows[0].files, [specific]); assert.equal(next.rows[0].nameCustomized, true);
});

test("two concrete rows save once without generating a parent product or Cartesian combinations", () => {
  let d = draft(); const row = newBundleRow(1, base); d.rows.push(row); d = setBundleRowOption(d, row.key, 0, "150 ml");
  const p = bundlePayload(d, "operation-key", [], []);
  assert.equal(p.variants.length, 2); assert.equal(p.variants[0].initialStock, 7); assert.equal(p.variants[1].initialStock, 0);
  assert.deepEqual(p.variants.map(v => v.name), ["Lubricante de 400 ml", "Lubricante de 150 ml"]);
});

test("explicit simple payload retains stock and images but no family attributes or additional articles", () => {
  const p = simpleProductPayload(base, "one-operation", [{ name: "photo" }]);
  assert.equal(p.simple, true); assert.equal(p.variants.length, 1); assert.equal(p.familyId, undefined); assert.deepEqual(p.family.attributes, []);
  assert.equal(p.variants[0].initialStock, 7); assert.deepEqual(p.variants[0].imageIndexes, [0]); assert.equal(p.variants[0].barcode, "12345");
});

test("creation uses one window, compact accessible rows and explicit error recovery", async () => {
  const page = await read("pages/ProductsPage.jsx"), editor = await read("components/ProductBundleEditor.jsx");
  assert.match(page, /Tipo de producto nuevo/); assert.match(page, /aria-pressed=\{!variantsEnabled\}/);
  assert.match(page, /<ProductBundleEditor inline/); assert.match(editor, /inline \? <div hidden=/);
  assert.match(editor, /aria-expanded=\{expandedRows.has\(row.key\)\}/); assert.match(editor, /aria-controls=\{`variant-fields-/);
  assert.match(editor, /hidden=\{!expandedRows.has\(row.key\)\}/); assert.match(editor, /requestAnimationFrame\(\(\)=>e.target.focus\(\)\)/);
  assert.match(editor, /Continuar como producto simple/); assert.match(editor, /guard.current = true/); assert.match(editor, /saveProductBundleRequest\(frozen.current\)/);
  const modal = await read("components/AppModal.jsx"); assert.match(modal, /getClientRects\(\).length > 0/);
});

test("public conditions use FYF references, never the automatic DEMO threshold, and only verified location", async () => {
  const values = deliveryConditionsInformation({ freeShippingFrom: 1, flatFee: 3000 });
  assert.deepEqual(values, { coverage: "Región del Biobío", radius: 5, outboundKm: 1000, conditionalThreshold: 500000 });
  assert.equal(deliveryConditionsInformation({ conditionalFreeThresholdReference: 600000 }).conditionalThreshold, 600000);
  const page = await read("pages/DeliveryConditionsPage.jsx"); assert.match(page, /No es automático ni garantizado/); assert.match(page, /entrega no urgente/);
  assert.match(page, /getStoreContactDetails/); assert.match(page, /pendiente de confirmar su dirección oficial/);
  assert.equal(FYF_CONTACT.confirmed.address, false); assert.equal(getStoreContactDetails().some(c => c.kind === "address"), false);
  assert.doesNotMatch(page, /navigator.geolocation|leaflet|directionsService/);
});

test("checkout has a short linked note, no payable delivery total and keeps final payment guards", async () => {
  const page = await read("pages/CheckoutPage.jsx"), note = await read("components/DeliveryConditions.jsx");
  assert.match(note, /to="\/delivery-conditions"/); assert.match(page, /<span>Despacho<\/span><span>Por cotizar<\/span>/);
  assert.match(page, /&& deliveryType === "PICKUP"/); assert.match(page, /quoteFingerprint: quote.quoteFingerprint/);
  assert.match(page, /quoteState.errorKind === "MANUAL_DELIVERY"/); assert.doesNotMatch(page, /3\.000|500\.000|1\.000/);
});

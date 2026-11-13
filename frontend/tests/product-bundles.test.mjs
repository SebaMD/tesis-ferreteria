import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { bundleDraft, bundlePayload, newBundleRow, bundleCardChoice } from "../src/helpers/productBundleForm.js";
import { resolveProductAssets } from "../src/helpers/productAssets.js";
const newDraft = () => ({ ...bundleDraft(), name: "Pintura", categoryId: 1, attributes: [{ name: "Color", options: [], optionsText: "Rojo\nAzul" }], rows: [{ ...newBundleRow(), selections: [0], price: 1000, initialStock: 3 }, { ...newBundleRow(), selections: [1], price: 1200, initialStock: 2 }] });
test("new bundle sends only explicit combinations and no SKU or family stock", () => {
  const payload = bundlePayload(newDraft(), "key", [], []); assert.equal(payload.variants.length, 2); assert.equal(payload.variants[0].name, "Pintura de Rojo"); assert.equal(payload.variants[1].initialStock, 2); assert.equal(payload.sku, undefined);
  const d = newDraft(); d.attributes.push({ name: "Medida", options: [], optionsText: "1 L\n2 L" }); d.rows.forEach((r, i) => r.selections.push(i));
  assert.equal(bundlePayload(d, "key", [], []).variants.length, 2); // not four Cartesian combinations
});
test("duplicate or missing combinations are rejected before posting", () => {
  const d = newDraft(); d.rows[1].selections = [0]; assert.throws(() => bundlePayload(d, "key", [], []));
  d.rows[1].selections = [""]; assert.throws(() => bundlePayload(d, "key", [], []));
});
test("central editing preserves IDs, option IDs and no initial stock for existing products", () => {
  const snapshot = { revision: "revision", family: { id: 7, name: "Brochas", categoryId: 2, brand: "Prueba", attributes: [{ id: 9, name: "Ancho", options: [{ id: 12, label: "2 pulgadas" }] }] }, variants: [{ id: 31, name: "Brocha 2 pulgadas", price: "1000.00", minimumStock: 1, currentStock: 7, variantOptionIds: [12], status: true, hasHistory: true }] };
  const d = bundleDraft(snapshot), payload = bundlePayload(d, "key", [], []);
  assert.equal(payload.expectedRevision, "revision"); assert.equal(payload.variants[0].id, 31); assert.equal(payload.variants[0].initialStock, undefined); assert.equal(payload.family.attributes[0].options[0].id, 12);
});
test("common images require explicit per-variant selection and preserve specific images", () => {
  const common = {}, specific = {}, d = newDraft(); d.rows[0].useCommon = true; d.rows[1].files = [specific];
  const p = bundlePayload(d, "key", [common, specific], [common]); assert.deepEqual(p.variants[0].imageIndexes, [0]); assert.deepEqual(p.variants[1].imageIndexes, [1]);
});
test("catalog selection is restricted to returned concrete filtered options", () => {
  const f = { representativeProductId: 1, variants: [{ id: 1, availableStock: 0 }, { id: 2, availableStock: 8 }, { id: 3, status: false }] };
  assert.equal(bundleCardChoice(f, 2).id, 2); assert.equal(bundleCardChoice(f, 99).id, 1); assert.equal(bundleCardChoice(f, 3).id, 1);
  assert.equal(resolveProductAssets({ variants: [{ id: 2, images: [{ imageUrl: "/uploads/test.png" }] }] }, "http://localhost:3000/api").variants[0].images[0].imageUrl, "http://localhost:3000/uploads/test.png");
});
test("narrow cards place the native selector below the price and keep the desktop option", async () => {
  const card = await readFile(new URL("../src/components/ProductFamilyCard.jsx", import.meta.url), "utf8");
  assert.match(card, /w-full max-w-full flex-none/);
  assert.match(card, /sm:ml-auto sm:w-auto/);
  assert.match(card, /min-h-11/);
  assert.match(card, /selected.id/);
});
test("one guarded administrative request, recovery, original cards and concrete cart controls", async () => {
  const form = await readFile(new URL("../src/components/ProductBundleEditor.jsx", import.meta.url), "utf8");
  assert.match(form, /guard.current = true/); assert.match(form, /saveProductBundleRequest\(frozen.current\)/); assert.match(form, /sessionStorage.setItem/); assert.match(form, /expectedRevision|bundlePayload/); assert.match(form, /Consultar resultado/);
  const page = await readFile(new URL("../src/pages/ProductsPage.jsx", import.meta.url), "utf8"); assert.match(page, /canManage && bundleEditor/);
  const card = await readFile(new URL("../src/components/ProductFamilyCard.jsx", import.meta.url), "utf8"); assert.match(card, /<CardView product=\{selected\}/); assert.match(card, /<select aria-label=/);
});

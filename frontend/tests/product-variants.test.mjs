import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { selectExistingVariant, variantLabel, variantAvailability, variantOptionState, familyVariantDescription } from "../src/helpers/productVariants.js";
import { familyBody, familyDraft } from "../src/helpers/productFamilyForm.js";

const sku = (id, color, size, extra = {}) => ({ id, status: true, availableStock: 10, variantValues: [
  { attributeId: 1, attribute: "Color", optionId: color, label: String(color) },
  { attributeId: 2, attribute: "Medida", optionId: size, label: String(size) },
], ...extra });
const variants = [sku(100, 10, 20), sku(101, 11, 21), sku(102, 11, 22, { status: false }), sku(103, 10, 22, { inStoreOnly: true })];

test("selection only returns existing concrete variants, including sparse combinations", () => {
  assert.equal(selectExistingVariant(variants, variants[0], 1, 11).id, 101);
  assert.equal(selectExistingVariant(variants, variants[3], 1, 11).id, 102);
  assert.equal(selectExistingVariant(variants, variants[1], 2, 20).id, 100);
  assert.equal(selectExistingVariant(variants, variants[0], 1, 999), null);
  assert.equal(variantLabel(variants[0]), "Color: 10 · Medida: 20");
});
test("availability distinguishes inactive, in-store, sold out and online SKUs", () => {
  assert.equal(variantAvailability(variants[0]), "Disponible online");
  assert.equal(variantAvailability(variants[2]), "Inactiva");
  assert.equal(variantAvailability(variants[3]), "Solo presencial");
  assert.equal(variantAvailability({ status: true, availableStock: 0, currentStock: 100 }), "Agotada");
});

test("demo detail keeps specifications without repeating its long disclaimer", () => {
  assert.deepEqual(familyVariantDescription("Descripción comercial existente."), { demo: false, text: "Descripción comercial existente." });
  const data = familyVariantDescription("DEMOSTRACIÓN: precio, existencias y disponibilidad ficticios; no representan datos comerciales reales de Comercializadora FYF SpA. Ancho 2 pulgadas. Modelo/referencia: X. Fuente: catálogo.");
  assert.equal(data.demo, true); assert.equal(data.text, "Ancho 2 pulgadas.");
});
test("family cards purchase/favorite only the selected concrete SKU, not the family", async () => {
  const card = await readFile(new URL("../src/components/ProductFamilyCard.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(card, /ProductPurchaseControls|FavoriteButton/);
  assert.match(card, /<CardView product=\{selected\}/);
  assert.match(card, /value=\{selected.id\}/);
  const detail = await readFile(new URL("../src/pages/ProductFamilyPage.jsx", import.meta.url), "utf8");
  assert.match(detail, /selected.status && <ProductPurchaseControls key=\{selected.id\} product=\{selected\}/);
  assert.match(detail, /<fieldset key=\{attribute.id\}/);
  assert.doesNotMatch(detail, /<select|Ver todas las combinaciones|<details/);
  assert.match(detail, /disabled=\{!option.available\}/);
  assert.match(detail, /option.reason/);
  assert.match(detail, /aria-live="polite"/);
  assert.match(detail, /aria-pressed/);
  assert.match(detail, /max-\[860px\]:grid-cols-1/);
});

test("chips distinguish unavailable real combinations and adjust sparse selections explicitly", () => {
  const color = variantOptionState(variants, variants[0], 1, 11);
  assert.equal(color.variant.id, 101); assert.equal(color.adjusted, true); assert.equal(color.available, true);
  const unavailable = variantOptionState(variants, variants[3], 1, 11);
  assert.equal(unavailable.variant.id, 101); assert.equal(unavailable.available, true); assert.equal(unavailable.adjusted, true);
  const inactiveOnly = variantOptionState([variants[2]], variants[2], 1, 11);
  assert.equal(inactiveOnly.available, false); assert.equal(inactiveOnly.reason, "Inactiva");
  const store = variantOptionState(variants, variants[0], 2, 22);
  assert.equal(store.available, false); assert.equal(store.reason, "Solo presencial");
  assert.equal(variantOptionState(variants, variants[0], 2, 999), null);
  const soldOut = sku(104, 10, 23, { availableStock: 0 });
  assert.equal(variantOptionState([...variants, soldOut], variants[0], 2, 23).reason, "Agotada");
  // Switching a single-attribute family also resolves a concrete product ID.
  assert.equal(variantOptionState(variants.map((v) => ({ ...v, variantValues: v.variantValues.slice(0, 1) })), variants[0], 1, 11).variant.id, 101);
});

test("sold-out intersections cannot prevent reaching another available combination", () => {
  const grid = [sku(1, 10, 20), sku(2, 10, 21, { availableStock: 0 }), sku(3, 11, 20, { inStoreOnly: true }), sku(4, 11, 21)];
  const color = variantOptionState(grid, grid[0], 1, 11);
  assert.equal(color.available, true); assert.equal(color.variant.id, 4); assert.equal(color.adjusted, true);
  const size = variantOptionState(grid, grid[0], 2, 21);
  assert.equal(size.available, true); assert.equal(size.variant.id, 4); assert.equal(size.adjusted, true);
});

test("bundle helpers preserve family identity and support new generic attributes", () => {
  const family = { id: 4, name: "Brochas", categoryId: 2, brand: "Lizcal", attributes: [{ id: 8, name: "Ancho", options: [{ id: 9, label: "2 pulgadas" }] }] };
  const draft = familyDraft(family);
  assert.equal(draft.attributes[0].optionsText, "2 pulgadas");
  draft.attributes[0].optionsText += "\n3 pulgadas";
  const updated = familyBody(draft, family, { categoryId: 99, brand: "No sustituir" });
  assert.equal(updated.categoryId, 2); assert.equal(updated.brand, "Lizcal");
  assert.equal(updated.attributes[0].id, 8); assert.equal(updated.attributes[0].options[0].id, 9);
  assert.equal(updated.attributes[0].options[1].id, undefined);
  const created = familyBody({ ...familyDraft(), name: "Mallas", attributes: [{ name: "Color", options: [], optionsText: "Verde\nNegro" }, { name: "Medida", options: [], optionsText: "5 m\n10 m" }] }, null, { categoryId: "3", brand: "" });
  assert.equal(created.categoryId, 3); assert.equal(created.brand, null); assert.equal(created.attributes.length, 2);
  const empty = familyDraft();
  assert.equal(empty.description, ""); assert.equal(empty.attributes[0].optionsText, "");
  assert.deepEqual(familyBody(empty, null, { categoryId: 1 }).attributes[0].options, []);
});

test("unified editor replaces legacy management while protected maintenance endpoints remain", async () => {
  const page = await readFile(new URL("../src/pages/ProductsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /ProductFamilyManager|ProductVariantFields|ProductFamilyTools/);
  assert.match(page, /canManage && bundleEditor/);
  const editor = await readFile(new URL("../src/components/ProductBundleEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /saveProductBundleRequest\(frozen.current\)/);
  assert.match(editor, /Vista previa del catálogo/);
  const routes = await readFile(new URL("../../backend/src/modules/productFamilies/productFamilies.routes.ts", import.meta.url), "utf8");
  assert.match(routes, /router.use\(authenticateJwt, verifyRoles\(\["ADMIN"\]\)\)/);
  assert.match(routes, /validateDetachFamilyBody\(req.body\)/);
  assert.match(routes, /setFamilyArchived\(id, action === "archive", req.user!.id, body.expectedUpdatedAt\)/);
  assert.match(routes, /handleErrorClient\(res, 405/);
});

test("loading overlay reuses its indicator without changing its accessible container", async () => {
  const source = await readFile(new URL("../src/components/LoadingOverlay.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/className="app-loading-indicator"/g) || []).length, 1);
  assert.match(source, /<LoadingIndicator \/>/);
  for (const attribute of ['role="status"', 'aria-live="polite"', 'aria-atomic="true"', 'aria-label="Cargando"']) assert.ok(source.includes(attribute));
});

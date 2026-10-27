import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleDraft, resumeBundleDraft, simpleDraftFromBundle, simpleProductPayload, setBundleRowOption } from "../src/helpers/productBundleForm.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("simple and family creation reuse category and unit search rather than parallel controls", async () => {
  const page = await read("pages/ProductsPage.jsx"), editor = await read("components/ProductBundleEditor.jsx"), fields = await read("components/ProductFormFields.jsx");
  for (const source of [page, editor]) { assert.match(source, /<ProductCategoryField/); assert.match(source, /<ProductUnitField/); }
  assert.doesNotMatch(editor, /<select/);
  assert.match(fields, /role="combobox"/); assert.match(fields, /aria-activedescendant/);
  assert.match(fields, /event.key === "Escape"/); assert.match(fields, /event.stopPropagation/);
  assert.match(fields, /event.key === "Enter"/); assert.match(fields, /category.id, `#\$\{category.id\}`/);
});

test("mode buttons have two fixed equal columns at every breakpoint", async () => {
  const page = await read("pages/ProductsPage.jsx"), css = await read("styles/styles.css");
  assert.match(page, /product-mode-switch[^\n]*grid-cols-2/);
  assert.match(css, /\.product-mode-switch > button[^}]*width: 100%[^}]*margin: 0 !important/);
  assert.match(css, /\.product-mode-switch > button\[aria-pressed="true"\][^}]*var\(--color-rust-500\)/);
});

test("one new variant opens the shared centered decision before field validation, without a write", async () => {
  const editor = await read("components/ProductBundleEditor.jsx"), modal = await read("components/AppModal.jsx"), page = await read("pages/ProductsPage.jsx");
  assert.match(editor, /<AppModal open=\{singleVariant\} title="Solo has configurado una variante"/);
  assert.match(editor, /!draft.familyId && !draft.conversion && draft.rows.length < 2/);
  assert.ok(editor.indexOf("setSingleVariant(true)") < editor.indexOf("const invalidControl"));
  assert.match(editor, /onDialogChange\?\.\(singleVariant \|\|/);
  assert.match(page, /onDialogChange=\{setBundleDialogActive\}/);
  assert.match(modal, /activeModalLocks.delete\(lock\)/); assert.match(modal, /lastFocusedRef/);
  assert.match(modal, /!dialogRef.current.contains\(document.activeElement\)/);
});

test("explicit draft conversion retains initial stock, unit, individual details and images without persistence", () => {
  const base = { name: "Pintura", brand: "FYF QA", categoryId: 1, description: "General", unitMeasure: "tarro", price: 1000, initialStock: 12, minimumStock: 3, status: true };
  let draft = resumeBundleDraft(bundleDraft(null, base), base);
  draft.attributes[0].name = "Color";
  draft = setBundleRowOption(draft, draft.rows[0].key, 0, "Azul");
  const common = { name: "general.png" }, specific = { name: "azul.png" };
  draft.rows[0].files = [specific]; draft.rows[0].description = "Solo azul";
  const simple = simpleDraftFromBundle(draft, [common]);
  assert.equal(simple.fields.initialStock, 12); assert.equal(simple.fields.unitMeasure, "tarro"); assert.equal(simple.fields.description, "Solo azul");
  assert.deepEqual(simple.files, [common, specific]);
  const body = simpleProductPayload(simple.fields, "stable-operation", simple.files);
  assert.equal(body.variants.length, 1); assert.equal(body.variants[0].initialStock, 12); assert.deepEqual(body.family.attributes, []);
});

test("description is full width; inventory fields share a row and the secondary unit stays protected", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.match(editor, /<label>Descripción individual[^\n]*<\/label>\s*<div className="variant-inventory-fields grid min-w-0 items-start gap-3 sm:grid-cols-2">/);
  assert.match(editor, /<details data-individual-settings/);
  assert.match(editor, /Configuración individual · Unidad:/);
  assert.match(editor, /disabled=\{row.hasHistory \|\| row.isOriginal\}/);
  assert.match(editor, /row.id \? <VariantStockSummary product=\{savedStock.current.get\(row.id\)\}/);
  assert.match(editor, /Al guardar se registra una entrada si es mayor que cero/);
});

test("family catalog only uses selected article photos and removes its demo sentence, not stock disclaimer", async () => {
  const page = await read("pages/ProductFamilyPage.jsx"), editor = await read("components/ProductBundleEditor.jsx");
  assert.match(page, /images=\{selected.images \|\| \[\]\}/);
  assert.doesNotMatch(page, /Catálogo de demostración: precios y existencias ficticios/);
  assert.match(page, /Agregar al carrito no reserva stock/);
  assert.match(editor, /<ProductImagesManager compact disabled=\{locked\} pendingFiles=\{commonFiles\}/);
  assert.match(editor, /no existe una galería general compartida/);
});

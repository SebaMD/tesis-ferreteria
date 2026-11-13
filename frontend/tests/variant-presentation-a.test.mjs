import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleDraft, bundlePayload, newBundleRow, setBundleRowOption } from "../src/helpers/productBundleForm.js";
import { variantOptionState } from "../src/helpers/productVariants.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("duplicate feedback identifies option controls and retains both concrete draft keys", () => {
  let draft = bundleDraft(null, { name: "Pintura", categoryId: 1, unitMeasure: "unidad", price: 1000 });
  draft.attributes[0].name = "Color";
  draft = setBundleRowOption(draft, draft.rows[0].key, 0, "Azul");
  const second = newBundleRow(1, { price: 1000 }); draft.rows.push(second);
  draft = setBundleRowOption(draft, second.key, 0, "Azul");
  assert.throws(() => bundlePayload(draft, "operation-key", [], []), error => {
    assert.equal(error.field, "selections"); assert.equal(error.section, "variants");
    assert.deepEqual(error.variantKeys, draft.rows.map(row => row.key)); return true;
  });
});

test("contextual messages are structured, linked to controls, and only the persistent message announces", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.match(editor, /setErrorTarget\(\{ section: location, variantKeys:/);
  assert.match(editor, /contextualError && errorTarget.section === "variants" && errorNotice/);
  assert.match(editor, /modalOpen && !contextualError && errorNotice/);
  assert.match(editor, /"aria-invalid": true, "aria-describedby": errorId/);
  assert.match(editor, /variant-has-error/); assert.match(editor, /Revisar variante/);
  assert.equal((editor.match(/role="alert"/g) || []).length, 1);
  assert.match(editor, /toast.error\(<span aria-hidden="true">\{message\}<\/span>/);
  assert.match(editor, /unitProblem\?\.field === "unitMeasure"/);
  assert.match(editor, /variantKey:affected.key,field:"unitMeasure"/);
  assert.match(editor, /setErrorMessage\(message\); setErrorTarget\(null\)/);
});

test("new conversion data order stays vertical with an optional barcode after stock", async () => {
  const summary = await read("components/ProductConversionSummary.jsx");
  const card = summary.slice(summary.indexOf("{newRows.map"), summary.indexOf("</article>"));
  assert.ok(card.indexOf("Precio:") < card.indexOf("Stock mínimo:"));
  assert.ok(card.indexOf("Stock mínimo:") < card.indexOf("Stock inicial:"));
  assert.ok(card.indexOf("Stock inicial:") < card.indexOf("Código:"));
  assert.doesNotMatch(card, /grid-cols-2/);
  assert.match(summary, /Number\(original.price\) !== Number\(originalRow.price\)/);
});

test("individual unit stays visible in inventory, preserves history restrictions and field feedback", async () => {
  const editor = await read("components/ProductBundleEditor.jsx"), fields = await read("components/ProductFormFields.jsx");
  assert.match(editor, /label="Unidad individual"/);
  assert.match(editor, /value=\{row.unitMeasure\?\?draft.unitMeasure\}/);
  assert.match(editor, /Unidad protegida por ventas, pedidos o movimientos de inventario, incluidas entradas/);
  assert.match(editor, /disabled=\{locked\|\|row.hasHistory\|\|row.isOriginal\}/);
  assert.match(editor, /inputProps=\{\{"data-bundle-field":"unitMeasure",\.\.\.fieldFeedback/);
  assert.match(editor, /editIcon=\{!\(row.hasHistory\|\|row.isOriginal\)\}/);
  assert.match(fields, /<input \{\.\.\.inputProps\} id=\{id\}/);
});

test("different saved units survive shared-default changes without introducing stock writes", () => {
  const family = { id: 1, name: "Familia", categoryId: 1, brand: null, attributes: [{ id: 3, name: "Presentación", options: [{ id: 5, label: "A" }, { id: 6, label: "B" }] }] };
  const draft = bundleDraft({ family, revision: "rev", variants: ["unidad", "caja"].map((unitMeasure, index) => ({ id: 10 + index, name: `Artículo ${index}`, unitMeasure, price: 1000, minimumStock: 5, currentStock: 8, status: true, variantOptionIds: [5 + index], images: [] })) });
  draft.unitMeasure = "rollo";
  const body = bundlePayload(draft, "same-operation", [], []);
  assert.deepEqual(body.variants.map(row => row.unitMeasure), ["unidad", "caja"]);
  assert.deepEqual(body.variants.map(row => row.id), [10, 11]);
  assert.ok(body.variants.every(row => row.currentStock === undefined && row.initialStock === undefined));
});

test("catalog groups wrap without changing the concrete-variant selection algorithm", async () => {
  const page = await read("pages/ProductFamilyPage.jsx"), css = await read("styles/styles.css");
  assert.match(page, /catalog-attribute-groups/); assert.match(page, /<fieldset key=\{attribute.id\}/);
  assert.match(page, /<legend/); assert.match(page, /col-span-full[^\n]*role="status"/);
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/);
  assert.match(css, /\.bundle-general-fields \.product-lookup-field \{ row-gap: 7px/);
  const variants = [
    { id: 1, status: true, currentStock: 5, variantValues: [{ attributeId: 1, optionId: 10 }, { attributeId: 2, optionId: 20 }] },
    { id: 2, status: true, currentStock: 5, variantValues: [{ attributeId: 1, optionId: 11 }, { attributeId: 2, optionId: 21 }] },
  ];
  const option = variantOptionState(variants, variants[0], 1, 11);
  assert.equal(option.variant.id, 2); assert.equal(option.adjusted, true);
  assert.equal(variantOptionState(variants, variants[0], 1, 99), null);
});

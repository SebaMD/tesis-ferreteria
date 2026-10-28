import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { conversionDraft, bundleDraft, bundlePayload, newBundleRow, setBundleRowOption, resumeConversionDraft } from "../src/helpers/productBundleForm.js";

const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const original = { id: 98, name: "Pintura azul", brand: "Marca", categoryId: 1, price: 1000, barcode: "123", currentStock: 8, minimumStock: 2, unitMeasure: "unidad", status: true, hasHistory: true, images: [{ id: 10, isPrimary: true }] };
function conversion() {
  let draft = conversionDraft({ product: structuredClone(original), revision: "original-revision" });
  draft.conversion.reason = "Motivo explícito de conversión";
  draft.attributes[0].name = "Color";
  draft = setBundleRowOption(draft, draft.rows[0].key, 0, "Azul");
  const next = newBundleRow(1, original);
  draft.rows.push(next);
  return setBundleRowOption(draft, next.key, 0, "Verde");
}

test("conversion steps are presentation-only and retain the same mounted draft and expected revision", async () => {
  const editor = await read("components/ProductBundleEditor.jsx"), page = await read("pages/ProductsPage.jsx");
  const navigation = editor.slice(editor.indexOf("function continueConversion()"), editor.indexOf("function addVariant()"));
  assert.match(navigation, /length < 8 \|\| length > 500/);
  assert.match(navigation, /setConversionStep\("configure"\)/);
  assert.doesNotMatch(navigation, /setDraft|saveProductBundle|conversionDraft|getProductConversion/);
  assert.match(editor, /hidden=\{conversionStep !== "prepare"\}/);
  assert.match(editor, /Volver a preparar conversión/);
  assert.match(page, /editingProductId && variantsEnabled \? "Convertir producto en variantes"/);
  const draft = conversion(), photo = { name: "pendiente.png" };
  draft.rows[0].files = [photo];
  const resumed = resumeConversionDraft(draft, { price: 1200 });
  assert.equal(resumed.conversion, draft.conversion);
  assert.equal(resumed.conversion.expectedRevision, "original-revision");
  assert.deepEqual(resumed.rows[0].selections, draft.rows[0].selections);
  assert.equal(resumed.rows[0].files[0], photo);
  assert.deepEqual(resumed.rows[0].images, original.images);
});

test("duplicate combinations identify both concrete rows without interpreting error text", () => {
  let draft = conversion();
  draft = setBundleRowOption(draft, draft.rows[1].key, 0, "Azul");
  assert.throws(() => bundlePayload(draft, "operation-key", [], []), error => {
    assert.equal(error.section, "variants");
    assert.deepEqual(error.variantKeys, draft.rows.map(row => row.key));
    assert.equal(error.variantKey, draft.rows[1].key);
    return true;
  });
});

test("attribute validation carries presentation metadata without relaxing its rejection", () => {
  const draft = conversion();
  draft.attributes[0].name = " ";
  assert.throws(() => bundlePayload(draft, "operation-key", [], []), error => error.section === "attributes");
  draft.conversion.reason = "corto";
  assert.throws(() => bundlePayload(draft, "operation-key", [], []), error => error.section === "prepare");
});

test("one error notification per attempt, native validation focuses only the first invalid control", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.equal((editor.match(/toast.error\(/g) || []).length, 1);
  assert.match(editor, /id: `\$\{pendingKey\}-error`/);
  assert.match(editor, /\.find\(control => control.willValidate && !control.validity.valid\)/);
  assert.doesNotMatch(editor, /onInvalidCapture|\.reportValidity\(/);
  assert.match(editor, /scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(editor, /destination\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(editor, /ref=\{errorRef\} tabIndex=\{-1\} role="alert"/);
  assert.match(editor, /e.response \? \{\} : e/);
});

test("confirmation separates original, new rows, reason and summary using the existing draft helpers", async () => {
  const summary = await read("components/ProductConversionSummary.jsx"), editor = await read("components/ProductBundleEditor.jsx");
  for (const label of ["Producto original conservado", "Variantes nuevas", "Motivo de conversión", "Resumen de conversión"]) assert.ok(summary.includes(label));
  assert.match(summary, /Number\(original.price\) !== Number\(originalRow.price\)/);
  assert.match(summary, /original.barcode \|\| ""\) !== \(originalRow.barcode/);
  assert.match(summary, /overflow-wrap:anywhere/);
  assert.match(summary, /whitespace-pre-wrap/);
  assert.match(summary, /row.unitMeasure \?\? draft.unitMeasure/);
  assert.match(editor, /<ProductConversionSummary draft=\{draft\}/);
  assert.match(editor, /onClose=\{backFromConfirmation\}/);
  assert.match(editor, /formRef.current\?\.querySelector\('button\[type="submit"\]'\)/);
  assert.match(editor, /size=\{draft.conversion \? "large" : "small"\}/);
  const draft = conversion();
  draft.rows[0].price = 1200; draft.rows[0].barcode = "456";
  const body = bundlePayload(draft, "operation-key", [], []);
  assert.equal(body.conversion.confirmed, true);
  assert.equal(body.conversion.expectedRevision, "original-revision");
  assert.equal(body.variants[0].id, original.id);
  assert.equal(body.variants[0].price, 1200);
  assert.equal(body.variants[0].initialStock, undefined);
  assert.equal(body.variants[0].currentStock, undefined);
});

test("stock columns are balanced, restrictions remain enforced and recovery still uses the frozen operation", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.match(editor, /variant-inventory-fields grid min-w-0 items-start gap-3 sm:grid-cols-2/);
  assert.match(editor, /disabled=\{hasExisting\}/);
  assert.match(editor, /disabled=\{locked \|\| \(definitionLocked && !familyId\)\}/);
  assert.match(editor, /disabled=\{row.hasHistory && !row.isOriginal\}/);
  assert.match(editor, /saveProductBundleRequest\(frozen.current\)/);
  assert.match(editor, /getProductBundleOperationRequest\(key\)/);
  assert.match(editor, /setUncertain\(true\); setCanRetry\(true\)/);
  assert.match(editor, /sessionStorage.setItem\(pendingKey, body.operationKey\)/);
  const single = bundleDraft(null, original);
  assert.throws(() => bundlePayload(single, "key", [], []), /sola variante/);
});

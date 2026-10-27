import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getStockStatus } from "../src/helpers/inventory.js";
import { bundleDraft, bundlePayload, setBundleRowOption } from "../src/helpers/productBundleForm.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("existing attributes start collapsed, creation/conversion remain open and hiding never removes fields", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.match(editor, /\[attributesOpen, setAttributesOpen\] = useState\(!familyId\)/);
  assert.match(editor, /hidden=\{!attributesOpen\}/);
  assert.match(editor, /aria-expanded=\{attributesOpen\}/);
  assert.match(editor, /aria-controls="bundle-attribute-fields"/);
  assert.match(editor, /section === "attributes"\) setAttributesOpen\(true\)/);
  assert.match(editor, /control.willValidate && !control.validity.valid/);
  assert.match(editor, /catch \(err\) \{ setAttributesOpen\(true\)/);
  assert.match(editor, /if\(status === 409\) setConflict\(true\);\s*setAttributesOpen\(true\)/);
});

test("stock status preserves existing rules at zero, negative, below/equal/above minimum", () => {
  for (const [currentStock, minimumStock, tone] of [[0,5,"critical"],[-1,5,"critical"],[2,5,"warning"],[5,5,"warning"],[6,5,"success"],[1,0,"success"]]) {
    assert.equal(getStockStatus({currentStock,minimumStock}, "ADMIN").tone, tone);
  }
});

test("stock indicator reads saved snapshots, not pending minimum or unit, and has non-color labels", async () => {
  const editor = await read("components/ProductBundleEditor.jsx"), view = await read("components/VariantStockSummary.jsx");
  assert.match(editor, /savedStock.current=stockSnapshots\(data.variants\)/);
  assert.match(editor, /savedStock.current=stockSnapshots\(\[data.product\]\)/);
  assert.match(editor, /savedStock.current=stockSnapshots\(id \? data.variants : \[data.product\]\)/);
  assert.match(view, /getStockStatus\(product, "ADMIN"\)/);
  assert.doesNotMatch(view, /Mínimo guardado al cargar/);
  assert.match(view, /minimumChanged && <span[^>]*>Estado según el mínimo guardado/);
  assert.match(view, /Stock actual guardado al cargar el artículo/);
  for (const label of ["Sin stock", "A reponer", "Stock suficiente"]) assert.ok(view.includes(label));
  assert.doesNotMatch(view, /<input|onChange|onClick/);
});

test("minimum and stock controls use flexible minimum heights and actions stay separate", async () => {
  const editor = await read("components/ProductBundleEditor.jsx"), summary = await read("components/VariantStockSummary.jsx");
  assert.match(editor, /variant-inventory-fields[^\n]*items-start/);
  assert.match(editor, /Stock mínimo<input[^\n]*className="min-h-10.25"/);
  assert.match(summary, /min-h-10.25/);
  assert.doesNotMatch(editor, /className="h-10.25"/);
  assert.match(editor, /htmlFor=\{`initial-stock-\$\{row.key\}`\}/);
  assert.match(editor, /<div className="variant-stock-actions flex/);
});

test("snapshot presentation does not change payload, stock persistence or protected fields", () => {
  const options=[{id:5,label:"Azul"}];
  const snapshot={revision:"r",family:{id:1,name:"Pintura",description:null,brand:"Marca",categoryId:1,attributes:[{id:2,name:"Color",options}]},variants:[{id:9,name:"Azul",price:"1000",currentStock:5,minimumStock:5,unitMeasure:"unidad",status:true,variantOptionIds:[5],images:[]}]};
  let draft=bundleDraft(snapshot);draft.rows[0].minimumStock="50";
  draft=setBundleRowOption(draft,draft.rows[0].key,0,"Azul");
  const payload=bundlePayload(draft,"operation-key",[],[]);
  assert.equal(payload.variants[0].id,9);assert.equal(payload.variants[0].minimumStock,50);
  assert.equal(payload.variants[0].initialStock,undefined);assert.equal(payload.variants[0].currentStock,undefined);
  assert.equal(snapshot.variants[0].currentStock,5);assert.equal(snapshot.variants[0].minimumStock,5);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleDraft, bundlePayload, bundleRowName, newBundleRow, newBundleAttribute, setBundleRowOption, conversionDraft } from "../src/helpers/productBundleForm.js";

test("inline options retain base fields, suggest names and store only confirmed rows", () => {
  let d = bundleDraft(null, { name:"Lubricante Rex 40", categoryId:1, price:2500, minimumStock:2, barcode:"991", description:"Conservada", unitMeasure:"unidad", inStoreOnly:true });
  d.attributes[0].name="Presentación";
  d=setBundleRowOption(d,d.rows[0].key,0,"400 ");
  assert.equal(d.rows[0].optionTexts[0],"400 ");
  const key=d.rows[0].selections[0];d=setBundleRowOption(d,d.rows[0].key,0,"400 ml");assert.equal(d.rows[0].selections[0],key);
  assert.equal(bundleRowName(d,d.rows[0]),"Lubricante Rex 40 de 400 ml");
  assert.equal(d.rows[0].price,2500);assert.equal(d.rows[0].barcode,"991");assert.equal(d.rows[0].inStoreOnly,true);assert.equal(d.rows[0].useCommon,true);
  d.rows.push(newBundleRow(1,d));d=setBundleRowOption(d,d.rows[1].key,0,"150 ml");d.rows[1].price=1700;
  const p=bundlePayload(d,"key",[],[]);assert.equal(p.variants.length,2);assert.equal(p.variants[1].barcode,null);assert.equal(p.family.description,"Conservada");
  assert.equal(p.variants[1].name,"Lubricante Rex 40 de 150 ml");
  d.rows[1].name="Nombre propio";d.rows[1].nameCustomized=true;d=setBundleRowOption(d,d.rows[1].key,0,"200 ml");assert.equal(bundleRowName(d,d.rows[1]),"Nombre propio");
  d=setBundleRowOption(d,d.rows[1].key,0,"400 ml");assert.throws(()=>bundlePayload(d,"key",[],[]),/repetidas/);
});
test("multiple inline attributes and conversion preserve original identity without ENTRY",()=>{
  const p={id:71,name:"Original 400 ml",categoryId:1,brand:null,unitMeasure:"unidad",price:1000,currentStock:8,minimumStock:1,status:true};
  let d=conversionDraft({product:p,revision:"a".repeat(64)});d.attributes[0].name="Presentación";d.conversion.reason="Agrupación de presentaciones";
  d=setBundleRowOption(d,d.rows[0].key,0,"400 ml");d.rows.push(newBundleRow(1,p));d=setBundleRowOption(d,d.rows[1].key,0,"150 ml");
  d.attributes.push({...newBundleAttribute(),name:"Color"});d.rows.forEach(r=>r.selections.push(""));
  d=setBundleRowOption(d,d.rows[0].key,1,"Rojo");d=setBundleRowOption(d,d.rows[1].key,1,"Azul");
  const body=bundlePayload(d,"key",[],[]);assert.equal(body.variants[0].id,71);assert.equal(body.variants[0].name,p.name);assert.equal(body.variants[0].initialStock,undefined);assert.equal(d.rows[0].currentStock,8);
  assert.equal(body.family.attributes.length,2);assert.equal(body.variants.length,2);assert.equal(body.variants[1].name,"Original de 150 ml · Azul");
});
test("legacy family tools are outside both main editors and row actions do not add inventory writes",async()=>{
 const read=p=>readFile(new URL(`../src/${p}`,import.meta.url),"utf8");
 const editor=await read("components/ProductBundleEditor.jsx"),page=await read("pages/ProductsPage.jsx"),table=await read("components/GroupedInventoryTable.jsx");
 assert.doesNotMatch(editor,/Administración avanzada|Crear nueva familia|Administrar familias y atributos|Opciones, una por línea/);
 assert.doesNotMatch(page,/<ProductVariantFields|Administración avanzada/);assert.match(editor,/Opción de/);assert.match(editor,/setBundleRowOption/);
 assert.ok(page.indexOf('onClick={openVariants}')>page.indexOf("onMove={handleMoveProductImage}"));
 assert.doesNotMatch(table,/createInventoryMovement|onMovement/);assert.match(page,/Registrar entrada/);assert.match(page,/Ajuste administrativo/);
});

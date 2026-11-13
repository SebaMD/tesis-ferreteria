import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createCatalogLoader } from "../src/helpers/catalogLoading.js";
import { bundleDraft, bundlePayload, bundleRowName, reconcileAttributeOptions } from "../src/helpers/productBundleForm.js";
const read = p => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
test("foreground loading cannot be superseded by focus/timer; stale requests cannot unlock or publish", async () => {
  const requests=[], results=[], events=[];
  const loader=createCatalogLoader({request: signal => {const d=deferred();requests.push({...d,signal});return d.promise;},start:()=>events.push("start"),success:x=>results.push(x),failure:()=>events.push("error"),finish:()=>events.push("finish")});
  const a=loader.load({blocking:true});await loader.load();assert.equal(requests.length,1);
  const b=loader.load({blocking:true});assert.equal(requests[0].signal.aborted,true);
  requests[0].resolve("old");await a;assert.deepEqual(results,[]);assert.equal(events.includes("finish"),false);
  requests[1].resolve("new");await b;assert.deepEqual(results,["new"]);assert.deepEqual(events,["start","start","finish"]);
  const c=loader.load();requests[2].resolve("silent");await c;assert.equal(events.filter(x=>x==="start").length,2);
  loader.dispose();await loader.load();assert.equal(requests.length,3);
  const d=loader.load({blocking:true});requests[3].resolve("strict-mode-remount");await d;assert.equal(results.at(-1),"strict-mode-remount");
});
test("timeout/error releases the catalog and a retry can succeed",async()=>{
  const events=[];let fail=true;
  const loader=createCatalogLoader({timeoutMs:10,request:signal=>fail?new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(new Error("timeout")))):Promise.resolve("ok"),start:()=>{},success:x=>events.push(x),failure:(_,{timedOut})=>events.push(timedOut),finish:()=>events.push("released")});
  await loader.load({blocking:true});assert.deepEqual(events,[true,"released"]);fail=false;await loader.load({blocking:true});assert.deepEqual(events,[true,"released","ok","released"]);
});
test("stable draft options preserve selected combinations across reorder, removal and reinsertion",()=>{
  const draft=bundleDraft(null,{name:"Lubricante",categoryId:1,description:"Conservada",unitMeasure:"unidad"});
  draft.attributes[0]=reconcileAttributeOptions({...draft.attributes[0],name:"Presentación"},"150 ml\n400 ml");
  draft.rows[0].selections=[draft.attributes[0].draftOptions[1].key];draft.rows[0].price=1000;
  draft.rows.push({...draft.rows[0],key:"second-row",selections:[draft.attributes[0].draftOptions[0].key]});
  assert.equal(bundleRowName(draft,draft.rows[0]),"Lubricante de 400 ml");
  draft.attributes[0]=reconcileAttributeOptions(draft.attributes[0],"400 ml\n150 ml");
  assert.deepEqual(bundlePayload(draft,"key",[],[]).variants[0].selections,[0]);
  draft.name="Nuevo nombre";assert.equal(bundleRowName(draft,draft.rows[0]),"Nuevo nombre de 400 ml");
  draft.rows[0].name="Mi nombre";draft.rows[0].nameCustomized=true;draft.name="Otro";assert.equal(bundleRowName(draft,draft.rows[0]),"Mi nombre");
  draft.attributes[0]=reconcileAttributeOptions(draft.attributes[0],"150 ml");assert.throws(()=>bundlePayload(draft,"key",[],[]));
  draft.attributes[0]=reconcileAttributeOptions(draft.attributes[0],"150 ml\n400 ml");assert.deepEqual(bundlePayload(draft,"key",[],[]).variants[0].selections,[1]);
  assert.equal(draft.description,"Conservada");
});
test("progressive form keeps drafts mounted and isolates advanced actions",async()=>{
  const page=await read("pages/ProductsPage.jsx"),editor=await read("components/ProductBundleEditor.jsx");
  assert.match(page,/Tipo de producto nuevo/); assert.match(page,/Producto con variantes<\/button>/);
  assert.match(page,/<ProductBundleEditor inline/);
  assert.match(page,/suspended=\{bundleDialogActive \|\| nameCorrectionOpen\}/);assert.match(page,/commonData=\{\{ \.\.\.form, unitMeasure: unitSearch \}\}/);
  assert.match(page,/Convertir en producto con variantes/);assert.match(editor,/Volver al producto/);assert.match(editor,/Confirmar conversión del producto/);
  assert.match(page,/pendingFiles=\{pendingProductImages\}/);assert.doesNotMatch(page,/Administración avanzada|<ProductVariantFields/);assert.match(page,/<ProductBundleEditor inline conversionId=\{editingProductId\}/);
  assert.match(page,/onClick=\{openVariants\}/); assert.match(page,/!canAddVariants && !variantsEnabled/); assert.doesNotMatch(page,/familyToolsOpen|ProductFamilyTools/);
  assert.match(editor,/Agregar otro atributo/);assert.match(editor,/Agregar otra variante/);assert.match(editor,/nameCustomized: true/);assert.match(editor,/disabled=\{locked\|\|row.hasHistory\|\|row.isOriginal\}/);
  const preview=await read("components/ProductBundlePreview.jsx");assert.match(preview,/Vista previa — sin guardar/);assert.match(preview,/URL.revokeObjectURL/);assert.match(preview,/CatalogCardSurface/);
  assert.doesNotMatch(preview,/useCart|ProductPurchaseControls|saveProduct|createOrder|productId:|promotion:/);
});
test("public loading scope includes carousel, blocks its descendants but not the navbar",async()=>{
  const scope=await read("components/CatalogLoadingScope.jsx"),page=await read("pages/CatalogPage.jsx"),carousel=await read("components/CatalogNoticeCarousel.jsx");
  assert.match(scope,/aria-busy=\{active\}/);assert.match(scope,/inert=\{active\}/);assert.match(scope,/Math.max\(rect.top, navBottom, 0\)/);
  assert.match(page,/<CatalogLoadingScope active=\{loading && !initialized\} fullPage>\s*<main/);
  assert.match(scope,/fixed inset-x-0 bottom-0/); assert.match(scope,/top: navbarBottom/);
  assert.match(page,/active=\{loading && initialized\}/);assert.doesNotMatch(page,/<LoadingOverlay/);
  assert.match(carousel,/disabled=\{paused\}/);assert.match(carousel,/reducedMotion \|\| paused/);
});

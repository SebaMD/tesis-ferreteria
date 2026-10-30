import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { bundleDraft, bundlePayload, conversionDraft, resumeConversionDraft, editBundleImages, simpleDraftFromBundle } from "../src/helpers/productBundleForm.js";
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
const snapshot = () => ({ revision: "a".repeat(64), family: { id: 3, name: "Familia", description: "General", categoryId: 1, brand: "Marca",
  attributes: [{ id: 4, name: "Color", options: [{ id: 5, label: "Azul" }, { id: 6, label: "Verde" }] }] },
  variants: [5, 6].map((option, i) => ({ id: 98+i, name: `Artículo ${i}`, description: `Individual ${i}`, unitMeasure: i ? "caja" : "unidad", price: 1000,
    currentStock: 8, minimumStock: 2, status: true, hasHistory: !i, variantOptionIds: [option], images: [{ id: 10+i*2, isPrimary: true }, { id: 11+i*2, isPrimary: false }] })) });

test("family metadata never replaces individual descriptions, units or image ownership in the payload", () => {
  const d=bundleDraft(snapshot()); d.description="Cambio general"; d.unitMeasure="nueva unidad";
  d.rows[0].description="Descripción explícita";
  const p=bundlePayload(d,"key",[],[]);
  assert.equal(p.variants[0].description,"Descripción explícita"); assert.equal(p.variants[1].description,"Individual 1");
  assert.deepEqual(p.variants.map(v=>v.unitMeasure),["unidad","caja"]);
  assert.deepEqual(p.variants[0].existingImages,{imageIds:[10,11],primaryImageId:10});
  assert.ok(p.variants.every(v=>v.initialStock===undefined)); assert.deepEqual(p.variants.map(v=>v.id),[98,99]);
});

test("saved photo edits change only the draft, retain a principal and do not mutate another row", () => {
  const d=bundleDraft(snapshot()), original=structuredClone(d.rows[0].images);
  let images=editBundleImages(d.rows[0].images,{type:"move",index:0,direction:1});
  assert.deepEqual(images.map(i=>i.id),[11,10]); assert.equal(images.find(i=>i.isPrimary).id,10);
  images=editBundleImages(images,{type:"primary",id:11}); assert.equal(images.find(i=>i.isPrimary).id,11);
  images=editBundleImages(images,{type:"remove",id:11}); assert.deepEqual(images,[{id:10,isPrimary:true,position:0}]);
  assert.deepEqual(d.rows[0].images,original); assert.deepEqual(d.rows[1].images.map(i=>i.id),[12,13]);
});

test("inline conversion carries permitted pending details, never changes original identity or adds its stock", () => {
  const original={id:98,name:"Original",brand:"Marca",categoryId:1,unitMeasure:"unidad",price:1000,currentStock:8,status:true,description:"Anterior",hasHistory:true};
  const d=conversionDraft({product:original,revision:"r"},{name:"No permitido",price:1500,description:"Pendiente",unitMeasure:"No permitido"});
  assert.equal(d.rows[0].id,98); assert.equal(d.rows[0].name,"Original"); assert.equal(d.rows[0].unitMeasure,"unidad");
  assert.equal(d.rows[0].price,1500); assert.equal(d.rows[0].description,"Pendiente"); assert.equal(d.rows[0].currentStock,8); assert.equal(d.rows[0].hasHistory,true);
  d.conversion.reason="Motivo conservado";d.rows[0].selections=["stable-option"];
  const resumed=resumeConversionDraft(d,{price:1600,description:"Actualizado al volver",name:"No permitido"});
  assert.equal(resumed.rows[0].price,1600);assert.equal(resumed.rows[0].name,"Original");assert.deepEqual(resumed.rows[0].selections,["stable-option"]);assert.equal(resumed.conversion.reason,"Motivo conservado");
});

test("returning a new draft to simple retains its explicit individual description and unit", () => {
  const d=bundleDraft(null,{name:"Producto",description:"General",unitMeasure:"unidad"});
  Object.assign(d.rows[0],{description:"Individual",unitMeasure:"caja"});
  const {fields}=simpleDraftFromBundle(d,[]); assert.equal(fields.description,"Individual");assert.equal(fields.unitMeasure,"caja");
});

test("single editor keeps separate accordions, safe conversion confirmation and no secondary individual editor", async () => {
  const editor=await read("components/ProductBundleEditor.jsx"), page=await read("pages/ProductsPage.jsx"), modal=await read("components/AppModal.jsx");
  assert.match(page,/<ProductBundleEditor inline conversionId=\{editingProductId\}/);
  assert.match(page,/Convertir en producto con variantes/); assert.match(page,/suspended=\{bundleDialogActive \|\| nameCorrectionOpen\}/);
  assert.match(modal,/if \(!open \|\| suspended\) return undefined/); assert.match(modal,/role=\{suspended \? undefined : "dialog"\}/);
  assert.match(modal,/grid place-items-center overflow-clip/);
  assert.match(editor,/new Set\(current\)/); assert.match(editor,/aria-expanded=\{expandedRows.has\(row.key\)\}/);
  assert.match(editor,/<ProductImagesManager compact/); assert.match(editor,/onDelete=.*editBundleImages/);
  assert.doesNotMatch(editor,/onEditIndividual|pendingIndividual|Imágenes y datos individuales/);
  assert.match(editor,/disabled=\{locked\|\|row.hasHistory\|\|row.isOriginal\}/);
  assert.match(editor,/disabled=\{locked \|\| \(definitionLocked && !familyId\)\}/); assert.match(editor,/Una dimensión nueva se incorpora por separado/);
});

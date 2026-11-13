import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProductBundle } from "../dist/modules/productFamilies/productBundle.service.js";
const body = () => ({ operationKey: "test-product-bundle-key-0001", family: { name: "Pintura", categoryId: 1, brand: "Prueba", attributes: [{ name: "Color", options: [{ label: "Rojo" }, { label: "Azul" }] }] }, unitMeasure: "unidad", variants: [{ name: "Pintura roja", price: 1000, selections: [0], initialStock: 3 }, { name: "Pintura azul", price: 1200, selections: [1], initialStock: 2 }] });
test("combined product validation keeps concrete independent SKUs and quantities", () => {
  const parsed = validateProductBundle(body()); assert.equal(parsed.variants.length, 2); assert.equal(parsed.variants[0].product.price, "1000.00"); assert.equal(parsed.variants[1].initialStock, 2);
});

test("simple draft uses the same validated transaction payload without family attributes or existing IDs", () => {
  const value = body(); value.simple = true; value.family.attributes = []; value.variants = [{ ...value.variants[0], selections: [] }];
  const parsed = validateProductBundle(value); assert.equal(parsed.simple, true); assert.equal(parsed.variants[0].initialStock, 3);
  for (const mutate of [b=>b.simple=false, b=>b.familyId=1, b=>b.conversion={}, b=>b.variants[0].id=5, b=>b.variants.push({...b.variants[0]}), b=>b.family.attributes=[{name:"Color",options:[{label:"Rojo"}]}]]) {
    const invalid=structuredClone(value); mutate(invalid); assert.throws(()=>validateProductBundle(invalid));
  }
});
test("reject duplicate, incomplete, fabricated combinations, barcodes and fractional stock", () => {
  for (const alter of [b => b.variants[1].selections = [0], b => b.variants[1].selections = [], b => b.variants[1].selections = [9], b => b.variants[1].initialStock = 0.5, b => b.variants.forEach(v => v.barcode = "123"), b => b.variants[0].price = 1.5, b => b.sku = "FAKE"]) {
    const value = body(); alter(value); assert.throws(() => validateProductBundle(value));
  }
});
test("existing products require revision and cannot receive direct stock assignments", () => {
  const value = body(); value.familyId = 1; assert.throws(() => validateProductBundle(value));
  value.expectedRevision = "a".repeat(64); value.variants[0].id = 12;
  assert.throws(() => validateProductBundle(value)); delete value.variants[0].initialStock;
  assert.equal(validateProductBundle(value).variants[0].id, 12);
});
test("images must be authorized and specifically assigned", () => {
  const value = body(); value.images = [{ mimeType: "image/png", data: "AAAA", authorized: false }]; assert.throws(() => validateProductBundle(value));
  value.images[0].authorized = true; value.variants[0].imageIndexes = [1]; assert.throws(() => validateProductBundle(value));
});
test("individual details and saved-image selection remain validated and legacy requests retain their shape", () => {
  assert.equal(Object.hasOwn(validateProductBundle(body()).variants[0], "details"), false);
  const value = body(); value.familyId = 1; value.expectedRevision = "a".repeat(64);
  value.variants[0].id = 12; delete value.variants[0].initialStock;
  Object.assign(value.variants[0], { description: "Individual", unitMeasure: "caja", existingImages: { imageIds: [3, 2], primaryImageId: 2 } });
  const row = validateProductBundle(value).variants[0]; assert.deepEqual(row.details, { description: "Individual", unitMeasure: "caja" });
  assert.deepEqual(row.existingImages, { imageIds: [3, 2], primaryImageId: 2 });
  for (const mutate of [v=>v.description=2, v=>v.unitMeasure="", v=>v.existingImages.imageIds=[2,2], v=>v.existingImages.primaryImageId=9, v=>v.existingImages={imageIds:[],primaryImageId:3}, v=>{delete v.id;}]) {
    const invalid=structuredClone(value); mutate(invalid.variants[0]); assert.throws(()=>validateProductBundle(invalid));
  }
});
test("conversion requires confirmed reason/revision, the original once and a new variant without stock on original",()=>{
 const value=body();value.conversion={productId:41,expectedRevision:"a".repeat(64),reason:"Agrupación administrativa",confirmed:true};value.variants[0].id=41;delete value.variants[0].initialStock;
 assert.equal(validateProductBundle(value).conversion.productId,41);
 for(const mutate of [b=>b.conversion.confirmed=false,b=>b.conversion.reason="",b=>b.conversion.expectedRevision="stale",b=>b.variants[0].id=42,b=>b.variants[0].initialStock=2,b=>b.variants.splice(1),b=>b.familyId=7]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateProductBundle(bad));}
});

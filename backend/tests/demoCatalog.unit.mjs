import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demoCategories, demoDescription, demoProducts } from "../dist/db/demo/catalog.js";

assert.equal(demoCategories.length, 8);
assert.equal(demoProducts.length, 96);
assert.deepEqual(demoCategories.map((category) => category.products.length), [12, 22, 14, 10, 14, 14, 5, 5]);
assert.equal(new Set(demoProducts.map((product) => product.key)).size, 96);
assert.equal(new Set(demoProducts.map((product) => `${product.categoryName}:${product.name.toLowerCase()}`)).size, 96);
for (const product of demoProducts) {
  assert.ok(product.name.length <= 150);
  assert.equal(product.barcode, null);
  assert.equal(typeof product.supplierCode, "string");
  assert.ok(product.supplierCode.length > 0);
  assert.ok(Number.isSafeInteger(product.demoPrice) && product.demoPrice > 0);
  assert.ok(Number.isSafeInteger(product.demoInitialStock) && product.demoInitialStock >= 0);
  assert.ok(Number.isInteger(product.source.page) && product.source.page > 0);
  assert.match(demoDescription(product), /^DEMOSTRACIÓN:/);
  assert.match(demoDescription(product), /NO código de barras/);
  assert.ok(!("familyId" in product));
}
assert.ok(demoProducts.some((product) => product.brand === null));
assert.ok(demoProducts.some((product) => !product.demoStatus));
assert.ok(demoProducts.some((product) => product.demoInitialStock === 0));
assert.ok(demoProducts.some((product) => product.demoInStoreOnly));
const reviewRoot = new URL("../../docs/seed-catalog-review/", import.meta.url);
const exported = JSON.parse(await readFile(new URL("catalog.json", reviewRoot), "utf8"));
assert.deepEqual(exported.products, demoProducts);
const images = JSON.parse(await readFile(new URL("extracted-images.json", reviewRoot), "utf8"));
assert.equal(images.length, 13);
assert.equal(new Set(images.map((image) => image.productKey)).size, 13);
for (const image of images) {
  assert.ok(demoProducts.some((product) => product.key === image.productKey && product.source.page === image.sourcePage));
  assert.equal(image.publish, false);
  assert.equal(image.rightsStatus, "PENDING_AUTHORIZATION");
  assert.match(image.file, /^images\/cot-\d+\.png$/);
  // Private, gitignored originals are optional on another developer/CI checkout.
  try {
    const bytes = await readFile(new URL(image.file, reviewRoot));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
console.log("PASS catálogo: 96 artículos trazables, 8 categorías, sin duplicados/barcodes inventados ni cantidades fraccionarias");

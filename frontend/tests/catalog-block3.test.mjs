import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_CATALOG_FILTERS as defaults, filterAndSortCatalog, getCatalogBrands, validatePriceRange } from "../src/helpers/catalogFilters.js";

const products = [
  { id: 1, name: "Zinc", categoryId: 1, categoryName: "Materiales", price: "20.00", currentStock: 10, availableStock: 0, brand: "  Marca   Uno " },
  { id: 2, name: "Árbol", categoryId: 2, categoryName: "Jardín", price: "100.00", availableStock: 4, brand: "marca uno" },
  { id: 3, name: "Cable", categoryId: 1, categoryName: "Materiales", price: "9.00", currentStock: 2, brand: null },
  { id: 4, name: "Cable", categoryId: 2, categoryName: "Jardín", price: "20.00", availableStock: 3, brand: "Otra" },
];
const ids = (filters = {}, order) => filterAndSortCatalog(products, { ...defaults, ...filters }, order).map((p) => p.id);
test("catalog: numeric price, Spanish names, stable id ties, source unmodified", () => {
  assert.deepEqual(ids({}, "price-asc"), [3, 1, 4, 2]);
  assert.deepEqual(ids({}, "price-desc"), [2, 1, 4, 3]);
  assert.deepEqual(ids({}, "name-asc"), [2, 3, 4, 1]);
  assert.deepEqual(ids({}, "name-desc"), [1, 3, 4, 2]);
  assert.deepEqual(products.map((p) => p.id), [1, 2, 3, 4]);
});
test("catalog: text/category/min/max/brand/available stock and combinations", () => {
  assert.deepEqual(ids({ search: " zinc " }), [1]);
  assert.deepEqual(ids({ categoryId: "1" }), [3, 1]);
  assert.deepEqual(ids({ minPrice: "20" }), [2, 4, 1]);
  assert.deepEqual(ids({ maxPrice: "20" }), [3, 4, 1]);
  assert.deepEqual(ids({ minPrice: "10", maxPrice: "30" }), [4, 1]);
  assert.deepEqual(ids({ brand: "MARCA UNO" }), [2, 1]);
  assert.deepEqual(ids({ availability: "in-stock" }), [2, 3, 4]);
  assert.deepEqual(ids({ availability: "in-stock", categoryId: "2", maxPrice: "30", search: "cable", brand: "Otra" }), [4]);
  assert.equal(ids({ search: "  " }).length, 4);
});
test("catalog: invalid range is explained without hiding all products", () => {
  for (const [min, max] of [["50", "10"], ["-1", ""], ["NaN", ""], [".", ""], ["1e8", ""]]) {
    assert.equal(validatePriceRange(min, max).valid, false);
    assert.equal(ids({ minPrice: min, maxPrice: max }).length, 4);
  }
  assert.deepEqual(validatePriceRange("", ""), { valid: true, min: null, max: null });
  assert.deepEqual(validatePriceRange("0", "19,50"), { valid: true, min: 0, max: 19.5 });
});
test("catalog: brand options deduplicate whitespace/case and tolerate all null", () => {
  assert.deepEqual(getCatalogBrands(products), [{ value: "marca uno", label: "Marca Uno" }, { value: "otra", label: "Otra" }]);
  assert.deepEqual(getCatalogBrands([{ brand: null }, { brand: " " }]), []);
});

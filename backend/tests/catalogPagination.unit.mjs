import assert from "node:assert/strict";
import { validateCatalogQuery } from "../dist/modules/catalog/catalog.validation.js";

const defaults = validateCatalogQuery({});
assert.equal(defaults.success, true);
assert.deepEqual(defaults.value, {
  page: 1,
  limit: 20,
  search: "",
  categoryId: null,
  brand: "",
  availability: "all",
  sort: "name-asc",
  minPrice: null,
  maxPrice: null,
  offers: false,
  promotionTypes: [],
});

for (const limit of [20, 40, 60, 100]) {
  const result = validateCatalogQuery({ page: "2", limit: String(limit) });
  assert.equal(result.success, true);
  assert.equal(result.value.limit, limit);
}

for (const query of [
  { page: "0" },
  { page: "1.5" },
  { limit: "30" },
  { availability: "hidden" },
  { sort: "newest" },
  { categoryId: "x" },
  { minPrice: "20", maxPrice: "10" },
  { minPrice: "1.999" },
]) {
  assert.equal(validateCatalogQuery(query).success, false, JSON.stringify(query));
}

const normalized = validateCatalogQuery({
  search: "  taladro   rojo ",
  brand: "  Marca   Uno ",
  categoryId: "4",
  availability: "in-stock",
  sort: "price-desc",
  minPrice: "1000",
  maxPrice: "2500.50",
  offers: "true",
});
assert.equal(normalized.success, true);
assert.deepEqual(normalized.value, {
  page: 1,
  limit: 20,
  search: "taladro rojo",
  categoryId: 4,
  brand: "marca uno",
  availability: "in-stock",
  sort: "price-desc",
  minPrice: 1000,
  maxPrice: 2500.5,
  offers: true,
  promotionTypes: [],
});

assert.equal(validateCatalogQuery({ offers: "false" }).value.offers, false);
assert.equal(validateCatalogQuery({ offers: "yes" }).success, false);
assert.deepEqual(
  validateCatalogQuery({ promotionTypes: "PERCENTAGE_DISCOUNT,BUY_2_PAY_1,PERCENTAGE_DISCOUNT" }).value.promotionTypes,
  ["PERCENTAGE_DISCOUNT", "BUY_2_PAY_1"],
);
assert.equal(validateCatalogQuery({ promotionTypes: "PERCENTAGE_DISCOUNT,UNKNOWN" }).success, false);

console.log("PASS catalog query defaults, page sizes, normalization and invalid parameters");

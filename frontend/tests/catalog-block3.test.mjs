import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CATALOG_PAGE_SIZES,
  getCatalogPageRange,
  validatePriceRange,
} from "../src/helpers/catalogFilters.js";

test("catalog pagination: allowed page sizes and visible ranges", () => {
  assert.deepEqual(CATALOG_PAGE_SIZES, [20, 40, 60, 100]);
  assert.deepEqual(getCatalogPageRange(1, 20, 0), { first: 0, last: 0 });
  assert.deepEqual(getCatalogPageRange(1, 20, 1), { first: 1, last: 1 });
  assert.deepEqual(getCatalogPageRange(1, 20, 20), { first: 1, last: 20 });
  assert.deepEqual(getCatalogPageRange(2, 20, 21), { first: 21, last: 21 });
  assert.deepEqual(getCatalogPageRange(7, 20, 122), { first: 121, last: 122 });
  assert.deepEqual(getCatalogPageRange(2, 100, 122), { first: 101, last: 122 });
});

test("catalog price drafts preserve the existing validation contract", () => {
  assert.deepEqual(validatePriceRange("1.5", "20,25"), { valid: true, min: 1.5, max: 20.25 });
  assert.equal(validatePriceRange("30", "20").valid, false);
  assert.equal(validatePriceRange("no", "20").valid, false);
  assert.deepEqual(validatePriceRange("", ""), { valid: true, min: null, max: null });
});

test("catalog page requests server-side filtering and exposes accessible navigation", async () => {
  const [page, service, pagination, navbar, filters, card, cart, checkout] = await Promise.all([
    readFile(new URL("../src/pages/CatalogPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/catalog.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CatalogPagination.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ClientNavbar.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CatalogFilters.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ClientCartPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/CheckoutPage.jsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /filterAndSortCatalog|getCatalogBrands/);
  assert.match(page, /getCatalogProductsRequest\(catalogQuery\)/);
  assert.match(service, /api\.get\("\/catalog\/products", \{ params \}\)/);
  assert.match(service, /getCatalogProductsByIdsRequest/);
  assert.match(page, /promotionTypes/);
  assert.match(page, /catalogStartRef/);
  assert.match(page, /searchWasActiveRef/);
  assert.match(page, /useRef\(Boolean\(search\.trim\(\)\)\)/);
  assert.match(page, /searchStarted = hasSearch && !searchWasActiveRef\.current/);
  assert.match(page, /location\.state\?\.scrollToCatalogResults/);
  assert.match(page, /handledNavigationScrollRef\.current === location\.key/);
  assert.match(page, /pendingNavigationScrollRef\.current = true/);
  assert.match(page, /useLayoutEffect/);
  assert.match(page, /state: null, preventScrollReset: true/);
  assert.match(page, /requestAnimationFrame\(scrollToCatalogStart\)/);
  assert.match(page, /pendingNavigationScrollRef\.current && \(catalogQuery\.search \|\| ""\) === search\.trim\(\)/);
  assert.match(page, /pendingNavigationScrollRef\.current = false/);
  assert.match(page, /querySelector\("\[data-client-navbar\]"\)/);
  assert.match(page, /window\.scrollTo/);
  assert.match(page, /scrollToGrid: false/);
  assert.match(page, /showPageSize=\{false\}/);
  assert.match(page, /grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(page, /Buscar producto/);
  assert.match(navbar, /catalog-navbar-search/);
  assert.match(navbar, /useSearchParams/);
  assert.match(navbar, /restoreCatalogSearchFocus/);
  assert.match(navbar, /scrollToCatalogResults: true/);
  assert.match(navbar, /setSearchParams\(next, \{ replace: true, preventScrollReset: true \}\)/);
  assert.match(navbar, /useLayoutEffect/);
  assert.match(navbar, /searchInputRef/);
  assert.match(navbar, /focus\(\{ preventScroll: true \}\)/);
  assert.match(navbar, /setSelectionRange\(cursor, cursor\)/);
  assert.match(navbar, /data-client-navbar/);
  assert.match(navbar, /min-\[1024px\]:flex-1/);
  assert.match(pagination, /max-\[600px\]:sr-only/);
  assert.match(pagination, /w-20 min-w-20 shrink-0/);
  assert.doesNotMatch(pagination, /w-\[68px\]/);
  assert.match(filters, /Descuentos %/);
  assert.match(filters, /Promociones 2x1/);
  assert.doesNotMatch(filters, /Solo productos en oferta/);
  assert.match(card, /absolute top-3 left-3/);
  assert.match(cart, /getCatalogProductsByIdsRequest\(cartProductIds\)/);
  assert.match(checkout, /getCatalogProductsByIdsRequest\(checkoutProductIds\)/);
  assert.doesNotMatch(cart, /getCatalogProductsRequest\(\)/);
  assert.doesNotMatch(checkout, /getCatalogProductsRequest\(\)/);
  for (const label of ["Ir a la primera página", "Ir a la página anterior", "Ir a la página siguiente", "Ir a la última página"]) {
    assert.match(pagination, new RegExp(label));
  }
  assert.match(pagination, /disabled=\{loading \|\| atFirst\}/);
  assert.match(pagination, /disabled=\{loading \|\| atLast\}/);
});

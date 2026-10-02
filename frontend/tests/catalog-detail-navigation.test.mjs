import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createProductDetailNavigationState,
  normalizeCatalogSnapshot,
  readCatalogRestoration,
  resolveProductDetailReturn,
} from "../src/helpers/catalogNavigation.js";

const snapshot = {
  filters: {
    categoryId: "7",
    minPrice: "1000",
    maxPrice: "20000",
    brand: "Bahco",
    availability: "in-stock",
    percentageDiscount: true,
    buy2Pay1: true,
  },
  order: "name-asc",
  page: 2,
  pageSize: 40,
};

test("catálogo conserva filtros, búsqueda, paginación y scroll al abrir un detalle", () => {
  const detailState = createProductDetailNavigationState({
    source: "catalog",
    search: "?search=alicate&path=no-confiable",
    snapshot,
  }, 1840);
  const target = resolveProductDetailReturn(detailState);

  assert.equal(target.label, "Volver al catálogo");
  assert.equal(target.to, "/catalog?search=alicate");
  assert.deepEqual(readCatalogRestoration(target.state), { snapshot, scrollY: 1840 });
});

test("procedencias válidas son contextuales y una entrada arbitraria usa fallback seguro", () => {
  assert.deepEqual(
    resolveProductDetailReturn(createProductDetailNavigationState({ source: "cart" })),
    { label: "Volver al carrito", to: "/cart", state: null },
  );
  assert.deepEqual(
    resolveProductDetailReturn(createProductDetailNavigationState({ source: "favorites" })),
    { label: "Volver a favoritos", to: "/favorites", state: null },
  );
  assert.deepEqual(
    resolveProductDetailReturn({ productDetailOrigin: { source: "arbitrary", pathname: "https://example.test" } }),
    { label: "Volver al catálogo", to: "/catalog", state: null },
  );
  assert.deepEqual(resolveProductDetailReturn(null), { label: "Volver al catálogo", to: "/catalog", state: null });
});

test("snapshot inválido se normaliza a valores seguros", () => {
  assert.deepEqual(normalizeCatalogSnapshot({
    filters: { availability: "private", percentageDiscount: "true" },
    order: "DROP TABLE",
    page: -4,
    pageSize: 999,
  }), {
    filters: {
      categoryId: "",
      minPrice: "",
      maxPrice: "",
      brand: "",
      availability: "all",
      percentageDiscount: false,
      buy2Pay1: false,
    },
    order: "name-asc",
    page: 1,
    pageSize: 20,
  });
});

test("CatalogPage restaura después de cargar y ProductDetail limita la procedencia", async () => {
  const [catalog, detail, card, cart, favorites] = await Promise.all([
    readFile(new URL("../src/pages/CatalogPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProductDetailPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ProductCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ClientCartPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/FavoritesPage.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /readCatalogRestoration/);
  assert.match(catalog, /pendingRestoreScrollRef/);
  assert.match(catalog, /window\.scrollTo\(\{ top: scrollY, behavior: "auto" \}\)/);
  assert.match(catalog, /snapshot: \{ filters, order, page, pageSize \}/);
  assert.match(card, /createProductDetailNavigationState\(detailOrigin, window\.scrollY\)/);
  assert.match(detail, /resolveProductDetailReturn\(location\.state\)/);
  assert.match(detail, /returnNavigation\.label/);
  assert.match(cart, /source: "cart"/);
  assert.match(favorites, /source: "favorites"/);
});

import { CATALOG_PAGE_SIZES, CATALOG_SORT_OPTIONS, EMPTY_CATALOG_FILTERS } from "./catalogFilters.js";

const VALID_SOURCES = new Set(["catalog", "cart", "favorites"]);
const VALID_SORTS = new Set(CATALOG_SORT_OPTIONS.map(([value]) => value));

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function catalogSearchOnly(search) {
  const source = typeof search === "string" ? search.replace(/^\?/, "") : "";
  const value = new URLSearchParams(source).get("search")?.trim() || "";
  if (!value) return "";
  const params = new URLSearchParams();
  params.set("search", value);
  return `?${params.toString()}`;
}

export function normalizeCatalogSnapshot(snapshot) {
  const filters = snapshot?.filters || {};
  const pageSize = positiveInteger(snapshot?.pageSize, 20);

  return {
    filters: {
      categoryId: String(filters.categoryId ?? ""),
      minPrice: String(filters.minPrice ?? ""),
      maxPrice: String(filters.maxPrice ?? ""),
      brand: String(filters.brand ?? ""),
      availability: filters.availability === "in-stock" ? "in-stock" : EMPTY_CATALOG_FILTERS.availability,
      percentageDiscount: filters.percentageDiscount === true,
      buy2Pay1: filters.buy2Pay1 === true,
    },
    order: VALID_SORTS.has(snapshot?.order) ? snapshot.order : "name-asc",
    page: positiveInteger(snapshot?.page, 1),
    pageSize: CATALOG_PAGE_SIZES.includes(pageSize) ? pageSize : 20,
  };
}

export function createProductDetailNavigationState(origin, scrollY = 0) {
  if (!VALID_SOURCES.has(origin?.source)) return null;

  if (origin.source !== "catalog") {
    return { productDetailOrigin: { source: origin.source } };
  }

  return {
    productDetailOrigin: {
      source: "catalog",
      search: catalogSearchOnly(origin.search),
      snapshot: normalizeCatalogSnapshot(origin.snapshot),
      scrollY: Math.max(0, Number(scrollY) || 0),
    },
  };
}

export function resolveProductDetailReturn(state) {
  const origin = state?.productDetailOrigin;

  if (origin?.source === "cart") {
    return { label: "Volver al carrito", to: "/cart", state: null };
  }

  if (origin?.source === "favorites") {
    return { label: "Volver a favoritos", to: "/favorites", state: null };
  }

  if (origin?.source === "catalog") {
    return {
      label: "Volver al catálogo",
      to: `/catalog${catalogSearchOnly(origin.search)}`,
      state: {
        restoreCatalog: {
          snapshot: normalizeCatalogSnapshot(origin.snapshot),
          scrollY: Math.max(0, Number(origin.scrollY) || 0),
        },
      },
    };
  }

  return { label: "Volver al catálogo", to: "/catalog", state: null };
}

export function readCatalogRestoration(state) {
  if (!state?.restoreCatalog) return null;
  return {
    snapshot: normalizeCatalogSnapshot(state.restoreCatalog.snapshot),
    scrollY: Math.max(0, Number(state.restoreCatalog.scrollY) || 0),
  };
}

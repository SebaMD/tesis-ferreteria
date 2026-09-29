export const CATALOG_PAGE_SIZES = [20, 40, 60, 100] as const;
export const CATALOG_SORTS = ["price-asc", "price-desc", "name-asc", "name-desc"] as const;
export const CATALOG_AVAILABILITY = ["all", "in-stock"] as const;
export const CATALOG_PROMOTION_TYPES = ["PERCENTAGE_DISCOUNT", "BUY_2_PAY_1"] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogAvailability = (typeof CATALOG_AVAILABILITY)[number];
export type CatalogPromotionType = (typeof CATALOG_PROMOTION_TYPES)[number];

export type CatalogQuery = {
  page: number;
  limit: (typeof CATALOG_PAGE_SIZES)[number];
  search: string;
  categoryId: number | null;
  brand: string;
  availability: CatalogAvailability;
  sort: CatalogSort;
  minPrice: number | null;
  maxPrice: number | null;
  offers: boolean;
  promotionTypes: CatalogPromotionType[];
};

type ValidationResult =
  | { success: true; value: CatalogQuery }
  | { success: false; error: string };

function single(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: unknown, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  const raw = single(value);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalPrice(value: unknown) {
  if (value === undefined || value === "") return { valid: true as const, value: null };
  const raw = single(value)?.trim();
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return { valid: false as const };
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 9_999_999_999.99
    ? { valid: true as const, value: parsed }
    : { valid: false as const };
}

function normalizedText(value: unknown) {
  return single(value)?.trim().replace(/\s+/g, " ") ?? "";
}

export function validateCatalogQuery(query: Record<string, unknown>): ValidationResult {
  const page = positiveInteger(query.page, 1);
  if (!page) return { success: false, error: "La pagina debe ser un entero positivo" };

  const limit = positiveInteger(query.limit, 20);
  if (!limit || !CATALOG_PAGE_SIZES.includes(limit as CatalogQuery["limit"])) {
    return { success: false, error: "La cantidad por pagina debe ser 20, 40, 60 o 100" };
  }

  const search = normalizedText(query.search);
  if (search.length > 150) return { success: false, error: "La busqueda admite hasta 150 caracteres" };

  let categoryId: number | null = null;
  if (query.categoryId !== undefined && query.categoryId !== "") {
    categoryId = positiveInteger(query.categoryId);
    if (!categoryId) return { success: false, error: "La categoria debe ser valida" };
  }

  const brand = normalizedText(query.brand).normalize("NFC").toLocaleLowerCase("es");
  if (brand.length > 100) return { success: false, error: "La marca admite hasta 100 caracteres" };

  const availability = single(query.availability) ?? "all";
  if (!CATALOG_AVAILABILITY.includes(availability as CatalogAvailability)) {
    return { success: false, error: "La disponibilidad seleccionada no es valida" };
  }

  const sort = single(query.sort) ?? "name-asc";
  if (!CATALOG_SORTS.includes(sort as CatalogSort)) {
    return { success: false, error: "El orden seleccionado no es valido" };
  }

  const minPrice = optionalPrice(query.minPrice);
  const maxPrice = optionalPrice(query.maxPrice);
  if (!minPrice.valid || !maxPrice.valid) {
    return { success: false, error: "Los precios deben ser numeros validos con hasta dos decimales" };
  }
  if (minPrice.value !== null && maxPrice.value !== null && minPrice.value > maxPrice.value) {
    return { success: false, error: "El precio minimo no puede superar al maximo" };
  }

  const offersRaw = single(query.offers);
  if (offersRaw !== undefined && !["true", "false"].includes(offersRaw)) {
    return { success: false, error: "El filtro de ofertas no es valido" };
  }

  const promotionTypesRaw = single(query.promotionTypes);
  const promotionTypes = promotionTypesRaw === undefined || promotionTypesRaw.trim() === ""
    ? []
    : [...new Set(promotionTypesRaw.split(",").map((value) => value.trim()).filter(Boolean))];
  if (promotionTypes.some((type) => !CATALOG_PROMOTION_TYPES.includes(type as CatalogPromotionType))) {
    return { success: false, error: "El tipo de promocion seleccionado no es valido" };
  }

  return {
    success: true,
    value: {
      page,
      limit: limit as CatalogQuery["limit"],
      search,
      categoryId,
      brand,
      availability: availability as CatalogAvailability,
      sort: sort as CatalogSort,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      offers: offersRaw === "true",
      promotionTypes: promotionTypes as CatalogPromotionType[],
    },
  };
}

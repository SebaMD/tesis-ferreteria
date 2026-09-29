export const EMPTY_CATALOG_FILTERS = {
  categoryId: "",
  minPrice: "",
  maxPrice: "",
  brand: "",
  availability: "all",
  percentageDiscount: false,
  buy2Pay1: false,
};
export const CATALOG_SORT_OPTIONS = [
  ["price-asc", "Precio: menor a mayor"], ["price-desc", "Precio: mayor a menor"],
  ["name-asc", "Nombre: A-Z"], ["name-desc", "Nombre: Z-A"],
];
export const CATALOG_PAGE_SIZES = [20, 40, 60, 100];
const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

export function validatePriceRange(minPrice, maxPrice) {
  const parse = (value) => clean(value) === "" ? null : /^\d+(?:[.,]\d{1,2})?$/.test(clean(value)) ? Number(clean(value).replace(",", ".")) : NaN;
  const min = parse(minPrice), max = parse(maxPrice);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return { valid: false, message: "Ingresa precios válidos mayores o iguales a 0." };
  if (min !== null && max !== null && min > max) return { valid: false, message: "El precio mínimo no puede superar al máximo." };
  return { valid: true, min, max };
}

export function getCatalogPageRange(page, pageSize, totalItems) {
  const total = Math.max(0, Number(totalItems) || 0);
  if (total === 0) return { first: 0, last: 0 };
  const size = Math.max(1, Number(pageSize) || 1);
  const safePage = Math.max(1, Number(page) || 1);
  const first = (safePage - 1) * size + 1;
  return { first, last: Math.min(first + size - 1, total) };
}

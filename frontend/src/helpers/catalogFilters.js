import { getOnlineAvailableStock } from "./productAvailability.js";

export const EMPTY_CATALOG_FILTERS = { search: "", categoryId: "", minPrice: "", maxPrice: "", brand: "", availability: "all" };
export const CATALOG_SORT_OPTIONS = [
  ["price-asc", "Precio: menor a mayor"], ["price-desc", "Precio: mayor a menor"],
  ["name-asc", "Nombre: A-Z"], ["name-desc", "Nombre: Z-A"],
];
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
export const normalizeBrand = (value) => clean(value).normalize("NFC").toLocaleLowerCase("es");

export function getCatalogBrands(products) {
  const brands = new Map();
  for (const product of products) {
    const key = normalizeBrand(product.brand);
    if (key && !brands.has(key)) brands.set(key, clean(product.brand));
  }
  return [...brands].map(([value, label]) => ({ value, label })).sort((a, b) => collator.compare(a.label, b.label));
}

export function validatePriceRange(minPrice, maxPrice) {
  const parse = (value) => clean(value) === "" ? null : /^\d+(?:[.,]\d{1,2})?$/.test(clean(value)) ? Number(clean(value).replace(",", ".")) : NaN;
  const min = parse(minPrice), max = parse(maxPrice);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return { valid: false, message: "Ingresa precios válidos mayores o iguales a 0." };
  if (min !== null && max !== null && min > max) return { valid: false, message: "El precio mínimo no puede superar al máximo." };
  return { valid: true, min, max };
}

export function filterAndSortCatalog(products, filters, order = "name-asc") {
  const search = clean(filters.search).toLocaleLowerCase("es");
  const range = validatePriceRange(filters.minPrice, filters.maxPrice);
  return products.filter((product) => {
    const price = Number(product.price);
    return (!filters.categoryId || String(product.categoryId) === String(filters.categoryId))
      && (!filters.brand || normalizeBrand(product.brand) === normalizeBrand(filters.brand))
      && (filters.availability !== "in-stock" || getOnlineAvailableStock(product) > 0)
      && (!search || [product.name, product.categoryName, product.description, product.brand].some((value) => String(value || "").toLocaleLowerCase("es").includes(search)))
      // An invalid draft never silently empties the catalog; other filters still apply.
      && (!range.valid || ((range.min === null || price >= range.min) && (range.max === null || price <= range.max)));
  }).sort((a, b) => {
    let result;
    if (order === "price-asc" || order === "price-desc") result = (Number(a.price) - Number(b.price)) * (order === "price-desc" ? -1 : 1);
    else result = collator.compare(a.name, b.name) * (order === "name-desc" ? -1 : 1);
    return result || Number(a.id) - Number(b.id);
  });
}

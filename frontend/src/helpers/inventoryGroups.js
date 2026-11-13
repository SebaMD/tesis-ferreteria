import { compareByNewest } from "./formatters.js";
import { isLowStockProduct, isOutOfStockProduct, getStockStatus } from "./inventory.js";

export const inventoryVariantLabel = product => (product.variantValues || []).map(v => `${v.attribute}: ${v.label}`).join(" · ");
// State filters are OR at SKU level; structure, category and search are AND.
// Inactive visibility is still permission-gated, never inferred from family state.
export function filterInventoryProducts(products, { inactive = false, low = false, out = false, variantsOnly = false, category = "", search = "", canViewInactive = false } = {}) {
  const term = search.trim().toLocaleLowerCase("es");
  const includeInactive = inactive && canViewInactive;
  const hasStates = includeInactive || low || out;
  return products.filter(p => {
    if (p.status === false && !canViewInactive) return false;
    if (variantsOnly && !p.familyId) return false;
    if (category && String(p.categoryId) !== String(category)) return false;
    if (hasStates ? !((includeInactive && p.status === false) || (low && isLowStockProduct(p)) || (out && isOutOfStockProduct(p))) : p.status === false) return false;
    return !term || [p.id, p.barcode, p.name, p.categoryName, p.familyName, inventoryVariantLabel(p)].some(v => String(v ?? "").toLocaleLowerCase("es").includes(term));
  }).sort(compareByNewest);
}
// Presentation only: grouping, actions and exports continue to use concrete SKU IDs.
export function inventoryGroupIdentity(group) {
  const source = group.representative || group.products?.[0];
  const value = group.kind === "family" ? source?.familyId : source?.id;
  const label = group.kind === "family" ? "Familia" : "Producto";
  return Number.isSafeInteger(value) && value > 0 ? `${label} #${value}` : label;
}
export function selectedInventoryProduct(group, selectedId, search = "") {
  const exact = search.trim().toLocaleLowerCase("es");
  return group.products.find(p => p.id === selectedId)
    || group.products.find(p => exact && (String(p.id) === exact || p.barcode === exact)) || group.products[0];
}
// Administrative picker only: keep filtered rows/counts/exports unchanged.
export function inventoryPickerProducts(group, allProducts = [], role) {
  if (group.kind !== "family" || !["ADMIN", "MANAGER"].includes(role)) return group.products;
  const familyId = group.representative.familyId;
  const existing = new Set(group.products.map(p => p.id));
  return [...group.products, ...allProducts.filter(p => p.familyId === familyId && p.status === false && !existing.has(p.id)).sort(compareByNewest)];
}
// Input already passed role visibility and concrete-product filters. Never page SKUs first.
export function groupInventoryProducts(filtered, visible = filtered) {
  const totals = new Map();
  visible.forEach(p => { if(p.familyId) totals.set(p.familyId,(totals.get(p.familyId)||0)+1); });
  const groups = new Map();
  for (const product of filtered) {
    const key=product.familyId?`family-${product.familyId}`:`product-${product.id}`;
    if(!groups.has(key)) groups.set(key,{key,kind:product.familyId?"family":"product",name:product.familyId?(product.familyName||`Familia #${product.familyId}`):product.name,
      categoryName:product.categoryName,representative:product,products:[],totalVariants:product.familyId?totals.get(product.familyId):1});
    groups.get(key).products.push(product);
  }
  return [...groups.values()].map(group=>{const members=[...group.products].sort(compareByNewest);return {...group,products:members,representative:members[0],lowCount:members.filter(isLowStockProduct).length,outCount:members.filter(isOutOfStockProduct).length};})
    .sort((a,b)=>compareByNewest(a.representative,b.representative));
}
export function inventoryExportRows(products, role) {
  return [...new Map(products.map(p=>[p.id,p])).values()].map(product=>({id:product.id,producto:product.name,codigoBarra:product.barcode||"",categoria:product.categoryName,
    precio:Number(product.price||0),stockActual:Number(product.currentStock||0),unidad:product.unitMeasure,stockMinimo:Number(product.minimumStock||0),
    estado:product.status===false?"Desactivado":getStockStatus(product,role).label,familia:product.familyName||"",atributos:inventoryVariantLabel(product)}));
}

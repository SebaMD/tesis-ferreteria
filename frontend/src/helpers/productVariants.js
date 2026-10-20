export function variantLabel(variant) {
  return (variant.variantValues || []).map((v) => `${v.attribute}: ${v.label}`).join(" · ");
}

// Always choose an existing concrete SKU, never manufacture a Cartesian product.
export function selectExistingVariant(variants, current, attributeId, optionId) {
  const candidates = variants.filter((v) => v.variantValues?.some((a) => a.attributeId === attributeId && a.optionId === optionId));
  const score = (v) => (v.variantValues || []).filter((a) => a.attributeId !== attributeId && current?.variantValues?.some((b) => a.optionId === b.optionId)).length;
  return candidates.sort((a, b) => score(b) - score(a) || Number(b.status) - Number(a.status) || a.id - b.id)[0] || null;
}

export function variantAvailability(variant) {
  if (!variant?.status) return "Inactiva";
  if (variant.inStoreOnly) return "Solo presencial";
  return Number(variant.availableStock ?? variant.currentStock ?? 0) > 0 ? "Disponible online" : "Agotada";
}

export function isVariantPurchasable(variant) {
  return Boolean(variant?.status && !variant.inStoreOnly && Number(variant.availableStock ?? variant.currentStock ?? 0) > 0);
}

// Prefer the current combination when buyable. Otherwise choose the nearest
// buyable SKU so sparse or sold-out intersections never trap the selection.
export function variantOptionState(variants, current, attributeId, optionId) {
  const candidates = variants.filter((v) => v.variantValues?.some((a) => a.attributeId === attributeId && a.optionId === optionId));
  if (!candidates.length) return null;
  const exact = candidates.find((v) => (current?.variantValues || []).every((a) => a.attributeId === attributeId || v.variantValues?.some((b) => b.optionId === a.optionId)));
  const candidate = selectExistingVariant(candidates.filter(isVariantPurchasable), current, attributeId, optionId) || exact || candidates[0];
  return { variant: candidate, available: isVariantPurchasable(candidate), reason: variantAvailability(candidate), adjusted: candidate.id !== exact?.id };
}

export function familyCardSummary(product) {
  const count = Number(product.onlineVariantCount || 0);
  const attribute = product.attributeNames?.length === 1 ? product.attributeNames[0].toLocaleLowerCase("es") : "";
  const labels = { color: ["color", "colores"], medida: ["medida", "medidas"], ancho: ["ancho", "anchos"], grano: ["grano", "granos"], presentación: ["presentación", "presentaciones"], dimensiones: ["dimensión", "dimensiones"] };
  const noun = labels[attribute]?.[count === 1 ? 0 : 1] || (count === 1 ? "opción" : "opciones");
  return {
    count,
    from: count > 0 && Number(product.onlineFromPrice) !== Number(product.onlineMaxPrice),
    price: count > 0 ? product.onlineFromPrice : null,
    availability: count > 0 ? `${count} ${noun} ${count === 1 ? "disponible" : "disponibles"}` : product.allInStoreOnly ? "Solo presencial" : "Sin opciones online disponibles",
  };
}

export function familyVariantDescription(description) {
  const disclaimer = "DEMOSTRACIÓN: precio, existencias y disponibilidad ficticios; no representan datos comerciales reales de Comercializadora FYF SpA.";
  const demo = description?.startsWith(disclaimer) || description?.startsWith("Familia del catálogo de referencia de demostración.");
  return { demo, text: description?.startsWith(disclaimer) ? description.slice(disclaimer.length).split("Modelo/referencia:")[0].trim() : demo ? "" : description };
}

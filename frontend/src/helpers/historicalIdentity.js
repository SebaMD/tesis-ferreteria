export function identityProvenance(capture) {
  if (capture === undefined) return null;
  if (!capture) return "Identidad histórica no registrada";
  if (capture.origin === "ORIGINAL") return "Identidad registrada en la operación";
  if (capture.origin === "LEGACY_PARTIAL") return "Nombre y unidad originales; demás datos de referencia posterior";
  return "Captura posterior de referencia; no acredita la identidad original";
}
export function historicalVariantLabel(capture) {
  const attributes = capture?.identity?.family?.attributes;
  return Array.isArray(attributes) ? attributes.filter(a=>typeof a?.name==="string"&&typeof a?.label==="string").map(a=>`${a.name}: ${a.label}`).join(" · ") : "";
}

// Keep this small descriptive catalogue consistent with the backend validator.
// These units never participate in SKU quantities or stock conversions.
export const ATTRIBUTE_MEASUREMENTS = {
  length: { label: "Longitud", units: ["mm", "cm", "m"] },
  mass: { label: "Masa o peso comercial", units: ["g", "kg"] },
  volume: { label: "Capacidad o volumen", units: ["mL", "L"] },
};
export function validAttributeMeasurement(value) {
  return !value.measurementKind && !value.unitCode || Boolean(ATTRIBUTE_MEASUREMENTS[value.measurementKind]?.units.includes(value.unitCode));
}
export function normalizeAttributeNumber(value) {
  if (typeof value !== "string" || !/^\d{1,12}(?:[.,]\d{1,6})?$/.test(value.trim())) throw new Error("Ingresa un número positivo sin unidad, con hasta 12 enteros y 6 decimales.");
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const integer = whole.replace(/^0+(?=\d)/, ""), decimal = fraction.replace(/0+$/, "");
  const normalized = integer + (decimal ? `.${decimal}` : "");
  if (normalized === "0") throw new Error("El valor debe ser mayor que cero.");
  return normalized;
}
export function attributeNumberIsValid(value) { try { normalizeAttributeNumber(value); return true; } catch { return false; } }
export function attributeOptionLabel(label, unitCode) {
  if (!unitCode || !label) return label || "";
  try { return `${normalizeAttributeNumber(label)} ${unitCode}`; } catch { return "Valor numérico pendiente o inválido"; }
}
export const measurementFields = a => a.measurementKind || a.unitCode ? { measurementKind: a.measurementKind, unitCode: a.unitCode } : {};
// Read-only diagnosis; never parses, edits, strips suffixes or migrates stored labels.
export function legacyMeasurementCandidate(attribute) {
  if (attribute.id && !attribute.unitCode && attribute.options?.length) {
    const values = attribute.options.map(o => /^(\d{1,12}(?:[.,]\d{1,6})?)\s+(mm|cm|m|g|kg|mL|L)$/.exec(o.label.trim()));
    if (values.every(Boolean) && new Set(values.map(v => v[2])).size === 1 && values.every(v => attributeNumberIsValid(v[1]))
      && new Set(values.map(v=>normalizeAttributeNumber(v[1]))).size === values.length) return values[0][2];
  }
  return null;
}

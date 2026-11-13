import { FamilyError } from "./productFamilies.service.js";

// Descriptive magnitudes only. Never used for SKU units, stock or money.
export const attributeMeasurementUnits = { length: ["mm", "cm", "m"], mass: ["g", "kg"], volume: ["mL", "L"] } as const;
export type Measurement = { measurementKind?: "length" | "mass" | "volume"; unitCode?: string };
export function validateAttributeMeasurement(value: { measurementKind?: unknown; unitCode?: unknown }): Measurement {
  if (value.measurementKind == null && value.unitCode == null) return {};
  const kind = value.measurementKind as keyof typeof attributeMeasurementUnits;
  if (!Object.hasOwn(attributeMeasurementUnits, kind) || typeof value.unitCode !== "string"
    || !(attributeMeasurementUnits[kind] as readonly string[]).includes(value.unitCode)) {
    throw new FamilyError("Selecciona una magnitud y una unidad de atributo compatibles", 400);
  }
  return { measurementKind: kind, unitCode: value.unitCode };
}
export function normalizeAttributeNumber(value: string): string {
  // Decimal strings avoid floating point loss. No thousands separators, signs or exponents.
  if (!/^\d{1,12}(?:[.,]\d{1,6})?$/.test(value.trim())) throw new FamilyError("Las opciones cuantitativas requieren números positivos, sin unidad (máximo 12 enteros y 6 decimales)", 400);
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const integer = whole.replace(/^0+(?=\d)/, ""), decimal = fraction.replace(/0+$/, "");
  const normalized = integer + (decimal ? `.${decimal}` : "");
  if (normalized === "0") throw new FamilyError("El valor del atributo debe ser mayor que cero", 400);
  return normalized;
}
export const attributeOptionLabel = (label: string, unitCode?: string | null) => unitCode ? `${label} ${unitCode}` : label;

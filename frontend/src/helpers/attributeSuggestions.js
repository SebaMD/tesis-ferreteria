import { measurementFields, normalizeAttributeNumber, validAttributeMeasurement } from "./attributeMeasurements.js";

export const ATTRIBUTE_SUGGESTIONS = ["Color", "Medida", "Tamaño", "Material", "Presentación", "Longitud", "Capacidad", "Tipo"];
export const normalizedAttribute = value => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export function selectedAttributeNames(selected, other, custom, existing, limit) {
  const names = [...selected, ...(other ? [custom.trim().replace(/\s+/g, " ")] : [])];
  const used = existing.map(normalizedAttribute), keys = names.filter(Boolean).map(normalizedAttribute);
  return { names, valid: names.length > 0 && names.length <= limit && names.every(n => n.length <= 60)
    && new Set(keys).size === keys.length && !keys.some(k => used.includes(k)) };
}
export function inlineDimensionDraft(name, texts, rows, measurement = {}) {
  const options = [], normalized = [];
  let numericValid = true;
  const assignments = rows.map(row => {
    let label = (texts[row.id] || "").trim().replace(/\s+/g, " ");
    if (measurement.unitCode && label) { try { label = normalizeAttributeNumber(label); } catch { numericValid = false; } }
    const key = normalizedAttribute(label);
    if (label && !normalized.includes(key)) { normalized.push(key); options.push(label); }
    return { productId: row.id, optionIndex: label ? normalized.indexOf(key) : -1 };
  });
  const clean = name.trim().replace(/\s+/g, " ");
  return { name: clean, ...measurementFields(measurement), options, assignments, valid: numericValid && validAttributeMeasurement(measurement) && clean.length > 0 && clean.length <= 60 && options.length > 0 && options.length <= 100
    && options.every(o => o.length <= 100 && ![...o].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) && assignments.every(a => a.optionIndex >= 0) };
}

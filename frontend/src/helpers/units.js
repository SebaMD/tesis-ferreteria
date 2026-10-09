// Extracted from ProductsPage: unknown/custom units are preserved, never pluralized by suffix.
export const UNIT_PLURALS = {
  unidad: "unidades", litro: "litros", metro: "metros", caja: "cajas",
  paquete: "paquetes", saco: "sacos", bolsa: "bolsas", par: "pares",
  rollo: "rollos", plancha: "planchas", barra: "barras", tubo: "tubos",
  pieza: "piezas", docena: "docenas", set: "sets", galón: "galones",
  tarro: "tarros",
};

const SINGULAR_UNITS = Object.fromEntries(Object.entries(UNIT_PLURALS).map(([singular, plural]) => [plural, singular]));

export function getDisplayUnit(quantity, unitMeasure) {
  const unit = String(unitMeasure || "unidad").trim();
  const normalized = unit.toLocaleLowerCase("es");
  const singular = Object.hasOwn(SINGULAR_UNITS, normalized) ? SINGULAR_UNITS[normalized] : normalized;
  if (!Object.hasOwn(UNIT_PLURALS, singular)) return unit;
  return Number(quantity) === 1 ? singular : UNIT_PLURALS[singular];
}

export function formatQuantityWithUnit(quantity, unitMeasure) {
  return `${quantity} ${getDisplayUnit(quantity, unitMeasure)}`;
}

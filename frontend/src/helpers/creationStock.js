export function creationStockAction(values) {
  const stocks = values.map(value => value == null || String(value).trim() === "" ? null : Number(value));
  const valid = stocks.every(value => value === null || Number.isSafeInteger(value) && value >= 0 && value <= 2147483647);
  const empty = stocks.every(value => value === null);
  const positive = stocks.some(value => value > 0);
  return { valid, empty, positive, label: empty ? `Guardar y registrar ${stocks.length > 1 ? "entradas" : "entrada"}`
    : positive ? `Guardar y revisar ${stocks.length > 1 ? "entradas" : "entrada"}` : "Guardar y revisar existencias" };
}

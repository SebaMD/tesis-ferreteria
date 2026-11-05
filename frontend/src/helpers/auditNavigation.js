export const auditEmptyFilters = { operation: "", productId: "", familyId: "", from: "", to: "", limit: "10" };
export function auditQueryFromSearch(search) {
  const params = new URLSearchParams(search);
  return { ...Object.fromEntries(Object.entries(auditEmptyFilters).map(([key, value]) => [key, params.get(key) ?? value])), cursor: params.get("cursor") || null };
}
export function auditQueryToSearch(query) {
  const params = new URLSearchParams();
  for (const key of [...Object.keys(auditEmptyFilters), "cursor"]) if (query[key]) params.set(key, query[key]);
  return `?${params}`;
}

export function auditFilterValidationMessage(filters, incomplete = {}) {
  for (const key of ["productId", "familyId"]) {
    const value = filters[key];
    if (incomplete[key] || (value && (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647))) return "Los identificadores deben ser números enteros entre 1 y 2147483647, sin ceros iniciales.";
  }
  for (const key of ["from", "to"]) {
    const value = filters[key];
    if (incomplete[key] || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value))) return "Completa las fechas con un día, mes y año válidos.";
  }
  if (filters.from && filters.to && filters.from > filters.to) return "La fecha Desde no puede ser posterior a Hasta.";
  return "";
}

// The API exposes cursors, not a total. Only number pages with a known entry cursor.
export function auditAvailablePages(cursor, back, knownPages, nextCursor) {
  const page = back.length;
  const pages = knownPages?.[page] === cursor ? [...knownPages] : [...back, cursor];
  if (!nextCursor) return pages.slice(0, page + 1);
  if (pages[page + 1] !== nextCursor) return [...pages.slice(0, page + 1), nextCursor];
  return pages;
}

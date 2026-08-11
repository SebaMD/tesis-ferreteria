export function formatClp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDate(value, options, fallback = "Sin fecha") {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("es-CL", options).format(date);
}

export function formatSaleFolio(id) {
  return `V-${String(id).padStart(6, "0")}`;
}

export function getSaleTotals(sale) {
  const originalTotal = Number(sale?.total || 0);
  const returnedTotal = Math.max(0, Number(sale?.returnedTotal || 0));
  const netTotal = Math.max(
    0,
    Number(sale?.netTotal ?? originalTotal - returnedTotal),
  );

  return { originalTotal, returnedTotal, netTotal };
}

export function formatTableRecordCount({
  visibleCount,
  totalCount,
  filteredCount = totalCount,
  hasFilters = false,
}) {
  return hasFilters
    ? `Mostrando ${visibleCount} de ${filteredCount} resultados filtrados`
    : `Mostrando ${visibleCount} de ${totalCount} registros`;
}

export function compareByNewest(left, right) {
  const parsedLeftTime = new Date(left.date || left.createdAt || 0).getTime();
  const parsedRightTime = new Date(right.date || right.createdAt || 0).getTime();
  const leftTime = Number.isNaN(parsedLeftTime) ? 0 : parsedLeftTime;
  const rightTime = Number.isNaN(parsedRightTime) ? 0 : parsedRightTime;

  if (rightTime !== leftTime) return rightTime - leftTime;

  return Number(right.id || 0) - Number(left.id || 0);
}

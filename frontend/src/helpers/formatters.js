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

export function compareByNewest(left, right) {
  return new Date(right.date || right.createdAt || 0) - new Date(left.date || left.createdAt || 0);
}

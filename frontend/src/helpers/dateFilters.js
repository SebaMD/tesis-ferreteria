export function calendarDay(now = new Date(), timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validCalendarDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !value.startsWith("0000")
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function shiftCalendarDay(value, days) {
  if (!validCalendarDay(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reportDateError(filters, mode, now = new Date()) {
  const today = calendarDay(now, "America/Santiago");
  if (!validCalendarDay(filters.from) || !validCalendarDay(filters.to)) return "Completa las fechas con un día, mes y año válidos.";
  if (filters.to > today || filters.from > today) return "No se permiten fechas futuras (hora de Chile).";
  if (mode === "range" && filters.from >= today) return "Desde debe ser anterior a hoy. Para consultar hoy utiliza Un día.";
  if (mode === "range" && filters.from >= filters.to) return "Desde debe ser estrictamente anterior a Hasta. Para una sola fecha utiliza Un día.";
  return "";
}

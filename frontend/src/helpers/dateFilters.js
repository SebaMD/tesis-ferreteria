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

// UX-only rule: single-day API queries remain valid outside the custom range mode.
export function customPeriodError(filters, period) {
  if (period !== "custom") return "";
  if ((validCalendarDay(filters.from) && filters.from < REPORT_CALENDAR_MIN)
    || (validCalendarDay(filters.to) && filters.to < shiftCalendarDay(REPORT_CALENDAR_MIN, 1))) return "Revisa las fechas del intervalo.";
  return validCalendarDay(filters.from) && validCalendarDay(filters.to) && filters.from >= filters.to
    ? "Desde debe ser anterior a Hasta." : "";
}

// The existing report parser uses new Date(year, month, day), whose years 0..99
// map to 1900..1999. This is its first supported calendar day, not a new API limit.
const REPORT_CALENDAR_MIN = "0100-01-01";
export function customRangeBounds(filters, today, maxDays) {
  const firstEnd = shiftCalendarDay(REPORT_CALENDAR_MIN, 1);
  const end = validCalendarDay(filters.to) && filters.to >= firstEnd && filters.to <= today ? filters.to : null;
  const start = validCalendarDay(filters.from) && filters.from >= REPORT_CALENDAR_MIN && filters.from < today ? filters.from : null;
  const yesterday = shiftCalendarDay(today, -1);
  const later = (a, b) => a > b ? a : b;
  const earlier = (a, b) => a < b ? a : b;
  return {
    fromMin: end && maxDays ? later(REPORT_CALENDAR_MIN, shiftCalendarDay(end, 1 - maxDays)) : REPORT_CALENDAR_MIN,
    fromMax: end ? earlier(yesterday, shiftCalendarDay(end, -1)) : yesterday,
    toMin: start ? shiftCalendarDay(start, 1) : firstEnd,
    toMax: start && maxDays ? earlier(today, shiftCalendarDay(start, maxDays - 1)) : today,
  };
}

export function validCustomRange(filters, today, maxDays) {
  if (!filters || !validCalendarDay(filters.from) || !validCalendarDay(filters.to) || filters.from >= filters.to) return false;
  const bounds = customRangeBounds(filters, today, maxDays);
  return filters.from >= bounds.fromMin && filters.from <= bounds.fromMax
    && filters.to >= bounds.toMin && filters.to <= bounds.toMax;
}

export function initializeCustomRange(previous, today, maxDays) {
  return validCustomRange(previous, today, maxDays)
    ? { from: previous.from, to: previous.to }
    : { from: shiftCalendarDay(today, -1), to: today };
}

export function reportDateError(filters, mode, now = new Date()) {
  const today = calendarDay(now, "America/Santiago");
  if (!validCalendarDay(filters.from) || !validCalendarDay(filters.to)) return "Completa las fechas con un día, mes y año válidos.";
  if (filters.to > today || filters.from > today) return "No se permiten fechas futuras (hora de Chile).";
  if (mode === "range" && filters.from >= today) return "Desde debe ser anterior a hoy. Para consultar hoy utiliza Un día.";
  if (mode === "range" && filters.from >= filters.to) return "Desde debe ser estrictamente anterior a Hasta. Para una sola fecha utiliza Un día.";
  return "";
}

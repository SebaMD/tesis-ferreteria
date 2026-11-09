import { calendarDay, shiftCalendarDay, validCalendarDay } from "./dateFilters.js";

export function statisticsRangeError(filters, now = new Date()) {
  if (!validCalendarDay(filters.from) || !validCalendarDay(filters.to)) return "Completa ambas fechas con un día, mes y año válidos.";
  if (filters.from > filters.to) return "La fecha desde no puede ser posterior a la fecha hasta";
  if (filters.to > dateInputValue(now)) return "La fecha hasta no puede ser futura";
  if ((Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1 > 366) return "El rango no puede superar 366 días";
  return "";
}

export const STATISTICS_PERIOD_OPTIONS = [
  { value: "today", label: "Día actual" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "currentMonth", label: "Mes actual" },
  { value: "day", label: "Por día" },
  { value: "custom", label: "Rango personalizado" },
];

export function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStatisticsPeriodRange(period, now = new Date(), timeZone) {
  // Calendar-label arithmetic avoids interpreting a selected date as a UTC instant.
  // Statistics retains the browser-local convention; sales reports explicitly use Chile.
  const today = timeZone ? calendarDay(now, timeZone) : dateInputValue(now);
  const from = period === "today" || period === "day" ? today
    : period === "currentMonth" ? `${today.slice(0, 7)}-01`
      : shiftCalendarDay(today, period === "last7" ? -6 : -29);
  return { from, to: today };
}

export function buildLineChart(data, width = 720, height = 220) {
  const padding = { top: 18, right: 18, bottom: 26, left: 18 };
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((item) => Number(item.netSales || 0)));
  const denominator = Math.max(data.length - 1, 1);
  const points = data.map((item, index) => ({
    ...item,
    x: padding.left + (index / denominator) * usableWidth,
    y: padding.top + usableHeight - (Number(item.netSales || 0) / maxValue) * usableHeight,
  }));
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = points.length
    ? `${padding.left},${padding.top + usableHeight} ${linePoints} ${padding.left + usableWidth},${padding.top + usableHeight}`
    : "";

  return { width, height, maxValue, points, linePoints, areaPoints };
}

export function buildDonutGradient(items, colors) {
  const positiveItems = items.filter((item) => Number(item.amount) > 0);
  const total = positiveItems.reduce((sum, item) => sum + Number(item.amount), 0);
  if (total <= 0) return "conic-gradient(#cbd5e1 0deg 360deg)";

  let cursor = 0;
  const stops = positiveItems.map((item, index) => {
    const start = cursor;
    cursor += (Number(item.amount) / total) * 360;
    return `${colors[index % colors.length]} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

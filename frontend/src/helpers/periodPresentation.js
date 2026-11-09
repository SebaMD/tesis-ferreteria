import {shiftCalendarDay} from "./dateFilters.js";

const displayDay=day=>day.split("-").reverse().join("-");

export function statisticsPeriodIndicator(applied,today) {
  if(!applied)return "Todavía no hay estadísticas consultadas.";
  const {period,from,to}=applied;
  const presetStarts={today,last7:shiftCalendarDay(today,-6),last30:shiftCalendarDay(today,-29),currentMonth:`${today.slice(0,7)}-01`};
  const labels={today:"Mostrando estadísticas de hoy",last7:"Mostrando estadísticas de los últimos 7 días",last30:"Mostrando estadísticas de los últimos 30 días",currentMonth:"Mostrando estadísticas del mes actual"};
  if(labels[period]&&from===presetStarts[period]&&to===today)return labels[period];
  return from===to?`Mostrando estadísticas del ${displayDay(from)}`:`Mostrando estadísticas del ${displayDay(from)} al ${displayDay(to)}`;
}

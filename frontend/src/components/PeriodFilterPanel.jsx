import {CalendarDays, Filter} from "lucide-react";
import AppSelect from "./AppSelect.jsx";
import {panelClass} from "../helpers/uiClasses.js";

// Presentation only: pages retain their date rules, request handlers and results.
export default function PeriodFilterPanel({title,period,onPeriodChange,options,selectLabel,onSubmit,dates,indicator,actions,error,errorId,footer}) {
  return <form className={`${panelClass} period-filter-panel`} onSubmit={onSubmit} noValidate>
    <div className="period-filter-header">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-rust-50 text-rust-600"><Filter size={18} aria-hidden="true"/></span>
        <div className="min-w-0">
          <h2 className="m-0 text-base font-bold text-ink-950">{title}</h2>
          <p className="mt-1 mb-0 text-xs text-slate-500">Selecciona fecha o rango. No se permiten fechas futuras.</p>
        </div>
      </div>
      <label className="period-filter-selector">Período<AppSelect ariaLabel={selectLabel} value={period} onChange={onPeriodChange} options={options}/></label>
    </div>
    <div className="period-filter-body" data-period={period}>
      <div className="period-filter-dates" data-period={period}>{dates}</div>
      <div className="period-filter-actions">
        <div className="period-filter-indicator flex items-center gap-2 rounded-[5px] border border-rust-500 bg-rust-50 px-3.5 py-2.5 text-[13px] font-semibold text-[#92400e]" role="status">
          <CalendarDays className="shrink-0" size={17} aria-hidden="true"/><span>{indicator}</span>
        </div>
        <div className="period-filter-buttons">{actions}</div>
      </div>
    </div>
    {error&&<p id={errorId} role="alert" className="m-0 text-sm text-critical-600">{error}</p>}
    {footer}
  </form>;
}

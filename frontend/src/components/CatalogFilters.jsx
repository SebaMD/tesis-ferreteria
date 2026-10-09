import { useId } from "react";
import { validatePriceRange } from "../helpers/catalogFilters.js";
import AppSelect from "./AppSelect.jsx";

export default function CatalogFilters({ filters, onChange, onClear, brands }) {
  const errorId = useId();
  const range = validatePriceRange(filters.minPrice, filters.maxPrice);
  const change = (field) => (event) => onChange({ ...filters, [field]: event.target.value });
  const select = (field) => (value) => onChange({ ...filters, [field]: value });
  return (
    <div className="grid min-w-0 gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-base font-bold">Filtros adicionales</h2><button type="button" className="min-h-10 border-slate-300 bg-white px-3 text-xs text-ink-700 hover:bg-slate-100" onClick={onClear}>Limpiar filtros</button></div>
      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0"><legend className="mb-1.5">Precio</legend>
        <label className="grid min-w-0 gap-1 text-xs">Mínimo<input type="text" inputMode="decimal" value={filters.minPrice} onChange={change("minPrice")} placeholder="$ desde" aria-invalid={!range.valid} aria-describedby={!range.valid ? errorId : undefined} /></label>
        <label className="grid min-w-0 gap-1 text-xs">Máximo<input type="text" inputMode="decimal" value={filters.maxPrice} onChange={change("maxPrice")} placeholder="$ hasta" aria-invalid={!range.valid} aria-describedby={!range.valid ? errorId : undefined} /></label>
      </fieldset>
      {!range.valid && <p id={errorId} role="alert" className="m-0 text-xs text-critical-600">{range.message} El rango no se aplicará hasta corregirlo.</p>}
      <label className="grid gap-1.5">Marca<AppSelect value={filters.brand} onChange={select("brand")} ariaLabel="Filtrar por marca" options={[{ value: "", label: "Todas las marcas" }, ...brands]} /></label>
      {brands.length === 0 && <span className="text-xs text-slate-500">Todavía no hay marcas registradas.</span>}
      <label className="grid gap-1.5">Disponibilidad<AppSelect value={filters.availability} onChange={select("availability")} ariaLabel="Filtrar por disponibilidad" options={[{ value: "all", label: "Todos los productos" }, { value: "in-stock", label: "Con stock" }]} /></label>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1 text-xs font-bold text-slate-600">Promociones</legend>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[5px] px-2 text-sm font-bold text-ink-950 hover:bg-slate-100">
          <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={Boolean(filters.percentageDiscount)} onChange={(event) => onChange({ ...filters, percentageDiscount: event.target.checked })} />
          <span className="min-w-0">Descuentos %</span>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[5px] px-2 text-sm font-bold text-ink-950 hover:bg-slate-100">
          <input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={Boolean(filters.buy2Pay1)} onChange={(event) => onChange({ ...filters, buy2Pay1: event.target.checked })} />
          <span className="min-w-0">Promociones 2x1</span>
        </label>
      </fieldset>
    </div>
  );
}

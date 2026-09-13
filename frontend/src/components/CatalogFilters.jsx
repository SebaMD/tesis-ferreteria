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
    </div>
  );
}

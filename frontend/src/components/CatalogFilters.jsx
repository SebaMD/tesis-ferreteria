import { useId } from "react";
import { validatePriceRange } from "../helpers/catalogFilters.js";

export default function CatalogFilters({ filters, onChange, onClear, categories, brands }) {
  const errorId = useId();
  const range = validatePriceRange(filters.minPrice, filters.maxPrice);
  const change = (field) => (event) => onChange({ ...filters, [field]: event.target.value });
  return (
    <div className="grid min-w-0 gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-base font-bold">Filtros</h2><button type="button" className="min-h-10 border-slate-300 bg-white px-3 text-xs text-ink-700 hover:bg-slate-100" onClick={onClear}>Limpiar filtros</button></div>
      <label className="grid gap-1.5">Palabra clave<input type="search" value={filters.search} onChange={change("search")} placeholder="Buscar productos..." /></label>
      <label className="grid gap-1.5">Categoría<select value={filters.categoryId} onChange={change("categoryId")}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0"><legend className="mb-1.5">Precio</legend>
        <label className="grid min-w-0 gap-1 text-xs">Mínimo<input type="text" inputMode="decimal" value={filters.minPrice} onChange={change("minPrice")} placeholder="$ desde" aria-invalid={!range.valid} aria-describedby={!range.valid ? errorId : undefined} /></label>
        <label className="grid min-w-0 gap-1 text-xs">Máximo<input type="text" inputMode="decimal" value={filters.maxPrice} onChange={change("maxPrice")} placeholder="$ hasta" aria-invalid={!range.valid} aria-describedby={!range.valid ? errorId : undefined} /></label>
      </fieldset>
      {!range.valid && <p id={errorId} role="alert" className="m-0 text-xs text-critical-600">{range.message} El rango no se aplicará hasta corregirlo.</p>}
      <label className="grid gap-1.5">Marca<select value={filters.brand} onChange={change("brand")}><option value="">Todas las marcas</option>{brands.map((brand) => <option key={brand.value} value={brand.value}>{brand.label}</option>)}</select></label>
      {brands.length === 0 && <span className="text-xs text-slate-500">Todavía no hay marcas registradas.</span>}
      <label className="grid gap-1.5">Disponibilidad<select value={filters.availability} onChange={change("availability")}><option value="all">Todos los productos</option><option value="in-stock">Con stock</option></select></label>
    </div>
  );
}

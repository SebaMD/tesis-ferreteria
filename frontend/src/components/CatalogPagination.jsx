import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { CATALOG_PAGE_SIZES, getCatalogPageRange } from "../helpers/catalogFilters.js";
import AppSelect from "./AppSelect.jsx";

const iconButtonClass = "grid size-10 min-h-10 shrink-0 place-items-center border-slate-300 bg-white p-0 text-ink-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 max-[600px]:size-[38px] max-[600px]:min-h-[38px]";

export default function CatalogPagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  loading,
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
  ariaLabel = "Paginación del catálogo",
  className = "",
}) {
  const { first, last } = getCatalogPageRange(page, pageSize, totalItems);
  const atFirst = totalPages === 0 || page <= 1;
  const atLast = totalPages === 0 || page >= totalPages;

  return (
    <nav className={`flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 py-1 max-[600px]:flex-nowrap max-[600px]:justify-between max-[600px]:gap-1.5 ${className}`} aria-label={ariaLabel}>
      {showPageSize && <div className="flex min-w-0 items-center gap-2 max-[600px]:gap-0">
        <span className="whitespace-nowrap text-xs font-semibold text-slate-600 max-[600px]:sr-only">Ítems por pág.</span>
        <AppSelect
          className="w-20 shrink-0 max-[600px]:w-[68px]"
          value={pageSize}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={CATALOG_PAGE_SIZES.map((size) => ({ value: size, label: String(size) }))}
          ariaLabel="Ítems por página"
          searchable={false}
          disabled={loading}
        />
      </div>}
      <span className="whitespace-nowrap text-xs font-semibold text-slate-600 max-[600px]:text-[11px]" aria-live="polite">
        {first}–{last} de {totalItems}
      </span>
      <div className="flex items-center gap-1" role="group" aria-label="Controles de página">
        <button className={iconButtonClass} type="button" aria-label="Ir a la primera página" title="Primera página" disabled={loading || atFirst} onClick={() => onPageChange(1)}><ChevronsLeft size={17} /></button>
        <button className={iconButtonClass} type="button" aria-label="Ir a la página anterior" title="Página anterior" disabled={loading || atFirst} onClick={() => onPageChange(page - 1)}><ChevronLeft size={17} /></button>
        <button className={iconButtonClass} type="button" aria-label="Ir a la página siguiente" title="Página siguiente" disabled={loading || atLast} onClick={() => onPageChange(page + 1)}><ChevronRight size={17} /></button>
        <button className={iconButtonClass} type="button" aria-label="Ir a la última página" title="Última página" disabled={loading || atLast} onClick={() => onPageChange(totalPages)}><ChevronsRight size={17} /></button>
      </div>
    </nav>
  );
}

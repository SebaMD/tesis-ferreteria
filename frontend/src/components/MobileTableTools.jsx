import { FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import AppModal from "./AppModal.jsx";

export default function MobileTableTools({
  children,
  hasActiveFilters = false,
  value,
  clearValue,
  onApply,
  exportAction,
  showFilters = Boolean(children),
  title = "Filtros",
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  return (
    <>
      <div className="mobile-table-tools ml-auto hidden shrink-0 items-center gap-2 max-[720px]:flex">
        {showFilters && (
          <button
            className={`mr-0 min-h-10 px-3 text-xs ${hasActiveFilters ? "border-rust-500! bg-rust-50! text-ink-950! hover:bg-rust-100!" : "border-slate-300 bg-white text-ink-700"}`}
            type="button"
            onClick={() => { setDraft(structuredClone(value)); setOpen(true); }}
            aria-haspopup="dialog"
            aria-label="Filtros"
            title="Filtros"
            aria-expanded={open}
          >
            <SlidersHorizontal size={17} aria-hidden="true" /> <span className="mobile-filter-label">Filtros</span>
          </button>
        )}
        {exportAction && (
          <button
            className="mr-0 size-10 min-h-10 shrink-0 border-slate-300 bg-white p-0 text-ink-700"
            type="button"
            onClick={exportAction.onClick}
            disabled={exportAction.disabled}
            aria-label={exportAction.label || "Exportar Excel"}
            title={exportAction.label || "Exportar Excel"}
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {showFilters && (
        <AppModal
          open={open}
          title={title}
          onClose={() => setOpen(false)}
          size="small"
          footer={(
            <>
              {clearValue !== undefined && <button className="border-slate-300 bg-white text-ink-700" type="button" onClick={() => setDraft(structuredClone(clearValue))}>Limpiar</button>}
              <button className="border-slate-300 bg-white text-ink-700" type="button" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="product-positive-action" type="button" onClick={() => { onApply?.(draft); setOpen(false); }}>Ver resultados</button>
            </>
          )}
        >
          <div className="grid gap-3 [&_button]:mr-0 [&_button]:min-h-11 [&_button]:w-full">{open && typeof children === "function" ? children(draft, setDraft) : children}</div>
        </AppModal>
      )}
    </>
  );
}

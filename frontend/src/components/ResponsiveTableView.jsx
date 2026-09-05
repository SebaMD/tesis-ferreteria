import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";

export function MobileDetailField({ label, children, wide = false }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-full" : ""}`}>
      <dt className="text-[11px] font-bold tracking-[0.02em] text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 mb-0 min-w-0 break-words text-sm text-ink-950">{children ?? "-"}</dd>
    </div>
  );
}

export function MobileDetailGrid({ children }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 max-[420px]:grid-cols-1">{children}</dl>;
}

export function MobileRowActions({ children }) {
  return (
    <div className="mt-4 grid gap-2 border-t border-slate-200 pt-3 [&>button]:mr-0! [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-center">
      {children}
    </div>
  );
}

export default function ResponsiveTableView({
  desktop,
  rows,
  getRowKey,
  getRowLabel,
  renderSummary,
  renderDetails,
  emptyMessage = "No hay registros para mostrar.",
  resetKey = "",
}) {
  const [expandedKey, setExpandedKey] = useState(null);
  const instanceId = useId().replaceAll(":", "");

  useEffect(() => {
    // Cierra detalles que ya no corresponden al cambiar página o filtros.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedKey(null);
  }, [resetKey]);

  return (
    <>
      <div className="hidden min-[1000px]:block" data-responsive-table="desktop">{desktop}</div>
      <div className="min-w-0 min-[1000px]:hidden" role="list" data-responsive-table="mobile">
        {rows.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : rows.map((row) => {
          const rowKey = String(getRowKey(row));
          const expanded = expandedKey === rowKey;
          const detailsId = `mobile-table-${instanceId}-${rowKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const rowLabel = getRowLabel(row);

          return (
            <article className="border-b border-slate-200 last:border-b-0" key={rowKey} role="listitem" data-mobile-table-row data-expanded={expanded}>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-center gap-2 px-3.5 py-3">
                <div className="min-w-0">{renderSummary(row, expanded)}</div>
                <button
                  className="mr-0 size-11 min-h-11 rounded-full border-slate-300 bg-white p-0 text-ink-700 hover:border-rust-500 hover:bg-rust-50 hover:text-rust-700"
                  type="button"
                  aria-controls={detailsId}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Ocultar" : "Mostrar"} detalles de ${rowLabel}`}
                  title={expanded ? "Ocultar detalles" : "Mostrar detalles"}
                  onClick={() => setExpandedKey((current) => current === rowKey ? null : rowKey)}
                >
                  {expanded ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
              {expanded && (
                <div className="min-w-0 border-t border-slate-200 bg-slate-50 px-3.5 py-4" id={detailsId} role="region" aria-label={`Detalles de ${rowLabel}`}>
                  {renderDetails(row)}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

import { useState } from "react";
import AppModal from "./AppModal.jsx";
import { secondaryButtonClass } from "../helpers/uiClasses.js";

export default function ProductUnitApplicationDialog({ plan, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  return <AppModal open title="Aplicar unidad general" description="Vista previa del borrador. Esta acción no escribe en la base de datos ni convierte cantidades." size="large" onClose={onClose}>
    <div className="grid min-w-0 gap-3">
      <p className="m-0 wrap-break-word text-sm">Unidad seleccionada: <strong>{plan.target || "Indica una unidad válida"}</strong></p>
      {plan.loading ? <p role="status" className="m-0 text-sm">Consultando historial y compromisos de los SKU existentes…</p>
        : plan.error ? <p role="alert" className="m-0 text-sm text-critical-600">{plan.error}</p>
        : <p className="m-0 text-sm"><strong>{plan.changing}</strong> {plan.changing===1?"variante recibiría":"variantes recibirían"} el cambio · <strong>{plan.same}</strong> {plan.same===1?"ya utiliza":"ya utilizan"} esta unidad · <strong>{plan.blocked}</strong> {plan.blocked===1?"bloqueada":"bloqueadas"}.</p>}
      {plan.eligibility && <p className="m-0 text-xs text-slate-500">Elegibilidad orientativa al consultar. Al guardar se volverá a validar todo el conjunto; si hay un conflicto, no se guardará ninguna variante.</p>}
      <div className="grid max-h-[45dvh] min-w-0 gap-2 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Variantes y unidades de la vista previa">
        {plan.rows.map(row => <article key={row.key} className={`min-w-0 rounded border p-3 text-sm ${row.state === "blocked" ? "border-critical-600 bg-critical-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><strong className="min-w-0 wrap-break-word">Variante {row.index}{row.id ? ` · Producto #${row.id}` : " · Nueva sin ID"}{!row.active ? " · Inactiva" : ""}</strong><span className="text-xs text-slate-500">{row.kind}</span></div>
          {row.name && <p className="mt-1 mb-0 wrap-break-word">{row.name}</p>}
          <p className="my-2 wrap-break-word wrap-anywhere">{row.before || "Unidad no indicada"} <span aria-hidden="true">→</span><span className="sr-only"> a </span> <strong>{row.after || "Unidad no indicada"}</strong></p>
          {!row.id && <p className="my-1 text-xs text-slate-500">Stock inicial del borrador: {row.initialStock ?? 0}. Su cantidad no se convertirá.</p>}
          <p className={`m-0 text-xs ${row.state === "blocked" ? "text-critical-600" : "text-slate-500"}`}>{row.reason}</p>
        </article>)}
      </div>
      {!plan.loading && !plan.error && plan.blocked > 0 && <p className="m-0 rounded border border-critical-600 p-3 text-sm text-critical-600" role="status">No se aplicará ningún cambio: hay variantes bloqueadas. No se realizará una aplicación parcial. Revisa el motivo indicado en cada artículo.</p>}
      {!plan.valid && <p role="alert" className="m-0 text-sm text-critical-600">Selecciona una unidad válida de 1 a 50 caracteres.</p>}
      {plan.canApply && <label className="variant-online-control"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />Confirmo las variantes indicadas y que la unidad es correcta, sin convertir cantidades. Solo se actualizará el borrador; después debo guardar el conjunto.</label>}
      <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button><button type="button" className="product-positive-action" disabled={!plan.canApply || !confirmed || plan.loading || Boolean(plan.error)} onClick={onConfirm}>Aplicar al borrador</button></div>
    </div>
  </AppModal>;
}

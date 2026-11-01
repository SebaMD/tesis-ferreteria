import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProductAuditsRequest } from "../services/productAudits.service.js";
import { getApiError } from "../api/httpClient.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";
import { auditReadableRows, auditLocalDate, auditResponsible } from "../helpers/auditPresentation.js";
import { auditQueryFromSearch, auditQueryToSearch } from "../helpers/auditNavigation.js";

export default function ProductAuditHistory() {
  const location = useLocation(), navigate = useNavigate();
  const query = useMemo(() => auditQueryFromSearch(location.search), [location.search]);
  const back = Array.isArray(location.state?.auditBack) ? location.state.auditBack.filter(v => v === null || typeof v === "string") : [];
  const load = (next, previous) => navigate({ pathname: location.pathname, search: auditQueryToSearch(next) }, { state: { auditBack: previous, auditFocus: true } });
  return <AuditQuery key={`${location.key}:${location.search}`} query={query} back={back} onNavigate={load} focusResults={Boolean(location.state?.auditFocus)} />;
}
function AuditQuery({ query, back, onNavigate, focusResults }) {
  const [draft, setDraft] = useState(query);
  const [response, setResponse] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const listId = useId();
  const heading = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    getProductAuditsRequest(query, controller.signal).then(data => {
      if (!controller.signal.aborted) setResponse(data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(getApiError(e, "No se pudo consultar el historial"));
    }).finally(() => {
      if (!controller.signal.aborted) {
        setBusy(false);
        if (focusResults) requestAnimationFrame(() => heading.current?.focus());
      }
    });
    return () => controller.abort();
  }, [query, reload, focusResults]);
  function apply(e) { e.preventDefault(); onNavigate({ ...draft, cursor: null }, []); }
  const field = key => ({ value: draft[key], onChange: e => setDraft(v => ({ ...v, [key]: e.target.value })) });
  return <div className="grid min-w-0 gap-3">
      <form onSubmit={apply} className="grid min-w-0 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm">Operación<select {...field("operation")}><option value="">Todas las operaciones</option>{Object.entries(response?.operations || {}).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-sm">ID de producto<input type="number" min="1" max="2147483647" step="1" {...field("productId")} /></label>
        <div className="grid min-w-0 content-start gap-1"><label className="grid min-w-0 gap-1 text-sm">ID de familia<input aria-describedby="audit-family-help" type="number" min="1" max="2147483647" step="1" {...field("familyId")} /></label><p id="audit-family-help" className="m-0 text-xs font-normal text-slate-500">Agrupa las variantes de un producto</p></div>
        <label className="grid min-w-0 gap-1 text-sm">Desde (UTC)<input type="date" {...field("from")} /></label>
        <label className="grid min-w-0 gap-1 text-sm">Hasta (UTC, inclusive)<input type="date" min={draft.from || undefined} {...field("to")} /></label>
        <div className="flex min-w-0 flex-wrap items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm">Eventos por página<select {...field("limit")}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button type="submit" disabled={busy} className={`${secondaryButtonClass} audit-filter-action mr-0!`}>Filtrar</button></div>
      </form>
      {error && <div role="alert" className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600"><p className="m-0 break-words">{error}</p><button type="button" className={secondaryButtonClass} onClick={() => { setBusy(true); setError(""); setReload(v => v + 1); }}>Reintentar consulta</button></div>}
      <div role="status" className="table-result-count text-sm">{busy ? "Cargando cambios administrativos…" : !error ? `${response?.items.length || 0} eventos · Página ${back.length + 1} · Más recientes primero` : "Consulta no disponible"}</div>
      {!busy && !error && <section aria-label="Eventos administrativos" aria-busy={busy}>
        <h3 ref={heading} tabIndex={-1} className="sr-only">Resultados del historial de cambios</h3>
        {!response?.items.length ? <p className="rounded border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No hay cambios registrados para estos filtros.</p> : <div className="grid min-w-0 gap-2">
        <div aria-hidden="true" className="audit-event-columns px-3 text-xs font-bold text-slate-500"><div className="grid gap-3 lg:grid-cols-[1.1fr_1.4fr_1fr_1fr_1.5fr]"><span>Fecha y hora</span><span>Acción</span><span>Producto / familia</span><span>Administrador</span><span>Motivo</span></div><span className="text-center">Detalle</span></div>
        {response.items.map(event => <article key={event.id} className="min-w-0 rounded border border-slate-200 bg-white px-3 py-2">
          <div className="audit-event-summary"><dl className="m-0 grid min-w-0 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-[1.1fr_1.4fr_1fr_1fr_1.5fr]">
            <div className="min-w-0 break-words"><dt className="text-xs text-slate-500 lg:sr-only">Fecha y hora</dt><dd className="m-0"><time dateTime={event.at}>{auditLocalDate(event.at)}</time></dd></div>
            <div className="min-w-0 break-words"><dt className="text-xs text-slate-500 lg:sr-only">Acción</dt><dd className="m-0"><strong>{event.label}</strong></dd></div>
            <div className="min-w-0 break-words"><dt className="text-xs text-slate-500 lg:sr-only">Producto / familia</dt><dd className="m-0">{event.subject.productId ? `Producto #${event.subject.productId}` : ""}{event.subject.productId && event.subject.familyId ? " · " : ""}{event.subject.familyId ? `Familia #${event.subject.familyId}` : ""}{!event.subject.productId && !event.subject.familyId ? "Entidad no registrada" : ""}</dd></div>
            <div className="min-w-0 break-words"><dt className="text-xs text-slate-500 lg:sr-only">Administrador</dt><dd className="m-0">{auditResponsible(event)}</dd></div>
            <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-xs text-slate-500 lg:sr-only">Motivo</dt><dd className="m-0 line-clamp-2">{event.reason || "No registrado"}</dd></div>
          </dl><button type="button" className={`${secondaryButtonClass} audit-detail-action`} aria-expanded={expanded.has(event.id)} aria-controls={`${listId}-${event.id}`} aria-label={`${expanded.has(event.id)?"Ocultar":"Ver"} detalle: ${event.label}`} onClick={()=>setExpanded(current=>{const next=new Set(current);if(next.has(event.id))next.delete(event.id);else next.add(event.id);return next;})}>{expanded.has(event.id)?"Ocultar":"Ver detalle"}</button></div>
          <div id={`${listId}-${event.id}`} hidden={!expanded.has(event.id)} className="min-w-0">
            <div className="grid min-w-0 gap-3 border-t border-slate-200 mt-2 pt-3 text-sm">
              <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><strong>Motivo: </strong>{event.reason || "No registrado"}</p>
              {event.affectedProductIds.length > 0 && <div className="m-0 break-words"><strong>{event.operation==="DIMENSION_ADD"?"Variantes actualizadas":"Productos afectados"} ({event.affectedProductIds.length}): </strong>{event.affectedProductIds.slice(0,8).map(id => `Producto #${id}`).join(", ")}{event.affectedProductIds.length>8 ? <details className="mt-1"><summary className="cursor-pointer text-xs">Ver todos los productos afectados</summary><span>{event.affectedProductIds.map(id=>`Producto #${id}`).join(", ")}</span></details> : null}</div>}
              <dl className="m-0 grid min-w-0 gap-2 rounded border border-slate-200 bg-slate-50 p-3">{auditReadableRows(event).map((row, index) => <div key={index} data-change-kind={row.kind} className="min-w-0 break-words [overflow-wrap:anywhere]"><dt className="font-semibold">{row.label}</dt><dd className="m-0">{row.before !== undefined ? <><span className="text-slate-500">Anterior: </span>{row.before}<span aria-hidden="true"> → </span><span className="sr-only"> cambia a </span><span className="text-slate-500">Nuevo: </span></> : null}{row.after}{row.items?.length>0&&<details className="mt-1 text-xs"><summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-rust-500">Ver asignaciones por producto</summary><ul className="m-0 grid gap-x-4 gap-y-1 pl-4 sm:grid-cols-2">{row.items.map((item,i)=><li key={i}>{item}</li>)}</ul></details>}</dd></div>)}{!auditReadableRows(event).length && <div>Este evento no registra valores descriptivos suficientes para mostrar un cambio. Se conserva la información disponible arriba.</div>}</dl>
            </div>
          </div>
        </article>)}</div>}
      </section>}
      <nav aria-label="Páginas del historial de cambios" className="audit-history-pagination">
        <button type="button" className={secondaryButtonClass} disabled={busy || !back.length} onClick={() => onNavigate({ ...query, cursor: back.at(-1) }, back.slice(0, -1))}>Anterior</button>
        <span className="text-center text-sm" aria-current="page">Página {back.length + 1}</span>
        <button type="button" className={secondaryButtonClass} disabled={busy || Boolean(error) || !response?.nextCursor} onClick={() => onNavigate({ ...query, cursor: response.nextCursor }, [...back, query.cursor])}>Siguiente</button>
      </nav>
    </div>;
}

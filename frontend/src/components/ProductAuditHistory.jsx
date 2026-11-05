import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProductAuditsRequest } from "../services/productAudits.service.js";
import { getApiError } from "../api/httpClient.js";
import { secondaryButtonClass, tablePanelClass, tableScrollClass, tableHeadingClass, tableActionButtonClass, dateCellClass } from "../helpers/uiClasses.js";
import AppSelect from "./AppSelect.jsx";
import Pagination from "./Pagination.jsx";
import { auditReadableRows, auditLocalDate, auditResponsible } from "../helpers/auditPresentation.js";
import { auditAvailablePages, auditEmptyFilters, auditFilterValidationMessage, auditQueryFromSearch, auditQueryToSearch } from "../helpers/auditNavigation.js";

export default function ProductAuditHistory() {
  const location = useLocation(), navigate = useNavigate();
  const compatibleSize = !new URLSearchParams(location.search).has("limit") || new URLSearchParams(location.search).get("limit") === "10";
  const query = useMemo(() => { const parsed = auditQueryFromSearch(location.search); return { ...parsed, limit: "10", cursor: parsed.limit === "10" ? parsed.cursor : null }; }, [location.search]);
  const back = compatibleSize && Array.isArray(location.state?.auditBack) ? location.state.auditBack.filter(v => v === null || typeof v === "string") : [];
  const pages = compatibleSize && Array.isArray(location.state?.auditPages) ? location.state.auditPages.filter(v => v === null || typeof v === "string") : [];
  const load = useCallback((next, previous, { automatic = false, pages = [] } = {}) => navigate({ pathname: location.pathname, search: auditQueryToSearch(next) }, { replace: automatic, state: { auditBack: previous, auditPages: automatic ? [null] : pages } }), [location.pathname, navigate]);
  return <AuditQuery query={query} back={back} knownPages={pages} onNavigate={load} />;
}
function AuditQuery({ query, back, knownPages, onNavigate }) {
  const [draftState, setDraftState] = useState({ query, filters: query, incomplete: {} });
  if (draftState.query !== query) setDraftState({ query, filters: query, incomplete: {} });
  const draft = draftState.filters;
  const validationError = auditFilterValidationMessage(draft, draftState.incomplete);
  const [response, setResponse] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [pageHeight, setPageHeight] = useState(0);
  const listId = useId();
  const operationId = `${listId}-operation`;
  const dateHelpId = `${listId}-dates`;
  const results = useRef(null);
  const apply = useCallback((filters, incomplete = {}) => {
    if (auditFilterValidationMessage(filters, incomplete)) return;
    const next = { ...filters, cursor: null };
    if (auditQueryToSearch(next) !== auditQueryToSearch({ ...query, cursor: null })) { setPageHeight(0); onNavigate(next, [], { automatic: true }); }
  }, [query, onNavigate]);
  useEffect(() => {
    const timer = window.setTimeout(() => apply(draft, draftState.incomplete), 450);
    return () => window.clearTimeout(timer);
  }, [draft, draftState.incomplete, apply]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true);
      setError("");
      const invalid = auditFilterValidationMessage(query);
      if (invalid) { setError(invalid); setBusy(false); return; }
      try {
        const data = await getProductAuditsRequest(query, controller.signal);
        if (!controller.signal.aborted) { setResponse({ ...data, query }); setExpanded(new Set()); }
      } catch (e) {
        if (!controller.signal.aborted) setError(getApiError(e, "No se pudo consultar el historial"));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [query, reload]);
  const changeField = (key, value, badInput = false) => {
    const filters = { ...draft, [key]: value };
    const incomplete = { ...draftState.incomplete, [key]: badInput };
    setDraftState({ query, filters, incomplete });
    if (key === "operation") apply(filters, incomplete);
  };
  const field = key => ({ value: draft[key], onChange: e => changeField(key, e.target.value, Boolean(e.target.validity?.badInput)) });
  const page = back.length + 1;
  const ready = !busy && !error && response?.query === query;
  const pages = ready ? auditAvailablePages(query.cursor, back, knownPages, response.nextCursor) : knownPages.length ? knownPages : [...back, query.cursor];
  const goToPage = nextPage => {
    if (!ready || nextPage === page || !Number.isInteger(nextPage) || nextPage < 1 || nextPage > pages.length) return;
    // Keep the table/footer in place while loading or showing a shorter final page.
    setPageHeight(current => Math.max(current, results.current?.getBoundingClientRect().height || 0));
    onNavigate({ ...query, cursor: pages[nextPage - 1] }, pages.slice(0, nextPage - 1), { pages });
  };
  return <div className="grid min-w-0 gap-3">
      <form onSubmit={e => { e.preventDefault(); apply(draft, draftState.incomplete); }} className="grid min-w-0 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid min-w-0 gap-1 text-sm"><label htmlFor={operationId}>Operación</label><AppSelect id={operationId} ariaLabel="Operación" searchable value={draft.operation} onChange={value => changeField("operation", value)} options={[{ value: "", label: "Todas las operaciones" }, ...Object.entries(response?.operations || {}).map(([value, label]) => ({ value, label }))]} renderOption={option => <span className="whitespace-normal break-words py-2">{option.label}</span>} /></div>
        <label className="grid min-w-0 gap-1 text-sm">ID de producto<input type="number" min="1" max="2147483647" step="1" {...field("productId")} /></label>
        <div className="grid min-w-0 content-start gap-1"><label className="grid min-w-0 gap-1 text-sm">ID de familia<input aria-describedby="audit-family-help" type="number" min="1" max="2147483647" step="1" {...field("familyId")} /></label><p id="audit-family-help" className="m-0 text-xs font-normal text-slate-500">Agrupa las variantes de un producto</p></div>
        <label className="grid min-w-0 gap-1 text-sm">Desde<input type="date" aria-describedby={dateHelpId} {...field("from")} /></label>
        <label className="grid min-w-0 gap-1 text-sm">Hasta<input type="date" aria-describedby={dateHelpId} min={draft.from || undefined} {...field("to")} /></label>
        <div className="audit-page-controls grid min-w-0 self-end"><button type="button" className={`${secondaryButtonClass} mr-0! w-full justify-center`} onClick={() => { setPageHeight(0); setDraftState({ query, filters: auditEmptyFilters, incomplete: {} }); if (query.cursor) onNavigate({ ...auditEmptyFilters, cursor: null }, [], { automatic: true }); else apply(auditEmptyFilters); }}>Limpiar filtros</button></div>
        <p id={dateHelpId} className="m-0 text-xs text-slate-500 sm:col-span-2 lg:col-span-3">Desde y Hasta filtran días completos en UTC; Hasta incluye todo el día. La hora de los eventos se muestra en America/Santiago (Chile).</p>
      </form>
      {validationError && <p role="alert" className="m-0 text-sm text-critical-600">{validationError} Se conservan los últimos filtros aplicados.</p>}
      <section className={`${tablePanelClass} audit-events-panel`} aria-label="Eventos administrativos" aria-busy={busy}>
        <header className={tableHeadingClass}><p role="status" className="table-result-count">{busy ? "Cargando cambios administrativos…" : !error ? `Mostrando ${response?.items.length || 0} cambios administrativos · Página ${page}` : "Consulta no disponible"}{busy && response && <span className="sr-only"> Se conservan los registros anteriores mientras se actualiza la consulta.</span>}</p></header>
        {error && <div role="alert" className="m-3 rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600"><p className="m-0 break-words">{error}</p><button type="button" className={secondaryButtonClass} onClick={() => { setBusy(true); setError(""); setReload(v => v + 1); }}>Reintentar consulta</button></div>}
        <div ref={results} className="audit-table-content" style={{ minHeight: pageHeight || undefined }}>
        {!response?.items.length ? !busy && !error && <p className="m-0 p-5 text-center text-sm text-slate-500">No hay cambios registrados para estos filtros.</p> : <div className={tableScrollClass}>
        <table className="fyf-data-table audit-events-table w-full" aria-label="Historial de cambios administrativos">
          <thead className="max-[1023px]:sr-only"><tr>{["Fecha y hora", "Operación", "Producto / familia", "Responsable", "Motivo", "Detalle"].map(label => <th scope="col" className={label === "Detalle" ? "text-center" : undefined} key={label}>{label}</th>)}</tr></thead>
          <tbody>{response.items.map(event => <Fragment key={event.id}>
          <tr className="audit-event-summary">
            <td data-label="Fecha y hora" className={dateCellClass}><time dateTime={event.at}>{auditLocalDate(event.at)}</time></td>
            <td data-label="Operación" className="table-description-cell"><strong>{event.label}</strong></td>
            <td data-label="Producto / familia">{event.subject.productId ? `Producto #${event.subject.productId}` : ""}{event.subject.productId && event.subject.familyId ? " · " : ""}{event.subject.familyId ? `Familia #${event.subject.familyId}` : ""}{!event.subject.productId && !event.subject.familyId ? "Entidad no registrada" : ""}</td>
            <td data-label="Responsable">{auditResponsible(event)}</td>
            <td data-label="Motivo" className="table-description-cell"><span className="line-clamp-2">{event.reason || "No registrado"}</span></td>
            <td className="text-center"><button type="button" disabled={!ready} className={`${secondaryButtonClass} ${tableActionButtonClass} audit-detail-action`} aria-expanded={expanded.has(event.id)} aria-controls={`${listId}-${event.id}`} aria-label={`${expanded.has(event.id)?"Ocultar":"Ver"} detalle: ${event.label}`} onClick={()=>setExpanded(current=>{const next=new Set(current);if(next.has(event.id))next.delete(event.id);else next.add(event.id);return next;})}>{expanded.has(event.id)?"Ocultar":"Ver detalle"}</button></td>
          </tr>
          <tr id={`${listId}-${event.id}`} hidden={!expanded.has(event.id)} className="audit-event-detail"><td colSpan={6} className="table-description-cell">
            <div className="grid min-w-0 gap-3 border-t border-slate-200 mt-2 pt-3 text-sm">
              <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><strong>Motivo: </strong>{event.reason || "No registrado"}</p>
              {event.affectedProductIds.length > 0 && <div className="m-0 break-words"><strong>{event.operation==="DIMENSION_ADD"?"Variantes actualizadas":"Productos afectados"} ({event.affectedProductIds.length}): </strong>{event.affectedProductIds.slice(0,8).map(id => `Producto #${id}`).join(", ")}{event.affectedProductIds.length>8 ? <details className="mt-1"><summary className="cursor-pointer text-xs">Ver todos los productos afectados</summary><span>{event.affectedProductIds.map(id=>`Producto #${id}`).join(", ")}</span></details> : null}</div>}
              <dl className="m-0 grid min-w-0 gap-2 rounded border border-slate-200 bg-slate-50 p-3">{auditReadableRows(event).map((row, index) => <div key={index} data-change-kind={row.kind} className="min-w-0 break-words [overflow-wrap:anywhere]"><dt className="font-semibold">{row.label}</dt><dd className="m-0">{row.before !== undefined ? <><span className="text-slate-500">Anterior: </span>{row.before}<span aria-hidden="true"> → </span><span className="sr-only"> cambia a </span><span className="text-slate-500">Nuevo: </span></> : null}{row.after}{row.items?.length>0&&<details className="mt-1 text-xs"><summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-rust-500">Ver asignaciones por producto</summary><ul className="m-0 grid gap-x-4 gap-y-1 pl-4 sm:grid-cols-2">{row.items.map((item,i)=><li key={i}>{item}</li>)}</ul></details>}</dd></div>)}{!auditReadableRows(event).length && <div>Este evento no registra valores descriptivos suficientes para mostrar un cambio. Se conserva la información disponible arriba.</div>}</dl>
            </div>
          </td></tr>
        </Fragment>)}</tbody></table></div>}
        </div>
        <div className="audit-history-pagination"><Pagination page={page} pageSize={10} totalPages={pages.length} onPageChange={goToPage} disabled={!ready} alwaysVisible ariaLabel="Páginas del historial de cambios" /></div>
      </section>
    </div>;
}

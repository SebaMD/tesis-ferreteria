import { ChevronDown, ChevronRight, Copy, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../../api/httpClient.js";
import { getAdministrativeOrderSummaryRequest } from "../../services/orderLogistics.service.js";
import { canViewAdministrativeOrder, formatAdministrativeOrderText, getAdministrativeOrderSections, printAdministrativeOrder } from "../../helpers/administrativeOrder.js";
import { formatClp } from "../../helpers/formatters.js";
import ResponsiveTableView, { MobileDetailField, MobileDetailGrid } from "../ResponsiveTableView.jsx";
import OrderItemPromotion from "./OrderItemPromotion.jsx";

export default function AdministrativeOrderCard({ orderId, role }) {
  const allowed = canViewAdministrativeOrder(role);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    getAdministrativeOrderSummaryRequest(orderId).then((data) => {
      if (active) setModel(data);
    }).catch((requestError) => {
      if (active) setError(getApiError(requestError, "No se pudo cargar la ficha administrativa"));
    });
    return () => { active = false; };
  }, [allowed, orderId]);
  if (!allowed) return null;
  const copy = async () => {
    if (!model || copying) return;
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Portapapeles no disponible");
      await navigator.clipboard.writeText(formatAdministrativeOrderText(model));
      toast.success("Datos copiados para registro manual");
    } catch {
      toast.error("No se pudo copiar. Puedes seleccionar los datos o imprimir la ficha.");
    } finally { setCopying(false); }
  };
  const print = () => {
    if (!model) return;
    try { printAdministrativeOrder(model); }
    catch { toast.error("No se pudo abrir la impresión de la ficha"); }
  };
  const sections = model ? getAdministrativeOrderSections(model) : [];
  const fieldsSection = (section, economic = false, boxed = false) => <section className={boxed ? "grid min-w-0 gap-2.5 rounded-md border border-slate-200 bg-slate-50 p-3" : "grid gap-2.5"} key={section.title}>
    <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">{section.title}</h4>
    <dl className={`m-0 grid gap-x-4 gap-y-2.5 max-[620px]:grid-cols-1 ${economic ? "grid-cols-3 rounded-md border border-slate-200 bg-slate-50 p-3" : "grid-cols-2"}`}>
      {section.fields.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 ml-0 break-words text-sm font-semibold text-ink-950">{value}</dd></div>)}
    </dl>
  </section>;
  const promotionItem = (item) => ({ ...item, promotionTypeSnapshot: item.promotionType, promotionNameSnapshot: item.promotionName, promotionValueSnapshot: item.promotionValue });
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" aria-label="Ficha administrativa para registro manual">
      <h3 className="m-0">
        <button type="button" className="min-h-0! w-full justify-between rounded-none border-0! bg-white px-3.5! py-3! text-left text-ink-950 hover:bg-slate-100"
          onClick={() => setExpanded(current => !current)} aria-expanded={expanded} aria-controls={contentId}>
          <span className="text-sm font-bold">Ficha administrativa para registro manual</span>
          {expanded ? <ChevronDown size={18} className="shrink-0" aria-hidden="true" /> : <ChevronRight size={18} className="shrink-0" aria-hidden="true" />}
        </button>
      </h3>
      <div id={contentId} hidden={!expanded} className={expanded ? "grid gap-4 border-t border-slate-200 p-3.5" : "hidden"}>
      {!model && !error && <span className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin" /> Cargando ficha...</span>}
      {error && <p className="m-0 text-sm text-critical-600" role="alert">{error}</p>}
      {model && <>
        <p className="m-0 text-xs leading-5 text-slate-600">{model.notice}</p>
        {fieldsSection(sections[0], false, true)}
        {fieldsSection(sections[1], false, true)}
        <section className="grid min-w-0 gap-2.5">
          <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Productos comprados</h4>
        <ResponsiveTableView rows={model.items} getRowKey={(item) => item.productId} getRowLabel={(item) => item.productName} resetKey={model.folio}
          renderSummary={(item) => <div><strong className="text-sm text-ink-950">{item.productName}</strong><OrderItemPromotion item={promotionItem(item)} compact /></div>}
          renderDetails={(item) => <MobileDetailGrid><MobileDetailField label="Cantidad">{item.quantity}</MobileDetailField><MobileDetailField label="Precio unitario">{formatClp(item.unitPrice)}</MobileDetailField><MobileDetailField label="Descuento">{formatClp(item.discountAmount)}</MobileDetailField><MobileDetailField label="Subtotal">{formatClp(item.subtotal)}</MobileDetailField></MobileDetailGrid>}
          desktop={<div className="overflow-x-auto"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Descuento</th><th>Subtotal</th></tr></thead><tbody>{model.items.map((item) => <tr key={item.productId}><td>{item.productName}<OrderItemPromotion item={promotionItem(item)} compact /></td><td>{item.quantity}</td><td>{formatClp(item.unitPrice)}</td><td>{formatClp(item.discountAmount)}</td><td>{formatClp(item.subtotal)}</td></tr>)}</tbody></table></div>} />
        </section>
        {fieldsSection(sections[2], true)}
        {fieldsSection(sections[3])}
      </>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 px-3.5 py-2.5" aria-label="Acciones de la ficha administrativa">
        <button className="min-h-9 border-slate-300 bg-white text-xs text-ink-700 hover:bg-slate-100 max-[620px]:flex-1" type="button" onClick={copy} disabled={!model || copying}><Copy size={16} /> Copiar datos para registro manual</button>
        <button className="min-h-9 border-slate-300 bg-white text-xs text-ink-700 hover:bg-slate-100 max-[620px]:flex-1" type="button" onClick={print} disabled={!model}><Printer size={16} /> Imprimir ficha</button>
      </div>
    </section>
  );
}

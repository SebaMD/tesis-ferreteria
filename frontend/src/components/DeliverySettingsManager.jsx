import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import DeliveryConditions from "./DeliveryConditions.jsx";
import api from "../api/httpClient.js";
import { getApiError } from "../api/httpClient.js";
import { formatClp, formatDate } from "../helpers/formatters.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";

const initial = { deliveryEnabled: true, conditionalFreeEnabled:false,conditionalFreeFrom:500000,approvalValidityHours:24,evaluationValidityHours:72 };
export default function DeliverySettingsManager({ role }) {
  const { refreshNotices, deliveryInformation } = useCustomerNotice();
  const canConfigure = ["ADMIN", "MANAGER"].includes(role);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  useEffect(() => {
    if (!open || !canConfigure) return;
    let active = true;
    api.get("/delivery-quotes/settings").then(({ data }) => {
      if (!active) return;
      const policy=data.data.policy;
      setCurrent(policy);
      setForm(policy?.pricingMode==="MANUAL_QUOTE"?{deliveryEnabled:policy.deliveryEnabled,conditionalFreeEnabled:policy.conditionalFreeEnabled,conditionalFreeFrom:Number(policy.conditionalFreeFrom),approvalValidityHours:policy.approvalValidityHours,evaluationValidityHours:policy.evaluationValidityHours}:initial);
    }).catch(e => { if (active) setError(getApiError(e, "No se pudo cargar la configuración")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, canConfigure]);
  if (!canConfigure) return null;
  const edit = (key, value) => { setForm(f => ({ ...f, [key]: value })); setReview(false); };
  const save = async event => {
    event.preventDefault();
    if (!canConfigure || loading || error) return;
    if (!review) { setReview(true); return; }
    setLoading(true);
    try {
      await api.put("/delivery-quotes/settings", {...form,expectedRevisionId:current?.id??null});
      toast.success("Configuración de despacho guardada como nueva revisión"); setOpen(false);
      refreshNotices();
    } catch (e) { setError(getApiError(e, "No se pudo guardar la configuración")); }
    finally { setLoading(false); }
  };
  return <>
    <button type="button" className="border-slate-300 bg-white text-ink-950 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-rust-500 max-[720px]:w-full max-[720px]:justify-center" onClick={() => { setError(""); setReview(false); setLoading(true); setOpen(true); }}><Settings size={17} /> Configurar despacho</button>
    <AppModal open={open} onClose={() => !loading && setOpen(false)} title="Configurar despacho" description="Condiciones informadas por FYF. No modifica pedidos anteriores ni habilita pagos con fletes pendientes.">
      <form onSubmit={save} className="grid gap-4">
        {error && <p role="alert" className="text-sm text-critical-600">{error}</p>}
        <p className="m-0 text-xs text-slate-600">{current ? `Versión ${current.version} · ${formatDate(current.createdAt)} · Usuario #${current.createdBy}` : "Sin política vigente. Confirmar creará la primera revisión manual."}</p>
        {current?.pricingMode!=="MANUAL_QUOTE"&&<p role="status" className="checkout-quote-alert rounded-md p-3 text-sm">Modo manual aún no activado. Las solicitudes y pagos dependen de su activación explícita. Las revisiones anteriores se conservarán.</p>}
        <fieldset disabled={loading || Boolean(error)} className="grid min-w-0 gap-3 border-0 p-0">
          <label className="flex! items-start gap-2 text-sm"><input className="mt-0.5 size-4! min-h-0! shrink-0 accent-rust-500" type="checkbox" checked={form.deliveryEnabled} onChange={e => edit("deliveryEnabled", e.target.checked)} /> Despacho a domicilio habilitado</label>
          <small className="text-slate-500">Modo manual: FYF debe aprobar cada flete y el comprador debe aceptar el total antes de pagar. El retiro continúa sin cargo.</small>
          <label className="flex! items-center gap-2 text-sm"><input type="checkbox" className="size-4! min-h-0!" checked={form.conditionalFreeEnabled} onChange={e=>edit("conditionalFreeEnabled",e.target.checked)}/>Permitir evaluar gratuidad condicionada</label>
          {[["conditionalFreeFrom","Neto mínimo para evaluar gratuidad (CLP)",1,9999999999],["evaluationValidityHours","Vigencia de solicitudes (horas desde creación)",1,720],["approvalValidityHours","Vigencia de aprobaciones (horas desde aprobación)",1,168]].map(([key,label,min,max])=><label key={key} className="grid gap-1 text-sm">{label}<input type="number" required min={min} max={max} step="1" value={form[key]} onChange={e=>edit(key,Number(e.target.value))}/></label>)}
          <small className="text-slate-500">24/72 horas son plazos provisionales del sistema, no condiciones confirmadas por FYF. El umbral no aplica gratuidad automática: exige coordinación, entrega no urgente y aprobación.</small>
        </fieldset>
        <DeliveryConditions information={deliveryInformation} />
        <div className="rounded-[5px] border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <strong className="text-ink-950">Importe siempre aprobado manualmente</strong>
          <p className="my-1">No se utiliza la tarifa fija DEMO ni el antiguo umbral automático. Confirmar esta configuración no aprueba fletes ni altera pedidos históricos.</p>
        </div>
        {current && (!current.pickupEnabled || current.minimumProductsTotal != null) && <p className="checkout-quote-alert rounded-md p-3 text-sm">La política vigente conserva reglas anteriores: retiro {current.pickupEnabled ? "habilitado" : "deshabilitado"}; compra mínima {current.minimumProductsTotal == null ? "desactivada" : formatClp(current.minimumProductsTotal)}. Solo al confirmar una nueva revisión se habilitará el retiro y se quitará la compra mínima. Nada cambia al abrir este formulario.</p>}
        {review && <div role="status" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><strong>Revisa antes de confirmar</strong><p>Retiro: $0. Despacho: {form.deliveryEnabled?"manual habilitado":"deshabilitado"}. Beneficio condicionado: {form.conditionalFreeEnabled?`desde ${formatClp(form.conditionalFreeFrom)}, sujeto a aprobación`:"deshabilitado"}.</p><p>Solicitudes: {form.evaluationValidityHours} h; aprobaciones: {form.approvalValidityHours} h. No se aprueba ningún flete con este guardado.</p></div>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={loading}>Cancelar</button><button disabled={loading || Boolean(error)} type="submit">{loading ? "Cargando..." : review ? "Confirmar y guardar revisión" : "Revisar cambios"}</button></div>
      </form>
    </AppModal>
  </>;
}

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import api from "../api/httpClient.js";
import { getApiError } from "../api/httpClient.js";
import { formatClp, formatDate } from "../helpers/formatters.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";

const initial = { deliveryEnabled: true, flatFee: "3000", freeShippingFrom: "", isDemo: true };
export default function DeliverySettingsManager({ role }) {
  const { refreshNotices } = useCustomerNotice();
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
    api.get("/delivery-settings").then(({ data }) => {
      if (!active) return;
      setCurrent(data.data);
      setForm(data.data ? { deliveryEnabled: data.data.deliveryEnabled,
        flatFee: String(Number(data.data.flatFee)),
        freeShippingFrom: data.data.freeShippingFrom == null ? "" : String(Number(data.data.freeShippingFrom)), isDemo: data.data.isDemo } : initial);
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
      await api.put("/delivery-settings", { ...form, expectedRevisionId: current?.id ?? null,
        flatFee: Number(form.flatFee),
        freeShippingFrom: form.freeShippingFrom === "" ? null : Number(form.freeShippingFrom) });
      toast.success("Configuración de despacho guardada como nueva revisión"); setOpen(false);
      refreshNotices();
    } catch (e) { setError(getApiError(e, "No se pudo guardar la configuración")); }
    finally { setLoading(false); }
  };
  const inputClass = "w-full rounded-[5px] border border-slate-300 bg-white px-3 py-2 text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-500";
  return <>
    <button type="button" className="border-slate-300 bg-white text-ink-950 hover:bg-slate-100 max-[720px]:w-full max-[720px]:justify-center" onClick={() => { setError(""); setReview(false); setLoading(true); setOpen(true); }}><Settings size={17} /> Configurar despacho</button>
    <AppModal open={open} onClose={() => !loading && setOpen(false)} title="Configurar despacho" description="Tarifa fija para compras online. No modifica ventas presenciales ni pedidos anteriores.">
      <form onSubmit={save} className="grid gap-4">
        {error && <p role="alert" className="text-sm text-critical-600">{error}</p>}
        <p className="m-0 text-xs text-slate-600">{current ? `Versión ${current.version} · ${formatDate(current.createdAt)} · ${current.responsible}` : "Sin política vigente. Los valores iniciales no se aplican hasta confirmar el guardado."}</p>
        <fieldset disabled={loading || Boolean(error)} className="grid min-w-0 gap-3 border-0 p-0">
          <label className="flex! items-start gap-2 text-sm"><input className="mt-0.5 size-4! min-h-0! shrink-0 accent-rust-500" type="checkbox" checked={form.deliveryEnabled} onChange={e => edit("deliveryEnabled", e.target.checked)} /> Despacho a domicilio habilitado</label>
          <label className="grid gap-1 text-sm">Tarifa fija de despacho (CLP)<input className={inputClass} type="number" min="0" max="9999999999" step="1" required value={form.flatFee} onChange={e => edit("flatFee", e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Despacho gratuito desde (opcional)<input className={inputClass} type="number" min="1" max="9999999999" step="1" placeholder="Desactivado" value={form.freeShippingFrom} onChange={e => edit("freeShippingFrom", e.target.value)} /></label>
          <small className="text-slate-500">El umbral usa el total neto de productos después de descuentos, antes del despacho. Deja el campo vacío para desactivarlo. El retiro permanece disponible sin cargo y no se exige compra mínima para despacho.</small>
          <label className="flex! items-start gap-2 text-sm"><input className="mt-0.5 size-4! min-h-0! shrink-0 accent-rust-500" type="checkbox" checked={form.isDemo} onChange={e => edit("isDemo", e.target.checked)} /> Valores DEMO ficticios, no oficiales de FYF</label>
        </fieldset>
        {current && (!current.pickupEnabled || current.minimumProductsTotal != null) && <p className="checkout-quote-alert rounded-md p-3 text-sm">La política vigente conserva reglas anteriores: retiro {current.pickupEnabled ? "habilitado" : "deshabilitado"}; compra mínima {current.minimumProductsTotal == null ? "desactivada" : formatClp(current.minimumProductsTotal)}. Solo al confirmar una nueva revisión se habilitará el retiro y se quitará la compra mínima. Nada cambia al abrir este formulario.</p>}
        {review && <div role="status" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><strong>Revisa antes de confirmar</strong><p>Retiro: $0, siempre habilitado. Despacho: {form.deliveryEnabled ? formatClp(form.flatFee) : "Deshabilitado"}.</p><p>Sin compra mínima. Gratuidad desde: {form.freeShippingFrom === "" ? "Desactivada" : formatClp(form.freeShippingFrom)} (neto de productos después de descuentos).</p><p>{form.isDemo ? "DEMO: no representa tarifas oficiales de FYF." : "Configuración no marcada como DEMO. Confirma que FYF autorizó estos valores."} Se conservará la versión anterior y los pedidos existentes no cambiarán.</p></div>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={loading}>Cancelar</button><button disabled={loading || Boolean(error)} type="submit">{loading ? "Cargando..." : review ? "Confirmar y guardar revisión" : "Revisar cambios"}</button></div>
      </form>
    </AppModal>
  </>;
}

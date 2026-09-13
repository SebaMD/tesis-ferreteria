import { Megaphone, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import {
  getCustomerNoticeConfigurationRequest,
  updateCustomerNoticeConfigurationRequest,
} from "../services/customerNotice.service.js";

export default function CustomerNoticeManager() {
  const { refreshNotice } = useCustomerNotice();
  const [form, setForm] = useState({ title: "", message: "", active: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getCustomerNoticeConfigurationRequest()
      .then((data) => { if (active) setForm({ title: data.title || "", message: data.message || "", active: Boolean(data.active) }); })
      .catch((error) => { if (active) toast.error(getApiError(error, "No se pudo cargar el aviso")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await updateCustomerNoticeConfigurationRequest({
        title: form.title.trim(),
        message: form.message.trim(),
        active: form.active,
      });
      setForm({ title: updated.title || "", message: updated.message || "", active: Boolean(updated.active) });
      await refreshNotice({ revealChanged: false });
      toast.success("Aviso a clientes actualizado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo guardar el aviso"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,21,31,0.05)] max-[720px]:p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-rust-50 text-rust-600"><Megaphone size={20} /></span>
        <div>
          <h2 className="m-0 text-base font-bold text-ink-950">Aviso a clientes</h2>
          <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Comunica cambios operacionales sin detener las compras online.</p>
        </div>
      </div>
      {loading ? <p className="m-0 text-sm text-slate-500">Cargando configuración…</p> : (
        <form className="grid gap-3" onSubmit={submit}>
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">Título
            <input maxLength="120" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ej.: Horario especial" required={form.active} />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">Mensaje
            <textarea className="min-h-28 resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2.5 text-sm text-ink-950" maxLength="1000" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Escribe la información que verán los clientes." required={form.active} />
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-ink-700">
            <input className="size-4 min-h-0 w-4" type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Mostrar aviso a los clientes
          </label>
          <button className="w-fit max-[480px]:w-full" type="submit" disabled={saving}><Save size={17} /> {saving ? "Guardando…" : "Guardar cambios"}</button>
        </form>
      )}
    </section>
  );
}

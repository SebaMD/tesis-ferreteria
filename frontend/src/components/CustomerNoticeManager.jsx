import { Edit3, Megaphone, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import {
  createCustomerNoticeRequest,
  deleteCustomerNoticeRequest,
  getCustomerNoticeConfigurationRequest,
  updateCustomerNoticeRequest,
} from "../services/customerNotice.service.js";
import AppModal from "./AppModal.jsx";

const EMPTY_FORM = {
  title: "",
  message: "",
  isActive: false,
  sortOrder: 0,
  displaySeconds: 7,
  startsAt: "",
  endsAt: "",
  indefinite: true,
};

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function noticeForm(notice) {
  return {
    title: notice.title || "",
    message: notice.message || "",
    isActive: Boolean(notice.isActive),
    sortOrder: Number(notice.sortOrder) || 0,
    displaySeconds: Number(notice.displaySeconds) || 7,
    startsAt: toLocalDateTime(notice.startsAt),
    endsAt: toLocalDateTime(notice.endsAt),
    indefinite: !notice.endsAt,
  };
}

function noticePayload(form) {
  return {
    title: form.title.trim(),
    message: form.message.trim(),
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder),
    displaySeconds: Number(form.displaySeconds),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: !form.indefinite && form.endsAt ? new Date(form.endsAt).toISOString() : null,
  };
}

function scheduleStatus(notice) {
  const now = Date.now();
  const starts = notice.startsAt ? new Date(notice.startsAt).getTime() : null;
  const ends = notice.endsAt ? new Date(notice.endsAt).getTime() : null;
  if (starts !== null && starts > now) return { label: "Próximo", className: "bg-blue-50 text-blue-900" };
  if (ends !== null && ends <= now) return { label: "Vencido", className: "bg-critical-50 text-critical-600" };
  return { label: "Vigente", className: "bg-positive-50 text-positive-600" };
}

function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Sin límite";
}

export default function CustomerNoticeManager({ embedded = false }) {
  const { refreshNotices } = useCustomerNotice();
  const [notices, setNotices] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadNotices = useCallback(async () => {
    try {
      setNotices(await getCustomerNoticeConfigurationRequest());
    } catch (error) {
      toast.error(getApiError(error, "No se pudieron cargar los avisos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotices();
  }, [loadNotices]);

  const startCreate = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
  };

  const startEdit = (notice) => {
    setEditingId(notice.id);
    setForm(noticeForm(notice));
  };

  const persist = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = noticePayload(form);
      if (editingId === "new") await createCustomerNoticeRequest(payload);
      else await updateCustomerNoticeRequest(editingId, payload);
      await Promise.all([loadNotices(), refreshNotices()]);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast.success(editingId === "new" ? "Aviso creado" : "Aviso actualizado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo guardar el aviso"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (notice) => {
    try {
      await updateCustomerNoticeRequest(notice.id, {
        ...noticePayload(noticeForm(notice)),
        isActive: !notice.isActive,
      });
      await Promise.all([loadNotices(), refreshNotices()]);
      toast.success(notice.isActive ? "Aviso desactivado" : "Aviso activado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cambiar el estado del aviso"));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCustomerNoticeRequest(deleteTarget.id);
      await Promise.all([loadNotices(), refreshNotices()]);
      if (editingId === deleteTarget.id) setEditingId(null);
      setDeleteTarget(null);
      toast.success("Aviso eliminado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo eliminar el aviso"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={embedded ? "grid gap-4" : "rounded-md border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,21,31,0.05)] max-[720px]:p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-rust-50 text-rust-600"><Megaphone size={20} /></span>
          <div>
            <h2 className="m-0 text-base font-bold text-ink-950">Avisos a clientes</h2>
            <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Administra los mensajes que acompañan la presentación del catálogo.</p>
          </div>
        </div>
        <button className="min-h-10" type="button" onClick={startCreate}><Plus size={17} /> Nuevo aviso</button>
      </div>

      {loading ? <p className="m-0 text-sm text-slate-500">Cargando avisos…</p> : (
        <div className="grid gap-3">
          {notices.length === 0 && (
            <p className="m-0 rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Aún no existen avisos.</p>
          )}
          {notices.map((notice) => {
            const phase = scheduleStatus(notice);
            return (
              <article className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4" key={notice.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block text-sm text-ink-950">{notice.title || "Aviso sin título"}</strong>
                    <p className="mt-1 mb-0 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{notice.message || "Sin mensaje"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${notice.isActive ? "bg-positive-50 text-positive-600" : "bg-slate-100 text-slate-600"}`}>{notice.isActive ? "Activo" : "Inactivo"}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${phase.className}`}>{phase.label}</span>
                    {!notice.endsAt && <span className="rounded-full bg-rust-50 px-2 py-1 text-[11px] font-bold text-rust-600">Indefinido</span>}
                  </div>
                </div>
                <dl className="m-0 grid grid-cols-4 gap-2 text-xs max-[720px]:grid-cols-2">
                  <div><dt className="font-bold text-slate-500">Orden</dt><dd className="m-0 mt-1 text-ink-700">{notice.sortOrder}</dd></div>
                  <div><dt className="font-bold text-slate-500">Duración</dt><dd className="m-0 mt-1 text-ink-700">{notice.displaySeconds} s</dd></div>
                  <div><dt className="font-bold text-slate-500">Inicio</dt><dd className="m-0 mt-1 text-ink-700">{formatDateTime(notice.startsAt)}</dd></div>
                  <div><dt className="font-bold text-slate-500">Término</dt><dd className="m-0 mt-1 text-ink-700">{formatDateTime(notice.endsAt)}</dd></div>
                </dl>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => toggleActive(notice)}>{notice.isActive ? "Desactivar" : "Activar"}</button>
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => startEdit(notice)}><Edit3 size={16} /> Editar</button>
                  <button className="border-critical-600 bg-white text-critical-600 hover:bg-critical-50" type="button" onClick={() => setDeleteTarget(notice)}><Trash2 size={16} /> Eliminar</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingId !== null && (
        <form className="grid gap-3 rounded-md border border-rust-500 bg-rust-50/40 p-4" onSubmit={persist}>
          <strong className="text-sm text-ink-950">{editingId === "new" ? "Crear aviso" : "Editar aviso"}</strong>
          <label>Título
            <input maxLength="120" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
          </label>
          <label>Mensaje
            <textarea className="min-h-28 resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2.5 text-sm text-ink-950" maxLength="1000" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} required />
          </label>
          <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
            <label>Orden
              <input type="number" min="0" max="9999" step="1" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} required />
            </label>
            <label>Tiempo en pantalla (segundos)
              <input type="number" min="3" max="30" step="1" value={form.displaySeconds} onChange={(event) => setForm((current) => ({ ...current, displaySeconds: event.target.value }))} required />
            </label>
            <label>Inicio de vigencia (opcional)
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
            </label>
            <label>Término de vigencia (opcional)
              <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} disabled={form.indefinite} required={!form.indefinite} />
            </label>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-ink-700">
              <input className="size-4 min-h-0 w-4" type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
              Aviso activo
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-ink-700">
              <input className="size-4 min-h-0 w-4" type="checkbox" checked={form.indefinite} onChange={(event) => setForm((current) => ({ ...current, indefinite: event.target.checked, endsAt: event.target.checked ? "" : current.endsAt }))} />
              Vigencia indefinida
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => setEditingId(null)}>Cancelar</button>
            <button type="submit" disabled={saving}><Save size={17} /> {saving ? "Guardando…" : "Guardar aviso"}</button>
          </div>
        </form>
      )}

      <AppModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar aviso"
        description="Esta acción elimina el aviso de forma permanente."
        size="small"
        footer={(
          <>
            <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button className="border-critical-600 bg-critical-600 hover:bg-red-700" type="button" onClick={remove} disabled={saving}>Eliminar</button>
          </>
        )}
      >
        <p className="m-0 text-sm text-slate-600">¿Eliminar “{deleteTarget?.title}”?</p>
      </AppModal>
    </section>
  );
}

import { CalendarClock, Edit3, Percent, Plus, Power, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import AppSelect from "../components/AppSelect.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import PromotionTargetPicker from "../components/PromotionTargetPicker.jsx";
import { pageClass, pageHeaderClass } from "../helpers/uiClasses.js";
import { localDateTime, promotionDates, PROMOTION_START_PAST, PROMOTION_END_ORDER } from "../helpers/promotionDates.js";
import {
  createPromotionRequest,
  deletePromotionRequest,
  getPromotionsRequest,
  getPromotionTargetsRequest,
  setPromotionStatusRequest,
  updatePromotionRequest,
} from "../services/promotions.service.js";

const TYPES = [
  { value: "PERCENTAGE_DISCOUNT", label: "Descuento porcentual" },
  { value: "BUY_2_PAY_1", label: "2x1" },
];
const STATUS = {
  INACTIVE: ["Inactiva", "status-badge--inactive bg-slate-100 text-slate-700"],
  SCHEDULED: ["Programada", "bg-blue-100 text-blue-800"],
  ACTIVE: ["Vigente", "bg-positive-50 text-positive-700"],
  EXPIRED: ["Vencida", "bg-amber-100 text-amber-800"],
};

function emptyForm(now = Date.now()) {
  return {
    name: "",
    type: "PERCENTAGE_DISCOUNT",
    percentage: "",
    startsAt: localDateTime(now),
    endsAt: "",
    isActive: false,
    productIds: [],
    categoryIds: [],
  };
}

function formFromPromotion(promotion) {
  return {
    name: promotion.name,
    type: promotion.type,
    percentage: promotion.percentage ?? "",
    startsAt: localDateTime(promotion.startsAt),
    endsAt: promotion.endsAt ? localDateTime(promotion.endsAt) : "",
    isActive: Boolean(promotion.isActive),
    productIds: promotion.productIds || [],
    categoryIds: promotion.categoryIds || [],
  };
}

function payloadFromForm(form, dates) {
  return {
    name: form.name.trim(),
    type: form.type,
    percentage: form.type === "PERCENTAGE_DISCOUNT" ? Number(form.percentage) : null,
    startsAt: dates.startsAt.toISOString(),
    endsAt: dates.endsAt ? dates.endsAt.toISOString() : null,
    isActive: form.isActive,
    productIds: form.productIds.map(Number),
    categoryIds: form.categoryIds.map(Number),
  };
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [targets, setTargets] = useState({ products: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInFlight = useRef(false);
  const deleteTrigger = useRef(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [serverOffset, setServerOffset] = useState(0);
  const [dateNow, setDateNow] = useState(Date.now);
  const [dateTouched, setDateTouched] = useState({});
  const [serverDateErrors, setServerDateErrors] = useState({});
  const isOpen = Boolean(editing);
  const dates = promotionDates(form, editing?.id ? editing : null, dateNow);
  const dateErrors = { ...dates.errors, ...serverDateErrors };

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setInterval(() => setDateNow(Date.now() + serverOffset), 15_000);
    return () => window.clearInterval(timer);
  }, [isOpen, serverOffset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [promotionRows, targetRows] = await Promise.all([
        getPromotionsRequest({ onServerTime: setServerOffset }),
        getPromotionTargetsRequest(),
      ]);
      setPromotions(promotionRows);
      setTargets(targetRows);
    } catch (error) {
      toast.error(getApiError(error, "No se pudieron cargar las promociones"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const targetNames = useMemo(() => ({
    product: new Map(targets.products.map((item) => [Number(item.id), item.name])),
    category: new Map(targets.categories.map((item) => [Number(item.id), item.name])),
  }), [targets]);

  const openCreate = () => { const now = Date.now() + serverOffset; setEditing({ id: null }); setForm(emptyForm(now)); setDateNow(now); setDateTouched({}); setServerDateErrors({}); };
  const openEdit = (promotion, now) => { setEditing(promotion); setForm(formFromPromotion(promotion)); setDateNow(now); setDateTouched({}); setServerDateErrors({}); };
  const close = () => { if (!saving) setEditing(null); };
  const changeDate = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setDateNow(Date.now() + serverOffset);
    setServerDateErrors({});
    setDateTouched(current => ({ ...current, [field]: true, ...(field === 'startsAt' && form.endsAt ? { endsAt: true } : {}) }));
  };
  const invalidDate = (event, field) => {
    event.preventDefault();
    setDateNow(Date.now() + serverOffset);
    setDateTouched(current => ({ ...current, [field]: true }));
    const message = event.target.validity.rangeUnderflow ? (field === 'startsAt' ? PROMOTION_START_PAST : PROMOTION_END_ORDER) : `La fecha de ${field === 'startsAt' ? 'inicio' : 'término'} no es válida`;
    setServerDateErrors(current => ({ ...current, [field]: message }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const checkedDates = promotionDates(form, editing?.id ? editing : null, Date.now() + serverOffset);
    setDateNow(Date.now() + serverOffset);
    setDateTouched({ startsAt: true, endsAt: true });
    if (Object.keys(checkedDates.errors).length) return;
    setSaving(true);
    try {
      const payload = payloadFromForm(form, checkedDates);
      if (editing?.id) await updatePromotionRequest(editing.id, payload);
      else await createPromotionRequest(payload);
      toast.success(editing?.id ? "Promoción actualizada" : "Promoción creada");
      setEditing(null);
      await load();
    } catch (error) {
      const message = getApiError(error, "No se pudo guardar la promoción");
      if (/fecha|vigencia/i.test(message)) {
        if (/término|termino/i.test(message)) setServerDateErrors({ endsAt: message });
        else if (/inicio/i.test(message)) setServerDateErrors({ startsAt: message });
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (promotion) => {
    try {
      await setPromotionStatusRequest(promotion.id, !promotion.isActive);
      toast.success(promotion.isActive ? "Promoción desactivada" : "Promoción activada");
      await load();
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cambiar el estado"));
    }
  };

  const closeDelete = () => {
    if (deleteInFlight.current) return;
    setDeleteTarget(null);
    // Backdrop mousedown can otherwise move focus to the body after the modal closes.
    window.requestAnimationFrame(() => {
      if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus();
    });
  };

  const remove = async () => {
    if (!deleteTarget || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePromotionRequest(deleteTarget.id);
      setPromotions(current => current.filter(promotion => promotion.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Promoción eliminada");
      await load();
    } catch (error) {
      setDeleteError(getApiError(error, "No se pudo eliminar la promoción"));
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  return (
    <main className={`relative ${pageClass} gap-5 py-8`}>
      <LoadingOverlay active={loading} />
      <header className={pageHeaderClass}>
        <div><h1>Promociones</h1><p>Beneficios exclusivos del catálogo online.</p></div>
        <button className="max-[620px]:w-full max-[620px]:justify-center" type="button" onClick={openCreate}><Plus size={18} /> Nueva promoción</button>
      </header>

      <section className="grid w-full gap-3">
        {promotions.map((promotion) => {
          const [statusLabel, statusClass] = STATUS[promotion.status] || STATUS.INACTIVE;
          const productNames = promotion.productIds.map((id) => targetNames.product.get(Number(id))).filter(Boolean);
          const categoryNames = promotion.categoryIds.map((id) => targetNames.category.get(Number(id))).filter(Boolean);
          return (
            <article className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" key={promotion.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-lg text-ink-950">{promotion.name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusClass}`}>{statusLabel}</span>{promotion.isIndefinite && promotion.status !== "INACTIVE" && <span className="text-xs font-bold text-slate-500">· Indefinida</span>}</div><p className="mt-1 mb-0 text-sm font-bold text-rust-600">{promotion.type === "BUY_2_PAY_1" ? "2x1 · por producto" : `${promotion.percentage}% de descuento`}</p></div>
                <div className="flex flex-wrap gap-2 max-[620px]:grid max-[620px]:w-full max-[620px]:grid-cols-3 max-[620px]:gap-1.5">
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => openEdit(promotion, Date.now() + serverOffset)} aria-label={`Editar ${promotion.name}`} title="Editar"><Edit3 size={16} /> <span className="max-[620px]:sr-only">Editar</span></button>
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => toggle(promotion)} aria-label={`${promotion.isActive ? "Desactivar" : "Activar"} ${promotion.name}`} title={promotion.isActive ? "Desactivar" : "Activar"}><Power size={16} /> <span className="max-[620px]:sr-only">{promotion.isActive ? "Desactivar" : "Activar"}</span></button>
                  <button className="border-critical-600 bg-white text-critical-600 hover:bg-critical-50 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={(event) => { deleteTrigger.current = event.currentTarget; setDeleteError(""); setDeleteTarget(promotion); }} disabled={promotion.usageCount > 0 || deleting} aria-label={`Eliminar ${promotion.name}`} title={promotion.usageCount > 0 ? "Una promoción utilizada debe conservarse" : "Eliminar"}><Trash2 size={16} /> <span className="max-[620px]:sr-only">Eliminar</span></button>
                </div>
              </div>
              {promotion.usageCount > 0 && <p className="m-0 text-xs text-slate-600">Esta promoción ya fue utilizada y debe conservarse como trazabilidad. Puede desactivarla.</p>}
              <div className="grid grid-cols-2 gap-3 text-xs max-[700px]:grid-cols-1"><div className="rounded-md bg-slate-50 p-3"><strong className="flex items-center gap-2 text-ink-950"><CalendarClock size={15} /> Vigencia</strong><span className="mt-1 block text-slate-600">Desde {new Date(promotion.startsAt).toLocaleString("es-CL")}</span><span className="block text-slate-600">{promotion.endsAt ? `Hasta ${new Date(promotion.endsAt).toLocaleString("es-CL")}` : "Sin término"}</span></div><div className="rounded-md bg-slate-50 p-3"><strong className="text-ink-950">Aplicación</strong><span className="mt-1 block text-slate-600">{productNames.length ? `${productNames.length} producto(s): ${productNames.join(", ")}` : "Sin productos directos"}</span><span className="block text-slate-600">{categoryNames.length ? `${categoryNames.length} categoría(s): ${categoryNames.join(", ")}` : "Sin categorías"}</span></div></div>
            </article>
          );
        })}
        {!loading && promotions.length === 0 && <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><div><Percent className="mx-auto text-slate-400" size={40} /><h2 className="mb-1 text-lg text-ink-950">Aún no hay promociones</h2><p className="m-0 text-sm text-slate-500">Crea un descuento porcentual o una promoción 2x1.</p></div></div>}
      </section>

      <AppModal
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        title="Eliminar promoción"
        description="Esta acción elimina la promoción de forma permanente."
        size="small"
        initialFocusSelector="[data-promotion-delete-cancel]"
        footer={(
          <>
            <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={closeDelete} disabled={deleting} data-promotion-delete-cancel>Cancelar</button>
            <button className="border-critical-600 bg-critical-600 hover:bg-red-700" type="button" onClick={remove} disabled={deleting}>{deleting ? "Eliminando..." : "Eliminar"}</button>
          </>
        )}
      >
        <div aria-busy={deleting}>
          <p className="m-0 wrap-break-word text-sm text-slate-600">¿Eliminar “{deleteTarget?.name}”?</p>
          {deleteError && <p className="mt-3 mb-0 text-sm text-critical-600" role="alert">{deleteError}</p>}
        </div>
      </AppModal>

      <AppModal open={Boolean(editing)} onClose={close} title={editing?.id ? "Editar promoción" : "Nueva promoción"} description="La aplicación final siempre será validada por el servidor." size="xlarge">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Nombre<input required maxLength="160" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Día del tornillo" /></label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Tipo<AppSelect value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value, percentage: value === "BUY_2_PAY_1" ? "" : current.percentage }))} options={TYPES} ariaLabel="Tipo de promoción" /></label>
            {form.type === "PERCENTAGE_DISCOUNT" && <label className="grid gap-1.5 text-xs font-bold text-slate-600">Porcentaje<input required type="number" min="1" max="99" step="1" value={form.percentage} onChange={(event) => setForm((current) => ({ ...current, percentage: event.target.value }))} /></label>}
            <label className="col-start-1 grid content-start self-start gap-1.5 text-xs font-bold text-slate-600"><span>Inicio</span>
              <input required aria-label="Inicio" type="datetime-local" step="60" value={form.startsAt} min={dates.startUnchanged ? undefined : localDateTime(dateNow)}
                aria-invalid={Boolean(dateTouched.startsAt && dateErrors.startsAt)} aria-describedby={dateTouched.startsAt && dateErrors.startsAt ? 'promotion-start-error' : undefined}
                onChange={event => changeDate('startsAt', event.target.value)} onBlur={() => { setDateNow(Date.now() + serverOffset); setDateTouched(current => ({ ...current, startsAt: true })); }} onInvalid={event => invalidDate(event, 'startsAt')} />
              {dateTouched.startsAt && dateErrors.startsAt && <span id="promotion-start-error" className="text-critical-600" role="alert">{dateErrors.startsAt}</span>}
            </label>
            <label className="grid min-w-0 content-start self-start gap-1.5 text-xs font-bold text-slate-600"><span className="flex items-baseline justify-between gap-2"><span>Término</span><span id="promotion-end-help" className="font-normal text-slate-400">(vacío = indefinido)</span></span>
              <input aria-label="Término" type="datetime-local" step="60" value={form.endsAt} min={form.startsAt}
                aria-invalid={Boolean(dateTouched.endsAt && dateErrors.endsAt)} aria-describedby={`promotion-end-help${dateTouched.endsAt && dateErrors.endsAt ? ' promotion-end-error' : ''}`}
                onChange={event => changeDate('endsAt', event.target.value)} onBlur={() => setDateTouched(current => ({ ...current, endsAt: true }))} onInvalid={event => invalidDate(event, 'endsAt')} />
              {dateTouched.endsAt && dateErrors.endsAt && <span id="promotion-end-error" className="text-critical-600" role="alert">{dateErrors.endsAt}</span>}
            </label>
            <label className="grid min-h-10 cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 self-end rounded-[5px] px-2 text-sm font-bold text-ink-950 hover:bg-slate-100"><input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Activar promoción</span></label>
          </div>
          <PromotionTargetPicker products={targets.products} categories={targets.categories} productIds={form.productIds} categoryIds={form.categoryIds} onChange={(selection) => setForm((current) => ({ ...current, ...selection }))} />
          <div className="admin-form-actions border-t border-slate-200 pt-4"><button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={close} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar promoción"}</button></div>
        </form>
      </AppModal>
    </main>
  );
}

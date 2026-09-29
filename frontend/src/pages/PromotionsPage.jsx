import { CalendarClock, Edit3, Percent, Plus, Power, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import AppSelect from "../components/AppSelect.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import PromotionTargetPicker from "../components/PromotionTargetPicker.jsx";
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
  INACTIVE: ["Inactiva", "bg-slate-100 text-slate-700"],
  SCHEDULED: ["Programada", "bg-blue-100 text-blue-800"],
  ACTIVE: ["Vigente", "bg-positive-50 text-positive-700"],
  EXPIRED: ["Vencida", "bg-amber-100 text-amber-800"],
};

function localDateTime(value = new Date()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyForm() {
  return {
    name: "",
    type: "PERCENTAGE_DISCOUNT",
    percentage: "",
    startsAt: localDateTime(),
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

function payloadFromForm(form) {
  return {
    name: form.name.trim(),
    type: form.type,
    percentage: form.type === "PERCENTAGE_DISCOUNT" ? Number(form.percentage) : null,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
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
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [promotionRows, targetRows] = await Promise.all([
        getPromotionsRequest(),
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

  const openCreate = () => { setEditing({ id: null }); setForm(emptyForm()); };
  const openEdit = (promotion) => { setEditing(promotion); setForm(formFromPromotion(promotion)); };
  const close = () => { if (!saving) setEditing(null); };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = payloadFromForm(form);
      if (editing?.id) await updatePromotionRequest(editing.id, payload);
      else await createPromotionRequest(payload);
      toast.success(editing?.id ? "Promoción actualizada" : "Promoción creada");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(getApiError(error, "No se pudo guardar la promoción"));
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

  const remove = async (promotion) => {
    if (!window.confirm(`¿Eliminar la promoción "${promotion.name}"?`)) return;
    try {
      await deletePromotionRequest(promotion.id);
      toast.success("Promoción eliminada");
      await load();
    } catch (error) {
      toast.error(getApiError(error, "No se pudo eliminar la promoción"));
    }
  };

  return (
    <main className="relative mx-auto grid w-full max-w-320 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <LoadingOverlay active={loading} />
      <header className="flex flex-wrap items-center justify-between gap-3 max-[620px]:text-center">
        <div className="max-[620px]:w-full"><h1 className="m-0 flex items-center gap-2 text-2xl text-ink-950 max-[620px]:justify-center"><Tag size={24} /> Promociones</h1><p className="mt-1 mb-0 text-sm text-slate-500">Beneficios exclusivos del catálogo online.</p></div>
        <button className="max-[620px]:w-full max-[620px]:justify-center" type="button" onClick={openCreate}><Plus size={18} /> Nueva promoción</button>
      </header>

      <section className="grid gap-3">
        {promotions.map((promotion) => {
          const [statusLabel, statusClass] = STATUS[promotion.status] || STATUS.INACTIVE;
          const productNames = promotion.productIds.map((id) => targetNames.product.get(Number(id))).filter(Boolean);
          const categoryNames = promotion.categoryIds.map((id) => targetNames.category.get(Number(id))).filter(Boolean);
          return (
            <article className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" key={promotion.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-lg text-ink-950">{promotion.name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusClass}`}>{statusLabel}</span>{promotion.isIndefinite && promotion.status !== "INACTIVE" && <span className="text-xs font-bold text-slate-500">· Indefinida</span>}</div><p className="mt-1 mb-0 text-sm font-bold text-rust-600">{promotion.type === "BUY_2_PAY_1" ? "2x1 · por producto" : `${promotion.percentage}% de descuento`}</p></div>
                <div className="flex flex-wrap gap-2 max-[620px]:grid max-[620px]:w-full max-[620px]:grid-cols-3 max-[620px]:gap-1.5">
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => openEdit(promotion)} aria-label={`Editar ${promotion.name}`} title="Editar"><Edit3 size={16} /> <span className="max-[620px]:sr-only">Editar</span></button>
                  <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => toggle(promotion)} aria-label={`${promotion.isActive ? "Desactivar" : "Activar"} ${promotion.name}`} title={promotion.isActive ? "Desactivar" : "Activar"}><Power size={16} /> <span className="max-[620px]:sr-only">{promotion.isActive ? "Desactivar" : "Activar"}</span></button>
                  <button className="border-critical-200 bg-white text-critical-600 hover:bg-critical-50 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => remove(promotion)} disabled={promotion.usageCount > 0} aria-label={`Eliminar ${promotion.name}`} title={promotion.usageCount > 0 ? "Una promoción utilizada debe conservarse" : "Eliminar"}><Trash2 size={16} /> <span className="max-[620px]:sr-only">Eliminar</span></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs max-[700px]:grid-cols-1"><div className="rounded-md bg-slate-50 p-3"><strong className="flex items-center gap-2 text-ink-950"><CalendarClock size={15} /> Vigencia</strong><span className="mt-1 block text-slate-600">Desde {new Date(promotion.startsAt).toLocaleString("es-CL")}</span><span className="block text-slate-600">{promotion.endsAt ? `Hasta ${new Date(promotion.endsAt).toLocaleString("es-CL")}` : "Sin término"}</span></div><div className="rounded-md bg-slate-50 p-3"><strong className="text-ink-950">Aplicación</strong><span className="mt-1 block text-slate-600">{productNames.length ? `${productNames.length} producto(s): ${productNames.join(", ")}` : "Sin productos directos"}</span><span className="block text-slate-600">{categoryNames.length ? `${categoryNames.length} categoría(s): ${categoryNames.join(", ")}` : "Sin categorías"}</span></div></div>
            </article>
          );
        })}
        {!loading && promotions.length === 0 && <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><div><Percent className="mx-auto text-slate-400" size={40} /><h2 className="mb-1 text-lg text-ink-950">Aún no hay promociones</h2><p className="m-0 text-sm text-slate-500">Crea un descuento porcentual o una promoción 2x1.</p></div></div>}
      </section>

      <AppModal open={Boolean(editing)} onClose={close} title={editing?.id ? "Editar promoción" : "Nueva promoción"} description="La aplicación final siempre será validada por el servidor." size="xlarge">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Nombre<input required maxLength="160" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Día del tornillo" /></label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Tipo<AppSelect value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value, percentage: value === "BUY_2_PAY_1" ? "" : current.percentage }))} options={TYPES} ariaLabel="Tipo de promoción" /></label>
            {form.type === "PERCENTAGE_DISCOUNT" && <label className="grid gap-1.5 text-xs font-bold text-slate-600">Porcentaje<input required type="number" min="1" max="99" step="1" value={form.percentage} onChange={(event) => setForm((current) => ({ ...current, percentage: event.target.value }))} /></label>}
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Inicio<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-600">Término <span className="font-normal text-slate-400">(vacío = indefinido)</span><input type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            <label className="grid min-h-10 cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 self-end rounded-[5px] px-2 text-sm font-bold text-ink-950 hover:bg-slate-100"><input className="size-4 min-h-4 w-4 shrink-0 accent-rust-600" type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Activar promoción</span></label>
          </div>
          <PromotionTargetPicker products={targets.products} categories={targets.categories} productIds={form.productIds} categoryIds={form.categoryIds} onChange={(selection) => setForm((current) => ({ ...current, ...selection }))} />
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={close} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar promoción"}</button></div>
        </form>
      </AppModal>
    </main>
  );
}

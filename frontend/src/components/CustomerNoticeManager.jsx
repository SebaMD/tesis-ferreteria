import {
  ArrowDown,
  ArrowUp,
  Edit3,
  GripVertical,
  Image as ImageIcon,
  Power,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";
import {
  createCustomerNoticeRequest,
  deleteCustomerNoticeRequest,
  getCustomerNoticeConfigurationRequest,
  removeCatalogPresentationImageRequest,
  removeCustomerNoticeImageRequest,
  reorderCustomerNoticesRequest,
  updateCatalogPresentationRequest,
  updateCustomerNoticeRequest,
  uploadCatalogPresentationImageRequest,
  uploadCustomerNoticeImageRequest,
} from "../services/customerNotice.service.js";
import AppModal from "./AppModal.jsx";

const EMPTY_FORM = {
  title: "",
  message: "",
  isActive: false,
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
    displaySeconds: Number(form.displaySeconds),
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: !form.indefinite && form.endsAt ? new Date(form.endsAt).toISOString() : null,
  };
}

function presentationForm(presentation) {
  return {
    title: presentation?.title || "",
    mainText: presentation?.mainText || "",
    secondaryText: presentation?.secondaryText || "",
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

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function ImageField({ currentUrl, file, onFile, removeImage, onRemove }) {
  const titleId = useId();
  const previewUrl = useObjectUrl(file);
  const visibleUrl = previewUrl || (!removeImage ? currentUrl : "");
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-3" aria-labelledby={titleId}>
      <h4 className="m-0 text-xs font-bold text-ink-700" id={titleId}>Imagen opcional</h4>
      <p className="m-0 text-xs leading-5 text-slate-500">
        Imagen recomendada: 1200 × 675 px (16:9). El hero la recorta de forma adaptativa según la pantalla.
      </p>
      {visibleUrl && (
        <div className="relative aspect-video max-w-96 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <img className="h-full w-full object-cover" src={visibleUrl} alt="Previsualización del slide" />
          <button
            className="absolute top-2 right-2 size-9 min-h-9 border-white/60 bg-ink-950/85 p-0 text-white hover:bg-ink-950"
            type="button"
            onClick={onRemove}
            aria-label="Quitar imagen"
            title="Quitar imagen"
          ><X size={16} /></button>
        </div>
      )}
      <label className="max-w-md">{visibleUrl ? "Cambiar imagen" : "Seleccionar imagen"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onFile(event.target.files?.[0] || null)}
        />
      </label>
      <span className="text-[11px] text-slate-500">JPG, PNG o WebP · máximo 5 MB.</span>
    </section>
  );
}

const CustomerNoticeManager = forwardRef(function CustomerNoticeManager({ embedded = false }, ref) {
  const { refreshNotices } = useCustomerNotice();
  const [presentation, setPresentation] = useState(null);
  const [notices, setNotices] = useState([]);
  const noticesRef = useRef([]);
  const noticeNodesRef = useRef(new Map());
  const noticePositionsRef = useRef(new Map());
  const editorRef = useRef(null);
  const editorRevealRef = useRef(null);
  const draggingIdRef = useRef(null);
  const dragChangedRef = useRef(false);
  const [draggingId, setDraggingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const updateNotices = useCallback((next) => {
    noticesRef.current = typeof next === "function" ? next(noticesRef.current) : next;
    setNotices(noticesRef.current);
  }, []);

  const setNoticeNode = useCallback((id, node) => {
    if (node) noticeNodesRef.current.set(id, node);
    else noticeNodesRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const nextPositions = new Map();
    for (const [id, node] of noticeNodesRef.current) {
      nextPositions.set(id, node.getBoundingClientRect());
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && noticePositionsRef.current.size > 0) {
      for (const [id, nextPosition] of nextPositions) {
        const previousPosition = noticePositionsRef.current.get(id);
        const node = noticeNodesRef.current.get(id);
        const deltaY = previousPosition ? previousPosition.top - nextPosition.top : 0;
        if (!node || Math.abs(deltaY) < 1) continue;
        node.getAnimations().forEach((animation) => animation.cancel());
        node.animate(
          [
            { transform: `translateY(${deltaY}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    }

    noticePositionsRef.current = nextPositions;
  }, [notices]);

  const loadConfiguration = useCallback(async () => {
    try {
      const configuration = await getCustomerNoticeConfigurationRequest();
      setPresentation(configuration.presentation);
      updateNotices(configuration.notices);
    } catch (error) {
      toast.error(getApiError(error, "No se pudieron cargar los avisos"));
    } finally {
      setLoading(false);
    }
  }, [updateNotices]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConfiguration();
  }, [loadConfiguration]);

  const resetMedia = () => {
    setImageFile(null);
    setRemoveImage(false);
  };

  const startCreate = useCallback(({ focus = false } = {}) => {
    editorRevealRef.current = { id: "new", focus };
    setEditingId("new");
    setForm(EMPTY_FORM);
    resetMedia();
  }, []);

  useImperativeHandle(ref, () => ({ startCreate }), [startCreate]);

  const startEdit = (notice, { focus = false } = {}) => {
    editorRevealRef.current = { id: notice.id, focus };
    setEditingId(notice.id);
    setForm(noticeForm(notice));
    resetMedia();
  };

  const startPresentationEdit = ({ focus = false } = {}) => {
    editorRevealRef.current = { id: "presentation", focus };
    setEditingId("presentation");
    setForm(presentationForm(presentation));
    resetMedia();
  };

  useEffect(() => {
    const pending = editorRevealRef.current;
    if (!pending || pending.id !== editingId) return undefined;

    let focusFrame;
    const scrollFrame = window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      if (pending.focus) {
        focusFrame = window.requestAnimationFrame(() => {
          editor.querySelector('input:not([type="file"]), textarea, button')?.focus({ preventScroll: true });
        });
      }
      editorRevealRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, [editingId]);

  const cancelEdit = () => {
    editorRevealRef.current = null;
    setEditingId(null);
    resetMedia();
  };

  const persist = async (event) => {
    event.preventDefault();
    setSaving(true);
    let createdNoticeId = null;
    try {
      if (editingId === "presentation") {
        await updateCatalogPresentationRequest({
          title: form.title.trim(),
          mainText: form.mainText.trim(),
          secondaryText: form.secondaryText.trim(),
        });
        if (imageFile) await uploadCatalogPresentationImageRequest(imageFile);
        else if (removeImage && presentation?.imageUrl) await removeCatalogPresentationImageRequest();
      } else {
        const notice = editingId === "new"
          ? await createCustomerNoticeRequest(noticePayload(form))
          : await updateCustomerNoticeRequest(editingId, noticePayload(form));
        if (editingId === "new") createdNoticeId = notice.id;
        if (imageFile) await uploadCustomerNoticeImageRequest(notice.id, imageFile);
        else if (removeImage && editingId !== "new") await removeCustomerNoticeImageRequest(notice.id);
      }
      await Promise.all([loadConfiguration(), refreshNotices()]);
      cancelEdit();
      toast.success(editingId === "new" ? "Aviso creado" : "Cambios guardados");
    } catch (error) {
      if (createdNoticeId) {
        setEditingId(createdNoticeId);
        await loadConfiguration();
      }
      toast.error(getApiError(error, "No se pudieron guardar los cambios"));
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
      await Promise.all([loadConfiguration(), refreshNotices()]);
      toast.success(notice.isActive ? "Aviso desactivado" : "Aviso activado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo cambiar el estado del aviso"));
    }
  };

  const persistOrder = async (nextNotices) => {
    updateNotices(nextNotices);
    try {
      await reorderCustomerNoticesRequest(nextNotices.map((notice) => notice.id));
      await refreshNotices();
    } catch (error) {
      toast.error(getApiError(error, "No se pudo guardar el orden"));
      await loadConfiguration();
    }
  };

  const moveNotice = (id, direction) => {
    const current = noticesRef.current;
    const from = current.findIndex((notice) => notice.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  };

  const handlePointerDown = (event, id) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingIdRef.current = id;
    dragChangedRef.current = false;
    setDraggingId(id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const id = draggingIdRef.current;
    if (!id) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-notice-id]");
    const targetId = Number(target?.dataset.noticeId);
    if (!targetId || targetId === id) return;
    const current = noticesRef.current;
    const from = current.findIndex((notice) => notice.id === id);
    const to = current.findIndex((notice) => notice.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    dragChangedRef.current = true;
    updateNotices(next);
  };

  const handlePointerUp = (event) => {
    if (!draggingIdRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    draggingIdRef.current = null;
    setDraggingId(null);
    if (dragChangedRef.current) persistOrder(noticesRef.current);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCustomerNoticeRequest(deleteTarget.id);
      await Promise.all([loadConfiguration(), refreshNotices()]);
      if (editingId === deleteTarget.id) cancelEdit();
      setDeleteTarget(null);
      toast.success("Aviso eliminado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo eliminar el aviso"));
    } finally {
      setSaving(false);
    }
  };

  const currentImageUrl = editingId === "presentation"
    ? presentation?.imageUrl
    : notices.find((notice) => notice.id === editingId)?.imageUrl;

  const renderEditor = (kind) => {
    const isPresentation = kind === "presentation";
    return (
      <form className="customer-notice-editor grid scroll-mt-4 gap-3 rounded-md border border-rust-500 bg-rust-50/40 p-4" ref={editorRef} onSubmit={persist}>
        <strong className="text-sm text-ink-950">
          {isPresentation ? "Editar presentación del catálogo" : editingId === "new" ? "Crear aviso" : "Editar aviso"}
        </strong>
        <label>Título
          <input maxLength="120" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
        </label>
        {isPresentation ? (
          <>
            <label>Texto principal
              <textarea className="min-h-20 resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2.5 text-sm text-ink-950" maxLength="220" value={form.mainText} onChange={(event) => setForm((current) => ({ ...current, mainText: event.target.value }))} required />
            </label>
            <label>Texto secundario
              <textarea className="min-h-24 resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2.5 text-sm text-ink-950" maxLength="600" value={form.secondaryText} onChange={(event) => setForm((current) => ({ ...current, secondaryText: event.target.value }))} required />
            </label>
          </>
        ) : (
          <>
            <label>Mensaje
              <textarea className="min-h-28 resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2.5 text-sm text-ink-950" maxLength="1000" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} required />
            </label>
            <div className="grid grid-cols-3 gap-3 max-[680px]:grid-cols-1">
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
          </>
        )}
        <ImageField
          currentUrl={currentImageUrl}
          file={imageFile}
          onFile={(file) => { setImageFile(file); setRemoveImage(false); }}
          removeImage={removeImage}
          onRemove={() => { setImageFile(null); setRemoveImage(true); }}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={cancelEdit}>Cancelar</button>
          <button type="submit" disabled={saving}><Save size={17} /> {saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </form>
    );
  };

  return (
    <section className={embedded ? "grid gap-4" : "rounded-md border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,21,31,0.05)] max-[720px]:p-4"}>
      {loading ? <p className="m-0 text-sm text-slate-500">Cargando avisos…</p> : (
        <div className="grid gap-3">
          <div>
            <article className="customer-notice-presentation relative grid gap-3 rounded-md border-2 border-rust-500/70 bg-rust-50/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3 max-[620px]:pr-11">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-rust-500 text-white"><ImageIcon size={19} /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-ink-950">Presentación del catálogo</strong>
                      <span className="rounded-full bg-rust-50 px-2 py-1 text-[11px] font-bold text-rust-600">Predeterminado</span>
                    </div>
                    <p className="mt-1 mb-0 text-xs font-bold text-ink-700">{presentation?.title}</p>
                    <p className="mt-1 mb-0 line-clamp-2 text-xs leading-5 text-slate-600">{presentation?.mainText}</p>
                  </div>
                </div>
                <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:absolute max-[620px]:top-3 max-[620px]:right-3 max-[620px]:size-10 max-[620px]:min-h-10 max-[620px]:p-0" type="button" onClick={(event) => startPresentationEdit({ focus: event.detail === 0 })} aria-label="Editar presentación del catálogo" title="Editar presentación del catálogo"><Edit3 size={16} /> <span className="max-[620px]:sr-only">Editar</span></button>
              </div>
              {presentation?.imageUrl && <img className="h-20 w-full rounded-md border border-slate-200 object-cover" src={presentation.imageUrl} alt="" />}
              <span className="text-[11px] text-slate-500">Siempre ocupa la primera posición y no puede desactivarse, moverse ni eliminarse.</span>
            </article>
            {editingId === "presentation" && <div className="mt-3">{renderEditor("presentation")}</div>}
          </div>

          {editingId === "new" && renderEditor("notice")}

          {notices.length === 0 && editingId !== "new" && (
            <p className="m-0 rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Aún no existen avisos.</p>
          )}
          {notices.map((notice, index) => {
            const phase = scheduleStatus(notice);
            return (
              <div
                className={`customer-notice-reorder-item ${draggingId === notice.id ? "customer-notice-reorder-item--dragging" : ""}`}
                data-notice-id={notice.id}
                key={notice.id}
                ref={(node) => setNoticeNode(notice.id, node)}
              >
                <article className={`customer-notice-card grid gap-3 rounded-md border bg-slate-50 p-4 ${draggingId === notice.id ? "customer-notice-card--dragging border-rust-500" : "border-slate-200"}`}>
                  <div className="flex items-start gap-3">
                    <button
                      className="customer-notice-drag-handle touch-none size-10 min-h-10 shrink-0 cursor-grab border-slate-300 bg-white p-0 text-slate-600 hover:bg-slate-100 active:cursor-grabbing"
                      type="button"
                      aria-label={`Arrastrar ${notice.title} para cambiar su posición`}
                      title="Arrastrar para ordenar"
                      onPointerDown={(event) => handlePointerDown(event, notice.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    ><GripVertical size={18} /></button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block text-sm text-ink-950">{notice.title || "Aviso sin título"}</strong>
                          <p className="mt-1 mb-0 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{notice.message || "Sin mensaje"}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-[620px]:grid max-[620px]:w-full max-[620px]:auto-cols-fr max-[620px]:grid-flow-col">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold max-[620px]:grid max-[620px]:place-items-center max-[620px]:text-center ${notice.isActive ? "bg-positive-50 text-positive-600" : "bg-slate-100 text-slate-600"}`}>{notice.isActive ? "Activo" : "Inactivo"}</span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold max-[620px]:grid max-[620px]:place-items-center max-[620px]:text-center ${phase.className}`}>{phase.label}</span>
                          {!notice.endsAt && <span className="rounded-full bg-rust-50 px-2 py-1 text-[11px] font-bold text-rust-600 max-[620px]:grid max-[620px]:place-items-center max-[620px]:text-center">Indefinido</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  {notice.imageUrl && <img className="h-32 w-full rounded-md border border-slate-200 object-cover max-[620px]:h-28" src={notice.imageUrl} alt="" />}
                  <dl className="m-0 grid grid-cols-3 gap-2 text-xs max-[720px]:grid-cols-1">
                    <div><dt className="font-bold text-slate-500">Duración</dt><dd className="m-0 mt-1 text-ink-700">{notice.displaySeconds} s</dd></div>
                    <div><dt className="font-bold text-slate-500">Inicio</dt><dd className="m-0 mt-1 text-ink-700">{formatDateTime(notice.startsAt)}</dd></div>
                    <div><dt className="font-bold text-slate-500">Término</dt><dd className="m-0 mt-1 text-ink-700">{formatDateTime(notice.endsAt)}</dd></div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-2 max-[620px]:grid max-[620px]:grid-cols-[auto_minmax(0,1fr)]">
                    <div className="flex gap-1" aria-label={`Cambiar posición de ${notice.title}`}>
                      <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:bg-slate-100" type="button" onClick={() => moveNotice(notice.id, -1)} disabled={index === 0} aria-label={`Mover ${notice.title} hacia arriba`} title="Mover hacia arriba"><ArrowUp size={16} /></button>
                      <button className="size-10 min-h-10 border-slate-300 bg-white p-0 text-ink-700 hover:bg-slate-100" type="button" onClick={() => moveNotice(notice.id, 1)} disabled={index === notices.length - 1} aria-label={`Mover ${notice.title} hacia abajo`} title="Mover hacia abajo"><ArrowDown size={16} /></button>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 max-[620px]:grid max-[620px]:w-full max-[620px]:grid-cols-3 max-[620px]:gap-1.5">
                      <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => toggleActive(notice)} aria-label={`${notice.isActive ? "Desactivar" : "Activar"} ${notice.title}`} title={notice.isActive ? "Desactivar" : "Activar"}><Power size={16} /> <span className="max-[620px]:sr-only">{notice.isActive ? "Desactivar" : "Activar"}</span></button>
                      <button className="border-slate-300 bg-white text-ink-700 hover:bg-slate-100 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={(event) => startEdit(notice, { focus: event.detail === 0 })} aria-label={`Editar ${notice.title}`} title="Editar"><Edit3 size={16} /> <span className="max-[620px]:sr-only">Editar</span></button>
                      <button className="border-critical-600 bg-white text-critical-600 hover:bg-critical-50 max-[620px]:min-h-11 max-[620px]:w-full max-[620px]:px-2" type="button" onClick={() => setDeleteTarget(notice)} aria-label={`Eliminar ${notice.title}`} title="Eliminar"><Trash2 size={16} /> <span className="max-[620px]:sr-only">Eliminar</span></button>
                    </div>
                  </div>
                </article>
                {editingId === notice.id && <div className="mt-3">{renderEditor("notice")}</div>}
              </div>
            );
          })}
        </div>
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
});

export default CustomerNoticeManager;

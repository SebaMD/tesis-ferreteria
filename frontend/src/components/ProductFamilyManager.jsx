import { Archive, ArchiveRestore, ChevronDown, Plus, Save, Settings, Unlink } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import { getApiError } from "../api/httpClient.js";
import { setProductFamilyArchivedRequest, detachProductFamilyRequest, getProductFamiliesRequest, saveProductFamilyRequest } from "../services/productFamilies.service.js";
import { familyBody, familyDraft, isFamilyCompatible, familyAdminView, selectableProductFamilies } from "../helpers/productFamilyForm.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";

const box = "grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3";
const textAreaClass = "min-h-20 min-w-0 w-full resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2 text-ink-950 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500";

export default function ProductVariantFields({ form, onChange, categories, products, editingProduct, onEditProduct, onDetached, disabled }) {
  const [families, setFamilies] = useState([]);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const [pendingDetach, setPendingDetach] = useState(null);
  const [detachReason, setDetachReason] = useState("");
  const [detaching, setDetaching] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => getProductFamiliesRequest().then((data) => { if (active) setFamilies(data); }).catch((e) => toast.error(getApiError(e, "No se pudieron cargar las familias")));
    load(); window.addEventListener("product-families-updated", load);
    return () => { active = false; window.removeEventListener("product-families-updated", load); };
  }, []);
  const family = families.find((f) => f.id === Number(form.familyId));
  const compatible = selectableProductFamilies(families, form);
  const chooseFamily = (event) => {
    const nextId = Number(event.target.value) || null;
    if (nextId === null && editingProduct?.familyId) {
      setDetachReason("");
      setPendingDetach({ id: editingProduct.id, name: editingProduct.name, familyId: editingProduct.familyId,
        optionIds: [...(editingProduct.variantOptionIds || [])], familyName: editingProduct.familyName || families.find((f) => f.id === editingProduct.familyId)?.name });
      return;
    }
    onChange({ ...form, familyId: nextId, variantOptionIds: [], associationReason: "" });
  };
  async function confirmDetach() {
    if (!pendingDetach || detaching || disabled || detachReason.trim().length < 8) return;
    try {
      setDetaching(true);
      await detachProductFamilyRequest(pendingDetach.id, { expectedFamilyId: pendingDetach.familyId,
        expectedOptionIds: pendingDetach.optionIds, reason: detachReason.trim(), confirmed: true });
      onChange({ ...form, familyId: null, variantOptionIds: [], associationReason: "" });
      onDetached(pendingDetach.id);
      setPendingDetach(null);
      toast.success("Producto desvinculado. Sus datos comerciales e historial se conservaron.");
    } catch (error) { toast.error(getApiError(error, "No se pudo desvincular el producto")); }
    finally { setDetaching(false); }
  }
  const openCreate = () => {
    if (!categories.some((c) => c.id === Number(form.categoryId))) { setNotice("Selecciona primero la categoría del producto. La marca es opcional y se utilizará tal como está en el formulario."); return; }
    setNotice(""); setEditor({ initialId: null, creating: true });
  };
  return <fieldset className={box} disabled={disabled || detaching} aria-label="Familia y variantes">
    <h3 className="m-0 text-sm font-bold">Familia y variantes</h3>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label className="min-w-0">Tipo de producto
        <select className="min-w-0 w-full" aria-label="Producto simple o variante" value={form.familyId || ""} onChange={chooseFamily}>
          <option value="">Producto simple (sin familia)</option>
          {compatible.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          {form.familyId && (!family || family.archivedAt) && <option value={form.familyId} disabled>{family?.archivedAt ? "Familia no disponible (archivada)" : "Familia actual (cargando…)"}</option>}
        </select>
      </label>
      <button className={`${secondaryButtonClass} min-h-11 px-2 text-xs max-[400px]:max-w-24 max-[400px]:text-[11px]`} type="button" onClick={openCreate}><Plus size={15} className="shrink-0" /><span>Crear nueva familia</span></button>
    </div>
    {notice && <p className="m-0 text-sm text-critical-600" role="alert">{notice}</p>}
    {!family && <p className="m-0 text-xs text-slate-500">Se muestran familias de la misma categoría y marca. La asociación siempre se elige explícitamente.</p>}
    {family && <>
      {family.archivedAt && <p role="alert" className="m-0 text-sm text-critical-600">La familia fue archivada. Selecciona otra familia activa o consulta su reactivación en la administración.</p>}
      {!isFamilyCompatible(family, form) && <p role="alert" className="m-0 text-sm text-critical-600">La categoría o marca no coincide con la familia actual. Revisa esos campos antes de guardar.</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">{family.attributes.map((a) => <label key={a.id} className="min-w-0">{a.name}
        <select className="min-w-0 w-full" aria-label={`Opción de ${a.name}`} required value={a.options.find((o) => form.variantOptionIds?.includes(o.id))?.id || ""} onChange={(e) => {
          const others = (form.variantOptionIds || []).filter((id) => !a.options.some((o) => o.id === id));
          onChange({ ...form, variantOptionIds: [...others, Number(e.target.value)].filter(Boolean) });
        }}><option value="">Seleccionar {a.name.toLowerCase()}</option>{a.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </label>)}</div>
      {editingProduct && editingProduct.familyId !== family.id && <label>Motivo de asociación (requerido si existe historial)
        <input maxLength={500} value={form.associationReason || ""} onChange={(e) => onChange({ ...form, associationReason: e.target.value })} placeholder="Explica la agrupación del mismo artículo" />
      </label>}
    </>}
    <button className={`${secondaryButtonClass} w-fit min-h-9 px-2 text-xs`} type="button" disabled={Boolean(form.familyId) && !family} onClick={() => setEditor({ initialId: Number(form.familyId) || null, creating: false })}><Settings size={14} />Administrar familias y atributos</button>
    {editor && <FamilyEditor key={`${editor.initialId || "new"}-${editor.creating}`} initialId={editor.initialId} creating={editor.creating} families={families} product={form} categories={categories} products={products} currentProductId={editingProduct?.id} onClose={() => setEditor(null)} onEditProduct={(p) => { setEditor(null); onEditProduct(p); }} onSaved={(saved, created) => {
      setFamilies((all) => [...all.filter((f) => f.id !== saved.id), saved]);
      if (created) onChange({ ...form, familyId: saved.id, variantOptionIds: [], associationReason: "" });
      // Archiving requires no persisted members; only an unsaved selection can need clearing.
      else if (saved.archivedAt && Number(form.familyId) === saved.id) onChange({ ...form, familyId: null, variantOptionIds: [], associationReason: "" });
    }} />}
    <AppModal open={Boolean(pendingDetach)} title="Desvincular producto de su familia" description="Se quitará únicamente la agrupación administrativa. El artículo y su historial se conservarán." size="small" onClose={() => { if (!detaching) setPendingDetach(null); }}>
      <div className="grid gap-3 text-sm">
        <p className="m-0 break-words"><strong>{pendingDetach?.name}</strong><br />Familia de origen: {pendingDetach?.familyName || `#${pendingDetach?.familyId}`}</p>
        <p className="m-0">No se cambiarán nombre, precio, stock, código de barras ni operaciones. La desvinculación se guarda al confirmar; los demás cambios del formulario seguirán pendientes.</p>
        <label>Motivo de desvinculación<textarea className={textAreaClass} aria-label="Motivo de desvinculación" rows={3} minLength={8} maxLength={500} required value={detachReason} disabled={detaching} onChange={(event) => setDetachReason(event.target.value)} placeholder="Explica por qué el mismo artículo quedará como producto simple" /></label>
        <div className="flex flex-wrap justify-end gap-2"><button className={secondaryButtonClass} type="button" disabled={detaching} onClick={() => setPendingDetach(null)}>Cancelar</button><button type="button" disabled={detaching || disabled || detachReason.trim().length < 8} onClick={confirmDetach}><Unlink size={16} aria-hidden="true" />{detaching ? "Desvinculando…" : "Confirmar desvinculación"}</button></div>
      </div>
    </AppModal>
  </fieldset>;
}

function FamilyEditor({ initialId, creating, families, product, categories, products, currentProductId, onClose, onSaved, onEditProduct }) {
  const [editingId, setEditingId] = useState(initialId);
  const [view, setView] = useState("IN_USE");
  const selected = families.find((f) => f.id === editingId);
  const existing = selected && familyAdminView(selected) === view ? selected : null;
  const visibleFamilies = families.filter((f) => familyAdminView(f) === view);
  const [draft, setDraft] = useState(() => familyDraft(families.find((f) => f.id === initialId)));
  const [saving, setSaving] = useState(false);
  const [pendingMember, setPendingMember] = useState(null);
  const [pendingState, setPendingState] = useState(null);
  const [changingState, setChangingState] = useState(false);
  const membersPanelId = useId();
  const [membersExpanded, setMembersExpanded] = useState(false);
  const members = editingId ? products.filter((p) => p.familyId === editingId) : [];
  const busy = saving || changingState;
  const archived = Boolean(existing?.archivedAt);
  const protectedDefinition = members.length > 0 || existing?.management?.hasProductHistory === true;
  const canArchive = existing?.management?.canArchive === true && members.length === 0 && !archived;
  const canReactivate = archived && existing?.management?.canReactivate === true;
  const canAddAttribute = !archived && !protectedDefinition && draft.attributes.length < 8;
  const actionCount = Number(canAddAttribute) + Number(canArchive || canReactivate) + Number(!archived);
  const category = categories.find((c) => c.id === (existing?.categoryId ?? Number(product.categoryId)));
  const brand = existing ? existing.brand : product.brand;
  const viewLabel = { IN_USE: "En uso", EMPTY: "Sin productos", ARCHIVED: "Archivadas" }[view];
  const changeAttribute = (i, values) => setDraft((d) => ({ ...d, attributes: d.attributes.map((a, j) => i === j ? { ...a, ...values } : a) }));
  const selectFamily = (id) => {
    const family = families.find((f) => f.id === Number(id) && familyAdminView(f) === view);
    setEditingId(family?.id ?? null); setDraft(familyDraft(family)); setMembersExpanded(false);
  };
  async function submit(event) {
    event.preventDefault(); event.stopPropagation();
    if (archived || busy || (!creating && !existing)) return;
    if (!category) { toast.warning("Selecciona primero la categoría en el formulario del producto"); return; }
    try {
      setSaving(true);
      const saved = await saveProductFamilyRequest(familyBody(draft, existing, product), existing?.id);
      setEditingId(saved.id); setDraft(familyDraft(saved)); onSaved(saved, creating);
      toast.success(creating ? "Familia creada. Selecciona los valores de esta variante." : "Familia actualizada");
      if (creating) onClose();
    } catch (e) { toast.error(getApiError(e, "No se pudo guardar la familia")); }
    finally { setSaving(false); }
  }
  async function confirmStateChange() {
    if (!pendingState || busy) return;
    try {
      setChangingState(true);
      const saved = await setProductFamilyArchivedRequest(pendingState.family, pendingState.archived);
      onSaved(saved, false); setEditingId(saved.id); setDraft(familyDraft(saved));
      setView(familyAdminView(saved)); setMembersExpanded(false); setPendingState(null);
      toast.success(pendingState.archived ? "Familia archivada. Sus datos e historial se conservaron." : "Familia reactivada, sin recuperar asociaciones.");
    } catch (e) {
      toast.error(getApiError(e, "No se pudo cambiar el estado de la familia"));
      setPendingState(null); window.dispatchEvent(new Event("product-families-updated"));
    } finally { setChangingState(false); }
  }
  return <AppModal open title={creating ? "Crear nueva familia" : "Administrar familias y atributos"} description="La familia agrupa artículos; cada variante conserva su precio, stock e historial." onClose={() => { if (!busy) onClose(); }} size="medium">
    {!creating && <div className="mb-3 grid min-w-0 gap-3">
      <label>Estado de familias
        <select className="min-w-0 w-full" aria-label="Estado de familias" value={view} disabled={busy} onChange={(event) => { setView(event.target.value); setEditingId(null); setDraft(familyDraft()); setMembersExpanded(false); }}>
          <option value="IN_USE">En uso</option><option value="EMPTY">Sin productos</option><option value="ARCHIVED">Archivadas</option>
        </select>
      </label>
      <p className="m-0 text-xs text-slate-500" aria-live="polite">{viewLabel}: {visibleFamilies.length} {visibleFamilies.length === 1 ? "familia" : "familias"}.</p>
      <label>Consultar o editar familia
        <select className="min-w-0 w-full" aria-label="Consultar o editar familia" value={existing?.id || ""} disabled={busy || visibleFamilies.length === 0} onChange={(event) => selectFamily(event.target.value)}>
          <option value="">Seleccionar familia</option>{visibleFamilies.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {!visibleFamilies.length && <p className="m-0 text-sm text-slate-500">No hay familias en esta vista.</p>}
    </div>}
    {(creating || existing) && <form className="grid min-w-0 gap-3" onSubmit={submit}>
      <fieldset disabled={archived || busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <p className="m-0 rounded border border-slate-200 bg-slate-50 p-3 text-sm"><strong>Categoría:</strong> {category?.name || "Selecciona una categoría en el producto"}<br /><strong>Marca:</strong> {brand || "Sin marca"}</p>
        <label>Nombre de la familia<input required maxLength={150} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Características generales (opcional)<textarea className={textAreaClass} aria-label="Características generales" rows={3} maxLength={3000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        {draft.attributes.map((a, i) => <fieldset key={a.id || ("new-" + i)} className={box} aria-label={"Atributo " + (i + 1)}><h3 className="m-0 text-sm font-bold">Atributo {i + 1}</h3>
          <label>Nombre del atributo<input aria-label={"Nombre del atributo " + (i + 1)} required maxLength={60} value={a.name} onChange={(e) => changeAttribute(i, { name: e.target.value })} placeholder="Color, medida, grano…" /></label>
          <label>Opciones, una por línea<textarea className={textAreaClass} aria-label={"Opciones del atributo " + (i + 1)} required rows={3} placeholder={"Rojo\nAzul\nVerde"} value={a.optionsText} onChange={(e) => changeAttribute(i, { optionsText: e.target.value })} /></label>
          {!archived && (!a.id || !protectedDefinition) && draft.attributes.length > 1 && <button type="button" className={secondaryButtonClass} onClick={() => setDraft({ ...draft, attributes: draft.attributes.filter((_, j) => i !== j) })}>{a.id ? "Quitar atributo" : "Quitar atributo nuevo"}</button>}
        </fieldset>)}
      </fieldset>
      {archived
        ? <p className="m-0 text-xs text-slate-500">Familia archivada. Sus datos e historial se conservan; reactívala para volver a utilizarla.</p>
        : <p className="m-0 text-xs text-slate-500">Con variantes o historial, conserva sus atributos y opciones. Para otro artículo crea una opción nueva; las protecciones del historial siguen vigentes.</p>}
      <div className={"grid gap-2 [&>button]:mr-0! [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:px-2 [&>button]:text-xs " + (actionCount === 3 ? "grid-cols-3" : actionCount === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {canAddAttribute && <button className={secondaryButtonClass} type="button" aria-label="Agregar atributo" title="Agregar atributo" disabled={busy} onClick={() => setDraft({ ...draft, attributes: [...draft.attributes, { name: "", options: [], optionsText: "" }] })}><Plus size={17} className="shrink-0" aria-hidden="true" /><span className="max-[480px]:sr-only">Agregar atributo</span></button>}
        {canArchive && <button className={secondaryButtonClass} type="button" aria-label="Archivar familia" title="Archivar familia" disabled={busy} onClick={() => setPendingState({ family: existing, archived: true })}><Archive size={17} className="shrink-0" aria-hidden="true" /><span className="max-[480px]:sr-only">Archivar familia</span></button>}
        {canReactivate && <button type="button" aria-label="Reactivar familia" title="Reactivar familia" disabled={busy} onClick={() => setPendingState({ family: existing, archived: false })}><ArchiveRestore size={17} className="shrink-0" aria-hidden="true" /><span>Reactivar familia</span></button>}
        {!archived && <button type="submit" aria-label="Guardar familia" title="Guardar familia" disabled={busy || !category}><Save size={17} className="shrink-0" aria-hidden="true" /><span className="max-[480px]:sr-only">{saving ? "Guardando…" : "Guardar familia"}</span></button>}
      </div>
      {existing?.management?.memberCount > 0 && <p className="m-0 text-xs text-slate-500">Para archivar esta familia, primero desvincula todos sus artículos mediante el procedimiento seguro, incluidos los inactivos.</p>}
      {existing && !archived && <div className="grid min-w-0 gap-2">
        <h3 className="m-0"><button className={secondaryButtonClass + " mr-0! min-h-11 w-full justify-between px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500"} type="button" aria-expanded={membersExpanded} aria-controls={membersPanelId} onClick={() => setMembersExpanded((expanded) => !expanded)}><span>Variantes de esta familia ({existing.management.memberCount})</span><ChevronDown size={17} className={"shrink-0 " + (membersExpanded ? "rotate-180" : "")} aria-hidden="true" /></button></h3>
        <div id={membersPanelId} hidden={!membersExpanded}>
          <p className="m-0 mb-2 text-xs text-slate-500">{members.some((p) => p.id === currentProductId) ? "La lista incluye el producto actual. " : ""}Guarda los cambios del producto antes de abrir otra variante.</p>
          {members.map((p) => <div key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 py-2 text-sm"><span className="min-w-0 flex-[1_1_12rem] break-words">#{p.id} · {p.name}</span><div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{p.id === currentProductId && <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold">Actual</span>}<span className="whitespace-nowrap text-xs text-slate-500">{p.status ? "Activo" : "Inactivo"}</span>{p.id !== currentProductId && <button className={secondaryButtonClass + " min-h-9 px-2 text-xs"} type="button" onClick={() => setPendingMember(p)}>Editar variante</button>}</div></div>)}
        </div>
      </div>}
    </form>}
    {!creating && !existing && visibleFamilies.length > 0 && <p className="m-0 text-sm text-slate-500">Selecciona una familia para consultar sus datos y acciones disponibles.</p>}
    <AppModal open={Boolean(pendingState)} title={pendingState?.archived ? "Archivar familia" : "Reactivar familia"} description={pendingState?.archived ? "La familia y su historial se conservarán. No se eliminará ningún registro." : "La familia volverá a estar disponible, sin recuperar asociaciones anteriores."} size="small" onClose={() => { if (!changingState) setPendingState(null); }}>
      <p className="break-words text-sm">{pendingState?.family.name}</p>
      <p className="text-sm">Esta acción no modifica productos ni operaciones comerciales. Los cambios de la familia que no hayas guardado no se aplicarán.</p>
      <div className="flex flex-wrap justify-end gap-2"><button className={secondaryButtonClass} type="button" disabled={changingState} onClick={() => setPendingState(null)}>Cancelar</button><button type="button" disabled={changingState} onClick={confirmStateChange}>{changingState ? "Guardando…" : pendingState?.archived ? "Confirmar archivado" : "Confirmar reactivación"}</button></div>
    </AppModal>
    <AppModal open={Boolean(pendingMember)} title="¿Abrir otra variante?" description="Los cambios no guardados en el formulario actual no se conservarán." size="small" onClose={() => setPendingMember(null)}>
      <p className="text-sm">{pendingMember?.name}</p><div className="flex flex-wrap justify-end gap-2"><button className={secondaryButtonClass} type="button" onClick={() => setPendingMember(null)}>Volver al formulario</button><button type="button" onClick={() => onEditProduct(pendingMember)}>Abrir variante</button></div>
    </AppModal>
  </AppModal>;
}

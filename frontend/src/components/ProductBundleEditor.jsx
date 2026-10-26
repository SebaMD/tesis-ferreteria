import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eye, Plus, Save, Trash2, CheckCircle, XCircle, ChevronDown, ImagePlus, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import useBarcodeScanner from "../hooks/useBarcodeScanner.js";
import ProductBundlePreview from "./ProductBundlePreview.jsx";
import ProductImagesManager from "./ProductImagesManager.jsx";
import { getApiError } from "../api/httpClient.js";
import { getProductBundleRequest, getProductConversionRequest, getProductBundleOperationRequest, saveProductBundleRequest } from "../services/productFamilies.service.js";
import { bundleDraft, conversionDraft, bundlePayload, bundleRowLabels, bundleRowName, bundleDraftSignature, newBundleAttribute, newBundleRow, setBundleRowOption, bundleRequiresConfirmation, resumeBundleDraft, resumeConversionDraft, simpleDraftFromBundle, simpleProductPayload, editBundleImages, SINGLE_VARIANT_MESSAGE } from "../helpers/productBundleForm.js";
import { deactivateProductRequest, updateProductRequest } from "../services/products.service.js";
import { secondaryButtonClass, dangerButtonClass, badgeClass } from "../helpers/uiClasses.js";
import useAuth from "../hooks/useAuth.js";
import { formatClp } from "../helpers/formatters.js";
import { formatQuantityWithUnit } from "../helpers/units.js";

const box = "grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4";
const area = "min-h-20 w-full min-w-0 resize-y rounded border border-slate-300 bg-white p-2 text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-500";
const fileTypes = "image/jpeg,image/png,image/webp";
function encodeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => resolve({ mimeType: file.type, data: String(reader.result).split(",")[1], authorized: true });
    reader.readAsDataURL(file);
  });
}
export default function ProductBundleEditor({ familyId, conversionId, initialData, categories, onClose, onSaved, embedded = false, commonData, pendingFiles = [], enabled = true, reviewRef, onCreated, onBusyChange, modalOpen = true, onBack, onReviewOpen, inline = false, onSimple, simpleModeEnabled = false, onDialogChange }) {
  const { user } = useAuth();
  const pendingKey = `fyf-product-bundle-pending-${user.id}`;
  const [draftState, setDraft] = useState(() => bundleDraft(null, initialData || commonData));
  const draft = embedded && !conversionId ? { ...draftState, name: commonData.name, brand: commonData.brand, categoryId: commonData.categoryId, description: commonData.description, unitMeasure: commonData.unitMeasure } : draftState;
  const [busy, setBusy] = useState(Boolean(familyId || conversionId));
  const [error, setError] = useState("");
  const [ownCommonFiles, setCommonFiles] = useState(() => conversionId ? pendingFiles : []);
  const commonFiles = embedded ? pendingFiles : ownCommonFiles;
  const [authorized, setAuthorized] = useState(false);
  const [uncertain, setUncertain] = useState(() => Boolean(sessionStorage.getItem(pendingKey)));
  const [canRetry, setCanRetry] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [preview, setPreview] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [attributesOpen, setAttributesOpen] = useState(true);
  const [variantsOpen, setVariantsOpen] = useState(!familyId);
  const [conflict, setConflict] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [expandedRows, setExpandedRows] = useState(() => new Set(familyId ? [] : [draftState.rows[0]?.key]));
  const [singleVariant, setSingleVariant] = useState(false);
  const guard = useRef(false), frozen = useRef(null), formRef = useRef(null), previewTrigger = useRef(null), initialCommon = useRef(commonData);
  useEffect(() => { onBusyChange?.(busy || uncertain); }, [busy, uncertain, onBusyChange]);
  useEffect(() => { onDialogChange?.(confirmSave || Boolean(statusTarget) || reloadConfirm); }, [confirmSave, statusTarget, reloadConfirm, onDialogChange]);
  useEffect(() => {
    let live = true;
    if (familyId) getProductBundleRequest(familyId).then(data => { if (live) { const next=bundleDraft(data);setDraft(next);setBaseline(bundleDraftSignature(next)); } }).catch(e => { if (live) setError(getApiError(e)); }).finally(() => { if (live) setBusy(false); });
    if (conversionId) getProductConversionRequest(conversionId).then(data => { if (live) { const next=conversionDraft(data, initialCommon.current);setDraft(next);setExpandedRows(new Set([next.rows[0].key])); } }).catch(e => { if (live) setError(getApiError(e)); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [familyId, conversionId]);
  const change = values => setDraft(d => ({ ...d, ...values }));
  const rowChange = (key, values) => setDraft(d => ({ ...d, rows: d.rows.map(row => row.key === key ? { ...row, ...values } : row) }));
  const hasExisting = draft.rows.some(row => row.id);
  const originalRow = draft.rows.find(row => row.isOriginal);
  const definitionLocked = hasExisting && !draft.conversion;
  const files = [...new Set([...draft.rows.flatMap(row => row.files), ...(draft.rows.some(row => row.useCommon) ? commonFiles : [])])];
  const locked = busy || uncertain || !enabled || Boolean(familyId && !draft.familyId) || Boolean(conversionId && !draft.conversion);
  const dirty = !baseline || bundleDraftSignature(draft) !== baseline || files.length > 0 || commonFiles.length > 0;
  const openRow = key => setExpandedRows(current => new Set([...current, key]));
  function addVariant() {
    const row = newBundleRow(draft.attributes.length, draft.conversion ? draft.original : embedded ? commonData : draft);
    setVariantsOpen(true); openRow(row.key); setSingleVariant(false);
    change({ rows: [...draft.rows, row] });
  }
  function continueAsSimple() {
    if (locked || !inline) return;
    onSimple(simpleDraftFromBundle(draft, commonFiles)); setSingleVariant(false); setError(""); setPreview(false);
  }
  function backToProduct() {
    if (draft.conversion) onBack({ fields: { ...draft.original, ...originalRow }, files: [...new Set([...(originalRow.useCommon ? commonFiles : []), ...originalRow.files])] });
    else onBack();
  }
  function validateDraft() {
    if (locked) return false;
    if (!draft.familyId && !draft.conversion && draft.rows.length < 2) { setSingleVariant(true); setError(""); return false; }
    try {
      if (!draft.name.trim() || !draft.categoryId || !draft.unitMeasure.trim()) throw new Error("Completa el nombre, la categoría y la unidad de venta.");
      bundlePayload(draft, crypto.randomUUID(), files, commonFiles);
      setError(""); return true;
    } catch (err) { setAttributesOpen(true); setVariantsOpen(true); openRow(err.variantKey || draft.rows[0]?.key); setError(err.message); return false; }
  }
  function review() {
    onReviewOpen?.();
    if (guard.current || !validateDraft()) return;
    if (bundleRequiresConfirmation(draft)) setConfirmSave(true);
    else void save();
  }
  useImperativeHandle(reviewRef, () => ({ review, continueAsSimple,
    resume(base, images) { setDraft(d => resumeBundleDraft(d, base)); setCommonFiles(images); setError(""); setPreview(false); requestAnimationFrame(()=>formRef.current?.querySelector("input")?.focus()); },
    resumeConversion(base, images) { setDraft(d=>resumeConversionDraft(d,base)); setCommonFiles(images); },
    saveSimple() { if (!guard.current && !uncertain) void save(true); },
  }));
  async function load(id) {
    setBusy(true); setError(""); setConflict(false);
    try { const next=id ? bundleDraft(await getProductBundleRequest(id)) : conversionDraft(await getProductConversionRequest(conversionId));setDraft(next);setBaseline(bundleDraftSignature(next));setCommonFiles([]);setAuthorized(false);setExpandedRows(new Set()); }
    catch (e) { setConflict(true); setError(getApiError(e)); }
    finally { setBusy(false); }
  }
  async function changeExistingStatus() {
    if (!statusTarget || busy || dirty || !draft.familyId || guard.current) return;
    guard.current=true;setBusy(true);setError("");
    try {
      const latest=await getProductBundleRequest(draft.familyId);
      if (latest.revision!==draft.revision) throw new Error("El producto o sus variantes cambiaron. Recarga antes de modificar el estado.");
      if (!statusTarget.updatedAt) throw new Error("No se pudo verificar la versión del artículo. Recarga su información.");
      if (statusTarget.status) await deactivateProductRequest(statusTarget.id,statusTarget.updatedAt);
      else await updateProductRequest(statusTarget.id,{status:true},statusTarget.updatedAt);
      setStatusTarget(null);await load(draft.familyId);await onSaved();toast.success("Estado actualizado únicamente para el producto seleccionado.");
    } catch(e) { setConflict(true); setError(getApiError(e,e.message || "No se pudo confirmar el cambio. Consulta el estado actualizado antes de reintentar."));setStatusTarget(null); }
    finally { guard.current=false;setBusy(false); }
  }
  const addAttribute = () => { setAttributesOpen(true); change({ attributes:[...draft.attributes,newBundleAttribute()],rows:draft.rows.map(r=>({...r,selections:[...r.selections,""]})) }); };
  useBarcodeScanner({ enabled: modalOpen && !locked, captureInModal: true,
    isInputAllowed: target => Boolean(target?.dataset.bundleBarcode),
    onScan: (barcode, {target}) => { if(target?.dataset.bundleBarcode) rowChange(target.dataset.bundleBarcode,{barcode}); } });
  async function finish(result) {
    sessionStorage.removeItem(pendingKey); frozen.current = null; setUncertain(false);
    toast.success(result.familyId ? "Familia y variantes guardadas. Stock inicial registrado por producto." : "Producto simple guardado. Stock inicial registrado.");
    setCanRetry(false); setDraft(d => ({ ...d, familyId: result.familyId, revision: null }));
    try { await onSaved(); } catch { toast.warning("Guardado confirmado. Recarga Inventario para actualizar la lista."); }
    if (embedded || inline) { onCreated?.(result); return; }
    await load(result.familyId);
  }
  async function recover() {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const key = frozen.current?.operationKey || sessionStorage.getItem(pendingKey);
      const result = key && await getProductBundleOperationRequest(key);
      if (result) await finish(result);
      else if (frozen.current) setError("No hay un guardado confirmado. Puedes reintentar exactamente la misma operación sin duplicar productos.");
      else { sessionStorage.removeItem(pendingKey); setUncertain(false); setError("No se encontró un guardado confirmado. Revisa la familia antes de volver a completar el formulario."); }
    } catch (e) { setError(getApiError(e, "No se pudo verificar el resultado. No crees otra operación todavía.")); }
    finally { guard.current = false; setBusy(false); }
  }
  async function save(asSimple = false) {
    asSimple = asSimple === true;
    if (guard.current) return;
    guard.current = true; setBusy(true); setConfirmSave(false); setError("");
    try {
      if (!frozen.current) {
        const selectedFiles = asSimple ? pendingFiles : files;
        if (selectedFiles.length && !authorized) throw new Error("Confirma que las fotografías están autorizadas y representan las variantes elegidas.");
        if (selectedFiles.length > 12 || selectedFiles.some(f => !fileTypes.split(",").includes(f.type) || f.size > 5 * 1024 * 1024) || selectedFiles.reduce((s, f) => s + f.size, 0) > 15 * 1024 * 1024) throw new Error("Máximo 12 imágenes JPEG, PNG o WebP, 5 MB por imagen y 15 MB en total.");
        const body = asSimple ? simpleProductPayload(commonData, crypto.randomUUID(), selectedFiles) : bundlePayload(draft, crypto.randomUUID(), selectedFiles, commonFiles);
        body.images = await Promise.all(selectedFiles.map(encodeImage));
        // Keep the operation key before posting: a lost response must not create a new batch.
        sessionStorage.setItem(pendingKey, body.operationKey); frozen.current = body;
      }
      const result = await saveProductBundleRequest(frozen.current); await finish(result);
    } catch (e) {
      const status = e.response?.status;
      if(status === 409) setConflict(true);
      setVariantsOpen(true);
      if (frozen.current && (!status || status >= 500)) { setUncertain(true); setCanRetry(true); }
      else { frozen.current = null; sessionStorage.removeItem(pendingKey); setUncertain(false); }
      setError(getApiError(e, e.message || "No se pudo guardar. Revisa los datos."));
    } finally { guard.current = false; setBusy(false); }
  }
  const content = <form ref={formRef} className="grid min-w-0 gap-4" onInvalidCapture={e=>{setAttributesOpen(true);setVariantsOpen(true);const key=e.target.closest("[data-variant-key]")?.dataset.variantKey;if(key)openRow(key);e.preventDefault();requestAnimationFrame(()=>e.target.focus());}} onSubmit={e => { e.preventDefault(); if(embedded){if(validateDraft())onBack();}else review(); }}>
      {error && <p role="alert" className="m-0 break-words rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      {singleVariant && <div role="alert" className="grid gap-3 rounded border border-rust-200 bg-rust-50 p-3 text-sm text-ink-950"><p className="m-0">{SINGLE_VARIANT_MESSAGE}.</p><p className="m-0 text-xs">Como producto simple se conservarán los datos y fotografías de la primera variante. Los atributos no se guardarán; el borrador de variantes seguirá disponible mientras esta ventana permanezca abierta.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={addVariant}>Agregar otra variante</button>{inline && <button type="button" className={secondaryButtonClass} onClick={continueAsSimple}>Continuar como producto simple</button>}</div></div>}
      {familyId && !draft.familyId && !busy && <button type="button" onClick={() => load(familyId)}>Reintentar consulta de la familia</button>}
      {conversionId && !draft.conversion && !busy && <button type="button" onClick={() => load()}>Reintentar consulta del producto original</button>}
      {conflict && (familyId || conversionId) && <button type="button" className={`${secondaryButtonClass} w-fit text-xs`} disabled={locked} onClick={()=>setReloadConfirm(true)}>Recargar información vigente</button>}
      {uncertain && <div className={box}><p className="m-0 text-sm">Hay un guardado cuyo resultado debe verificarse antes de continuar.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button>{canRetry && <button type="button" disabled={busy} onClick={save}>Reintentar mismo guardado</button>}</div></div>}
      <fieldset disabled={locked} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        {draft.conversion && <section className={box} aria-label="Conversión del producto original"><h3 className="m-0 text-base font-bold">Producto original #{draft.original.id}</h3>
          <p className="m-0 text-sm">{draft.original.name} · {formatQuantityWithUnit(draft.original.currentStock,draft.original.unitMeasure)} de stock físico. Conserva su identificador, imágenes e historial. No registrará una nueva entrada. Elige explícitamente su combinación en la primera fila.</p>
          <label>Motivo de conversión<textarea required minLength={8} maxLength={500} className={area} value={draft.conversion.reason} onChange={e => change({ conversion:{...draft.conversion,reason:e.target.value} })} /></label>
        </section>}
        {!embedded && <section className={box} aria-label="Datos generales">
          <h3 className="m-0 text-base font-bold">Datos generales</h3>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label>Nombre general<input required maxLength={150} value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
            <label>Categoría<select required disabled={hasExisting} value={draft.categoryId} onChange={e => change({ categoryId: e.target.value })}><option value="">Selecciona categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Marca (opcional)<input maxLength={100} disabled={hasExisting} value={draft.brand} onChange={e => change({ brand: e.target.value })} /></label>
            <label>Unidad de las variantes nuevas<input required maxLength={50} disabled={Boolean(draft.conversion)} value={draft.unitMeasure} onChange={e => change({ unitMeasure: e.target.value })} /></label>
          </div>
          <label>Características generales (opcional)<textarea className={area} value={draft.description} onChange={e => change({ description: e.target.value })} /></label>
          {hasExisting && <p className="m-0 text-xs text-slate-500">Nombre y características generales describen la familia; no reemplazan nombres ni descripciones individuales. La unidad general se propone solo para variantes nuevas. Marca y categoría permanecen bloqueadas: cambiarlas exige reclasificar todos los artículos y revisar su historial y promociones.</p>}
          <details className="min-w-0 text-xs"><summary className="cursor-pointer py-2 font-semibold">Fotografías comunes (opcional){commonFiles.length>0 ? ` · ${commonFiles.length} seleccionadas` : ""}</summary>
            <div className="grid min-w-0 gap-2 pt-2"><label className="variant-image-button"><ImagePlus size={16}/>Seleccionar imágenes comunes<input className="sr-only" aria-label="Seleccionar imágenes comunes" type="file" accept={fileTypes} multiple onChange={e => setCommonFiles([...new Map([...e.target.files].map(f=>[`${f.name}|${f.size}|${f.lastModified}`,f])).values()])}/></label>
            {commonFiles.length>0 && <><ul className="m-0 pl-4">{commonFiles.map((f,i)=><li key={i} className="break-words">{f.name}</li>)}</ul><p className="m-0">Se aplicarán a: {draft.rows.filter(r=>r.useCommon).map(r=>bundleRowName(draft,r)).join(", ") || "ninguna variante; marca las filas correspondientes"}.</p></>}
            <p className="m-0 text-slate-500">Solo se agregarán a las variantes que marques. No reemplazan ni eliminan sus fotografías guardadas. Cada artículo conserva una copia independiente para que eliminar una foto no afecte a otro.</p></div>
          </details>
        </section>}
        <section className={box} aria-label="Atributos de variación">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="m-0 text-base font-bold">{familyId ? <button type="button" className="variant-section-toggle" aria-expanded={attributesOpen} aria-controls="bundle-attribute-fields" onClick={()=>setAttributesOpen(v=>!v)}><ChevronDown size={17} className={attributesOpen ? "rotate-180" : ""}/>Atributos ({draft.attributes.length})</button> : <>Atributos ({draft.attributes.length})</>}</h3>
            {draft.attributes.length<8 && <button type="button" className={`${secondaryButtonClass} ml-auto! mr-0! min-h-11 text-xs`} disabled={locked || definitionLocked} title={definitionLocked ? "No se pueden agregar dimensiones a una familia con variantes o historial" : undefined} onClick={addAttribute}><Plus size={16}/>Agregar otro atributo</button>}
          </div>
          {definitionLocked && <p className="m-0 text-xs text-slate-500">No se pueden agregar, quitar ni renombrar atributos mientras existan variantes o historial. Agregar una dimensión cambiaría las combinaciones protegidas de los artículos históricos; requiere una operación de reclasificación aún no autorizada. Puedes agregar variantes con los atributos actuales.</p>}
          <div id="bundle-attribute-fields" hidden={!attributesOpen} className={attributesOpen ? "grid min-w-0 gap-2" : "hidden"}>
          <p className="m-0 text-xs text-slate-500">La unidad de venta se hereda de los datos generales. Tamaños como 150 ml y 400 ml son presentaciones, no unidades de inventario diferentes.</p>
          {draft.attributes.map((a, i) => <div key={a.key} className="grid min-w-0 gap-2 py-2">
            <div className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1">Nombre del atributo {i+1}<input required maxLength={60} disabled={definitionLocked} value={a.name} placeholder="Color, medida, presentación…" onChange={e => change({ attributes: draft.attributes.map((at, j) => j === i ? { ...at, name: e.target.value } : at) })} /></label>
            {!definitionLocked && draft.attributes.length > 1 && <button type="button" className={`${secondaryButtonClass} mr-0! min-h-11 shrink-0`} aria-label={`Quitar atributo ${i+1}`} onClick={() => change({ attributes: draft.attributes.filter((_,j)=>j!==i),rows:draft.rows.map(r=>({...r,selections:r.selections.filter((_,j)=>j!==i),optionTexts:r.optionTexts?.filter((_,j)=>j!==i)})) })}><Trash2 size={16}/></button>}</div>
            <p className="m-0 text-xs text-slate-500">Indica el valor de {a.name || "este atributo"} en cada variante. Solo se guardan las combinaciones que completes.</p>
          </div>)}
          </div>
        </section>
        <section className={box} aria-label="Variantes concretas">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="m-0 text-base font-bold">{familyId ? <button type="button" className="variant-section-toggle" aria-expanded={variantsOpen} aria-controls="bundle-variant-rows" onClick={()=>setVariantsOpen(v=>!v)}><ChevronDown size={17} className={variantsOpen ? "rotate-180" : ""}/>Variantes ({draft.rows.length})</button> : <>Variantes ({draft.rows.length})</>}</h3>
          {draft.rows.length<100 && <button type="button" className={`${secondaryButtonClass} ml-auto! mr-0! min-h-11 text-xs`} onClick={addVariant}><Plus size={16}/>Agregar otra variante</button>}</div>
          <p className="m-0 text-xs text-slate-500">La primera variante reutiliza los datos ingresados. Solo las variantes nuevas registran su stock inicial; los artículos existentes conservan sus existencias.</p>
          <div id="bundle-variant-rows" hidden={!variantsOpen} className={variantsOpen ? "grid min-w-0 gap-3" : "hidden"}>
          {draft.rows.map((row, index) => <section key={row.key} className={box} aria-label={`Variante ${index + 1}`} data-variant-key={row.key}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h4 className="m-0 min-w-0 flex-1 text-sm font-bold"><button type="button" className="variant-section-toggle min-h-11 w-full flex-wrap! justify-start! text-left" aria-expanded={expandedRows.has(row.key)} aria-controls={`variant-fields-${row.key}`} onClick={()=>setExpandedRows(current=>{const next=new Set(current);if(next.has(row.key))next.delete(row.key);else next.add(row.key);return next;})}><ChevronDown size={17} className={expandedRows.has(row.key)?"rotate-180":""}/><span>Variante {index+1}{row.id ? ` · Producto #${row.id} ·` : ""}</span>{row.id && <span className={badgeClass(row.status ? "success" : "neutral")}>{row.status ? "Activo" : "Inactivo"}</span>}<span className="min-w-0 break-words font-normal">{bundleRowLabels(draft,row).filter(Boolean).join(" · ") || bundleRowName(draft,row) || "Sin nombre"}</span></button></h4>{!row.id && draft.rows.length>1 && <button type="button" aria-label={`Quitar variante ${index+1}`} className={`${secondaryButtonClass} mr-0! min-h-11`} onClick={()=>change({rows:draft.rows.filter(r=>r.key!==row.key)})}><Trash2 size={16}/></button>}</div>
            <div id={`variant-fields-${row.key}`} hidden={!expandedRows.has(row.key)} className={expandedRows.has(row.key) ? "grid min-w-0 gap-3" : "hidden"}>
            {row.isOriginal && <p className="m-0 text-sm font-bold text-rust-700">Original conservado — sin entrada de stock</p>}
            <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">{draft.attributes.map((a, i) => <label key={a.key}>Opción de {a.name || `atributo ${i + 1}`}<input required maxLength={100} disabled={row.hasHistory && !row.isOriginal} value={row.optionTexts?.[i] ?? bundleRowLabels(draft,row)[i]} placeholder="Ej.: 400 ml" list={`options-${a.key}-${row.key}`} onChange={e => setDraft(d => setBundleRowOption(d,row.key,i,e.target.value))} /><datalist id={`options-${a.key}-${row.key}`}>{a.draftOptions.map(o => <option key={o.key} value={o.label} />)}</datalist></label>)}
            </div>
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1.4fr)]">
              <label>Nombre identificable<input maxLength={150} required disabled={row.hasHistory || row.isOriginal} value={bundleRowName(draft, row)} onChange={e => rowChange(row.key, { name: e.target.value, nameCustomized: true })} /></label>
              <label>Precio CLP<input required type="number" min="0" step="1" max="9999999999" value={row.price} onChange={e => rowChange(row.key, { price: e.target.value })} /></label>
              <label>Código de barras (opcional)<span className="relative block"><ScanBarcode aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={18}/><input className="pl-10! text-xs" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,64}" maxLength={64} data-bundle-barcode={row.key} value={row.barcode || ""} onChange={e=>rowChange(row.key,{barcode:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} placeholder="Haz clic aquí y escanea, o escribe el código" title="Lector tipo teclado o ingreso manual; Enter no guarda el formulario"/></span></label>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <label>Descripción individual (opcional)<textarea className={area} value={row.description ?? (row.id ? "" : draft.description)} onChange={e=>rowChange(row.key,{description:e.target.value})}/></label>
              <label>Unidad de este artículo<input required maxLength={50} disabled={row.hasHistory || row.isOriginal} value={row.unitMeasure ?? draft.unitMeasure} onChange={e=>rowChange(row.key,{unitMeasure:e.target.value})}/>{(row.hasHistory || row.isOriginal) && <span className="text-xs text-slate-500">Se conserva la unidad del producto original o con historial.</span>}</label>
            </div>
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label>Stock mínimo<input type="number" required min="0" step="1" max="2147483647" value={row.minimumStock} onChange={e => rowChange(row.key, { minimumStock: e.target.value })} /></label>
              {row.id ? <p className="m-0 self-center text-sm">Stock físico: <strong>{row.currentStock}</strong> {row.unitMeasure}. Para cambiarlo utiliza movimientos.</p> : <label>Stock inicial<input required type="number" min="0" max="2147483647" step="1" value={row.initialStock} onChange={e => rowChange(row.key, { initialStock: e.target.value })} /></label>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 self-end">
              {row.id ? <>
                <button type="button" className={`${row.status ? dangerButtonClass : secondaryButtonClass} mr-0! min-h-10 px-3 text-xs`} disabled={dirty || Boolean(draft.conversion)}
                  title={dirty || draft.conversion ? "Guarda primero la configuración pendiente para cambiar un estado existente" : undefined} onClick={()=>setStatusTarget(row)}>
                  {row.status ? <XCircle size={16}/> : <CheckCircle size={16}/>} {row.status ? "Desactivar" : "Activar"}
                </button></> : <label className="variant-online-control"><input type="checkbox" checked={row.status} onChange={e=>rowChange(row.key,{status:e.target.checked})}/>Activo inicialmente</label>}
              <label className="variant-online-control"><input type="checkbox" checked={row.inStoreOnly} onChange={e=>rowChange(row.key,{inStoreOnly:e.target.checked})}/>Solo presencial</label>
              {commonFiles.length>0 && <label className="variant-online-control"><input type="checkbox" checked={row.useCommon} onChange={e=>rowChange(row.key,{useCommon:e.target.checked})}/>La imagen común representa esta variante</label>}
            </div>
            </div>
            {row.id && (dirty || draft.conversion) && <p className="m-0 text-xs text-slate-500">Guarda los cambios pendientes antes de activar o desactivar este artículo. No se perderá el borrador.</p>}
            <div className="grid min-w-0 gap-2"><span className="text-sm font-semibold">Fotografías específicas (opcional)</span>
              <p className="m-0 text-xs text-slate-500">Agregar, quitar, ordenar y elegir la principal son cambios del borrador. Solo se aplicarán a este artículo al guardar el conjunto.</p>
              <ProductImagesManager compact disabled={locked} images={row.images || []} pendingFiles={row.files}
                onFilesSelected={selected=>rowChange(row.key,{files:[...row.files,...selected]})}
                onRemovePending={index=>rowChange(row.key,{files:row.files.filter((_,i)=>i!==index)})}
                onDelete={id=>rowChange(row.key,{images:editBundleImages(row.images,{type:"remove",id})})}
                onMove={(index,direction)=>rowChange(row.key,{images:editBundleImages(row.images,{type:"move",index,direction})})}
                onSetPrimary={id=>rowChange(row.key,{images:editBundleImages(row.images,{type:"primary",id})})}/>
            </div>
            </div>
          </section>)}
          </div>
        </section>
        <button ref={previewTrigger} type="button" className={`${secondaryButtonClass} w-fit max-w-full`} onClick={() => setPreview(true)}><Eye size={16} />Vista previa del catálogo</button>
        {files.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Confirmo la autorización de uso de estas imágenes y que corresponden a las variantes seleccionadas.</label>}
        <div className="variant-editor-actions"><button type="button" className={`${secondaryButtonClass} mr-auto!`} onClick={embedded || draft.conversion ? backToProduct : onClose}>{embedded || draft.conversion ? "Volver al producto" : "Cancelar"}</button><button type="submit" className="product-positive-action"><Save size={16}/>{busy ? "Guardando…" : draft.conversion ? "Revisar conversión" : inline ? "Guardar producto" : embedded ? "Confirmar configuración" : "Guardar cambios"}</button></div>
      </fieldset>
    </form>
  ;
  return <>
    {inline && !modalOpen && <div className="grid gap-3">
      {error && <p role="alert" className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      {simpleModeEnabled && pendingFiles.length > 0 && <label className="variant-online-control"><input type="checkbox" checked={authorized} onChange={event=>setAuthorized(event.target.checked)}/>Confirmo la autorización de uso de las imágenes de este producto.</label>}
      {uncertain && <div role="status" className={box}><p className="m-0 text-sm">Consulta el resultado del guardado pendiente antes de crear otro artículo.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button>{canRetry && <button type="button" disabled={busy} onClick={()=>save()}>Reintentar mismo guardado</button>}</div>}
    </div>}
    {inline ? <div hidden={!modalOpen || preview} className={modalOpen && !preview ? "min-w-0" : "hidden"}>{content}</div> : <AppModal open={modalOpen && !preview && !confirmSave && !statusTarget && !reloadConfirm} title={embedded ? "Agregar variantes" : "Editar producto con variantes"}
      description="Cada opción mantiene su identificación, precio e inventario." size="xlarge" onClose={() => { if (!busy) { if(embedded) onBack();else onClose(); } }}>{content}</AppModal>}
    <AppModal open={reloadConfirm} title="Recargar información vigente" size="small" onClose={()=>setReloadConfirm(false)}><p>Se descartará el borrador de este conjunto para cargar los cambios más recientes. No se guardarán datos ni se sobrescribirá a otro administrador.</p><div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} onClick={()=>setReloadConfirm(false)}>Conservar borrador</button><button type="button" className="product-positive-action" onClick={()=>{setReloadConfirm(false);load(familyId);}}>Descartar borrador y recargar</button></div></AppModal>
    {preview && (!inline || modalOpen) && <ProductBundlePreview inline={inline} draft={draft} commonFiles={commonFiles} categories={categories} onClose={() => { setPreview(false); requestAnimationFrame(()=>previewTrigger.current?.focus()); }} />}
    <AppModal open={Boolean(statusTarget)} title={statusTarget?.status ? "Desactivar variante" : "Activar variante"} onClose={()=>{if(!busy)setStatusTarget(null);}} size="small">
      <p>Confirma el cambio únicamente para <strong>#{statusTarget?.id} · {statusTarget?.name}</strong>. Su asociación, stock, precio, código e historial se conservarán. No se guardarán otros cambios ni se registrarán entradas de inventario.</p>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={()=>setStatusTarget(null)}>Volver</button><button type="button" className={statusTarget?.status ? dangerButtonClass : "product-positive-action"} disabled={busy} onClick={changeExistingStatus}>{busy ? "Actualizando…" : statusTarget?.status ? "Sí, desactivar" : "Sí, activar"}</button></div>
    </AppModal>
    <AppModal open={confirmSave} title={draft.conversion ? "Confirmar conversión del producto" : "Confirmar cambios de fotografías"} onClose={() => setConfirmSave(false)} size="small"><p>Se guardará la familia y {draft.rows.length} variantes en una única operación. Solo las variantes nuevas registrarán entradas por su stock inicial. Los identificadores y el stock existente se conservarán.</p>
      {!draft.conversion && <p>Se quitarán las fotografías guardadas que retiraste del borrador. Las imágenes de las demás variantes no se modificarán.</p>}
      {draft.conversion && <div className="mb-4 grid min-w-0 gap-2 text-sm"><p className="m-0 break-words"><strong>Original #{draft.original.id}:</strong> {draft.original.name} · {bundleRowLabels(draft,originalRow).join(" · ")} · stock conservado: {formatQuantityWithUnit(draft.original.currentStock,draft.original.unitMeasure)}.</p><p className="m-0 break-words">Precio: {formatClp(draft.original.price)} → {formatClp(originalRow.price)}. Código de barras: {draft.original.barcode || "Sin código"} → {originalRow.barcode || "Sin código"}.</p><p className="m-0">Motivo: {draft.conversion.reason}</p><ul className="m-0 pl-5">{draft.rows.filter(r=>!r.id).map(r=><li key={r.key} className="break-words">Nueva: {bundleRowName(draft,r)} · precio: {formatClp(r.price)} · entrada inicial: {formatQuantityWithUnit(r.initialStock,draft.unitMeasure)} · código: {r.barcode || "Sin código"}</li>)}</ul></div>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryButtonClass} onClick={() => setConfirmSave(false)}>Revisar</button><button type="button" className="product-positive-action" onClick={save}>Confirmar guardado</button></div></AppModal>
  </>;
}

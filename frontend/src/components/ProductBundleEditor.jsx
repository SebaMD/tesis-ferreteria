import { createId } from "../helpers/createId.js";
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Eye, Plus, Save, ArrowRight, Trash2, CheckCircle, XCircle, ChevronDown, ScanBarcode, Info, Pencil } from "lucide-react";
import { creationStockAction } from "../helpers/creationStock.js";
import AttributeSuggestionDialog from "./AttributeSuggestionDialog.jsx";
import AttributeMeasurementFields from "./AttributeMeasurementFields.jsx";
import { validAttributeMeasurement, attributeOptionLabel, legacyMeasurementCandidate } from "../helpers/attributeMeasurements.js";
import AuditedValueControl from "./AuditedValueControl.jsx";
import FamilyBrandDialog from "./FamilyBrandDialog.jsx";
import OptionLabelCorrectionDialog from "./OptionLabelCorrectionDialog.jsx";
import { pendingOptionLabel } from "../helpers/optionLabelCorrection.js";
import { pendingBrandCorrection } from "../helpers/familyBrand.js";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import useBarcodeScanner from "../hooks/useBarcodeScanner.js";
import ProductBundlePreview from "./ProductBundlePreview.jsx";
import ProductImagesManager from "./ProductImagesManager.jsx";
import VariantStockSummary from "./VariantStockSummary.jsx";
import ProductConversionSummary from "./ProductConversionSummary.jsx";
import ProductAttributeRenameDialog from "./ProductAttributeRenameDialog.jsx";
import FamilyCategoryDialog from "./FamilyCategoryDialog.jsx";
import FamilyDimensionDialog from "./FamilyDimensionDialog.jsx";
import { pendingDimension } from "../helpers/familyDimension.js";
import { pendingCategoryChange } from "../helpers/familyCategory.js";
import ProductNameCorrectionAction from "./ProductNameCorrectionAction.jsx";
import { readPendingAttributeRename } from "../helpers/attributeRename.js";
import { ProductCategoryField, ProductUnitField } from "./ProductFormFields.jsx";
import ProductUnitApplicationDialog from "./ProductUnitApplicationDialog.jsx";
import { normalizeUnit, validUnit, unitApplicationPlan, unitSelectionPlan, applyUnitSelection } from "../helpers/productUnits.js";
import { getApiError } from "../api/httpClient.js";
import { getProductBundleRequest, getProductConversionRequest, getProductBundleOperationRequest, saveProductBundleRequest, getFamilyUnitEligibilityRequest } from "../services/productFamilies.service.js";
import { bundleDraft, conversionDraft, bundlePayload, bundleRowLabels, bundleRowValues, bundleRowName, bundleDraftSignature, newBundleAttribute, newBundleRow, setBundleRowOption, bundleRequiresConfirmation, resumeBundleDraft, resumeConversionDraft, simpleDraftFromBundle, simpleProductPayload, editBundleImages } from "../helpers/productBundleForm.js";
import { deactivateProductRequest, updateProductRequest } from "../services/products.service.js";
import { secondaryButtonClass, dangerButtonClass, badgeClass } from "../helpers/uiClasses.js";
import useAuth from "../hooks/useAuth.js";
import { formatQuantityWithUnit } from "../helpers/units.js";

const box = "grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4";
const area = "min-h-20 w-full min-w-0 resize-y rounded border border-slate-300 bg-white p-2 text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-500";
const fileTypes = "image/jpeg,image/png,image/webp";
const stockSnapshots = rows => new Map(rows.map(row => [row.id, { currentStock: row.currentStock, minimumStock: row.minimumStock, unitMeasure: row.unitMeasure }]));
function encodeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => resolve({ mimeType: file.type, data: String(reader.result).split(",")[1], authorized: true });
    reader.readAsDataURL(file);
  });
}
export default function ProductBundleEditor({ familyId, conversionId, initialData, initialSnapshot, categories, onClose, onSaved, embedded = false, commonData, pendingFiles = [], enabled = true, reviewRef, onCreated, onBusyChange, modalOpen = true, onBack, onReviewOpen, inline = false, onSimple, simpleModeEnabled = false, onDialogChange, externalActions = false, onActionChange }) {
  const { user } = useAuth();
  const pendingKey = `fyf-product-bundle-pending-${user.id}`;
  const [draftState, setDraft] = useState(() => initialSnapshot?.draft || bundleDraft(null, initialData || commonData, !familyId && !conversionId));
  const initialSnapshotRef = useRef(initialSnapshot);
  const savedStock = useRef(new Map());
  const draft = embedded && !conversionId ? { ...draftState, name: commonData.name, brand: commonData.brand, categoryId: commonData.categoryId, description: commonData.description, unitMeasure: commonData.unitMeasure } : draftState;
  const [busy, setBusy] = useState(Boolean(familyId || conversionId));
  const [error, setErrorMessage] = useState("");
  const [errorTarget, setErrorTarget] = useState(null);
  const errorId = useId();
  const setError = useCallback(message => { setErrorMessage(message); setErrorTarget(null); }, []);
  const [ownCommonFiles, setCommonFiles] = useState(() => initialSnapshot?.commonFiles || (conversionId ? pendingFiles : []));
  const commonFiles = embedded ? pendingFiles : ownCommonFiles;
  const [authorized, setAuthorized] = useState(false);
  const [uncertain, setUncertain] = useState(() => Boolean(sessionStorage.getItem(pendingKey)));
  const [canRetry, setCanRetry] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [conversionStep, setConversionStep] = useState("prepare");
  const [preview, setPreview] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [attributesOpen, setAttributesOpen] = useState(!familyId);
  const [variantsOpen, setVariantsOpen] = useState(!familyId);
  const [conflict, setConflict] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState(() => familyId ? readPendingAttributeRename(user.id, familyId) : null);
  const [nameCorrectionOpen, setNameCorrectionOpen] = useState(false);
  const [categoryDialog,setCategoryDialog]=useState(()=>Boolean(familyId&&pendingCategoryChange(user.id,familyId)));
  const [brandDialog,setBrandDialog]=useState(()=>Boolean(familyId&&pendingBrandCorrection(user.id,familyId)));
  const [optionLabelTarget,setOptionLabelTarget]=useState(()=>familyId?pendingOptionLabel(user.id,familyId)?.target||null:null);
  const [dimensionDialog,setDimensionDialog]=useState(()=>Boolean(familyId&&pendingDimension(user.id,familyId)));
  const [dimensionReview,setDimensionReview]=useState(false);
  const [attributePicker,setAttributePicker]=useState(false),[dimensionName,setDimensionName]=useState("");
  const [unitPreview,setUnitPreview]=useState(null);
  const [unitInput,setUnitInput]=useState(null);
  const unitPreviewRequest=useRef(0);
  useEffect(()=>()=>{unitPreviewRequest.current++;},[]);
  const [dimensionAttributeSlot,setDimensionAttributeSlot]=useState(null),[dimensionActionSlot,setDimensionActionSlot]=useState(null),[dimensionRowSlots,setDimensionRowSlots]=useState({});
  const optionLabelReturn=useRef(null);
  const dimensionSlotRefs=useRef(new Map());
  function dimensionRowRef(id){if(!dimensionSlotRefs.current.has(id))dimensionSlotRefs.current.set(id,el=>setDimensionRowSlots(old=>old[id]===el?old:{...old,[id]:el}));return dimensionSlotRefs.current.get(id);}
  const [dimensionLocked,setDimensionLocked]=useState(()=>Boolean(familyId&&pendingDimension(user.id,familyId)));
  const [expandedRows, setExpandedRows] = useState(() => new Set(familyId ? [] : [draftState.rows[0]?.key]));
  const [singleVariant, setSingleVariant] = useState(false);
  const singleVariantChoice = useRef(null), singleVariantReturn = useRef(null);
  useEffect(() => {
    if (!singleVariant) return undefined;
    let active = true;
    queueMicrotask(() => { if (active) singleVariantChoice.current?.focus(); });
    return () => { active = false; };
  }, [singleVariant]);
  const guard = useRef(false), frozen = useRef(null), formRef = useRef(null), previewTrigger = useRef(null), initialCommon = useRef(commonData);
  useEffect(() => {
    // Chromium's native datalist popup can outlive its scrolled-away anchor.
    const dismissSuggestions = event => {
      const input = document.activeElement;
      if (input?.matches('input[list]') && formRef.current?.contains(input)
        && (event.type === 'resize' || event.target?.contains?.(input))) input.blur();
    };
    window.addEventListener('scroll', dismissSuggestions, true);
    window.addEventListener('resize', dismissSuggestions);
    return () => { window.removeEventListener('scroll', dismissSuggestions, true); window.removeEventListener('resize', dismissSuggestions); };
  }, []);
  const errorRef = useRef(null), reasonRef = useRef(null), configurationRef = useRef(null);
  useEffect(() => { onBusyChange?.(busy || uncertain || dimensionLocked); }, [busy, uncertain, dimensionLocked, onBusyChange]);
  useEffect(() => { onDialogChange?.(singleVariant || confirmSave || Boolean(statusTarget) || reloadConfirm || Boolean(renameTarget) || nameCorrectionOpen || categoryDialog || brandDialog || Boolean(optionLabelTarget) || dimensionReview || attributePicker || Boolean(unitPreview)); }, [unitPreview, attributePicker, singleVariant, confirmSave, statusTarget, reloadConfirm, renameTarget, nameCorrectionOpen, categoryDialog, brandDialog, optionLabelTarget, dimensionReview, onDialogChange]);
  useEffect(() => {
    let live = true;
    if (familyId) getProductBundleRequest(familyId).then(data => { if (live) { savedStock.current=stockSnapshots(data.variants);const next=bundleDraft(data);setDraft(next);setBaseline(bundleDraftSignature(next)); } }).catch(e => { if (live) setError(getApiError(e)); }).finally(() => { if (live) setBusy(false); });
    if (conversionId) getProductConversionRequest(conversionId).then(data => { if (live) { savedStock.current=stockSnapshots([data.product]);const saved=initialSnapshotRef.current?.draft;const next=saved?.conversion?.expectedRevision===data.revision?saved:conversionDraft(data, initialCommon.current);if(saved?.conversion&&next!==saved)toast.warning("El SKU cambió. Revisa la conversión con su información actualizada.");setDraft(next);setExpandedRows(new Set([next.rows[0].key])); } }).catch(e => { if (live) setError(getApiError(e)); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [familyId, conversionId, setError]);
  const change = values => setDraft(d => ({ ...d, ...values }));
  const rowChange = (key, values) => setDraft(d => ({ ...d, rows: d.rows.map(row => row.key === key ? { ...row, ...values } : row) }));
  const hasExisting = draft.rows.some(row => row.id);
  const originalRow = draft.rows.find(row => row.isOriginal);
  const definitionLocked = hasExisting && !draft.conversion;
  const files = [...new Set([...draft.rows.flatMap(row => row.files), ...(draft.rows.some(row => row.useCommon) ? commonFiles : [])])];
  const locked = busy || uncertain || dimensionDialog || !enabled || Boolean(familyId && !draft.familyId) || Boolean(conversionId && !draft.conversion);
  const actionLabel = draft.conversion ? conversionStep === "prepare" ? "Continuar conversión" : "Revisar conversión" : creationStockAction(draft.rows.map(row => row.initialStock)).label;
  useEffect(() => { onActionChange?.({ label: actionLabel, disabled: Boolean(locked) }); }, [onActionChange, actionLabel, locked]);
  const dirty = !baseline || bundleDraftSignature(draft) !== baseline || files.length > 0 || commonFiles.length > 0;
  const unitPlan = unitApplicationPlan(draft);
  const closeUnitPreview = () => { unitPreviewRequest.current++;setUnitPreview(null);setUnitInput(null); requestAnimationFrame(()=>requestAnimationFrame(()=>formRef.current?.querySelector('[data-bundle-field="generalUnit"]')?.focus())); };
  async function openUnitPreview(target) {
    setUnitInput(null);
    if (locked || normalizeUnit(target)===normalizeUnit(draft.unitMeasure)) return;
    if (!validUnit(target)) { toast.warning("Indica una unidad válida de 1 a 50 caracteres."); return; }
    const request = ++unitPreviewRequest.current;
    const plan = unitSelectionPlan(draft,target);
    setUnitPreview({...plan,loading:Boolean(draft.familyId),canApply:!draft.familyId&&plan.canApply});
    if (!draft.familyId) return;
    try {
      const eligibility = await getFamilyUnitEligibilityRequest(draft.familyId,plan.target,draft.revision);
      if (request===unitPreviewRequest.current) setUnitPreview(unitSelectionPlan(draft,target,eligibility));
    } catch (e) {
      if (request!==unitPreviewRequest.current) return;
      if (e.response?.status===409) setConflict(true);
      setUnitPreview({...plan,canApply:false,error:getApiError(e,"No se pudo verificar la elegibilidad. Cierra y vuelve a consultar antes de aplicar.")});
    }
  }
  function applyGeneralUnit() {
    if (locked) return;
    const result = applyUnitSelection(draft, unitPreview);
    if (!result.applied) { toast.warning("El borrador cambió o contiene variantes bloqueadas. Vuelve a revisar la aplicación de unidades."); closeUnitPreview(); return; }
    setDraft(result.draft);
    closeUnitPreview();
    toast.success(`Unidad aplicada a ${result.count} variantes del borrador. Guarda el conjunto para registrar los cambios.`);
  }
  const openRow = key => setExpandedRows(current => new Set([...current, key]));
  const focusInEditor = target => requestAnimationFrame(() => requestAnimationFrame(() => {
    const element = typeof target === "function" ? target() : target;
    const visible = element && !element.disabled && element.getClientRects().length;
    const destination = visible ? element : errorRef.current;
    destination?.scrollIntoView({ block: "center" });
    destination?.focus({ preventScroll: true });
  }));
  function showError(message, { control, variantKey, variantKeys = [], section, field } = {}) {
    setError(message);
    const location = section || (variantKey ? "variants" : control?.closest('[aria-label="Datos generales"]') ? "general" : undefined);
    setErrorTarget({ section: location, variantKeys: [...new Set([...variantKeys, ...(variantKey ? [variantKey] : [])])],
      field: field || control?.dataset.bundleField, attributeKey: control?.dataset.bundleAttribute });
    toast.error(<span aria-hidden="true">{message}</span>, { id: `${pendingKey}-error` });
    if (section === "prepare") setConversionStep("prepare");
    if (section === "attributes") setAttributesOpen(true);
    if (variantKey) { setVariantsOpen(true); openRow(variantKey); }
    variantKeys.forEach(openRow);
    focusInEditor(() => control || (section === "prepare" && reasonRef.current)
      || (variantKey && formRef.current?.querySelector(`[data-variant-key="${variantKey}"] input:not(:disabled)`))
      || (section === "attributes" && formRef.current?.querySelector("#bundle-attribute-fields input:not(:disabled)")) || errorRef.current);
  }
  const fieldFeedback = (field, rowKey, attributeKey) => error && errorTarget?.field === field
    && (!rowKey || errorTarget.variantKeys.includes(rowKey)) && (!attributeKey || errorTarget.attributeKey === attributeKey)
    ? { "aria-invalid": true, "aria-describedby": errorId } : {};
  const contextualError = error && modalOpen && ["prepare", "general", "attributes", "variants"].includes(errorTarget?.section);
  const errorNotice = error && <p id={errorId} ref={errorRef} tabIndex={-1} role="alert" className="m-0 break-words rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>;
  function continueConversion() {
    if (locked) return;
    const length = draft.conversion.reason.trim().length;
    if (length < 8 || length > 500) {
      showError("Indica un motivo de conversión de entre 8 y 500 caracteres.", { section: "prepare", control: reasonRef.current });
      return;
    }
    setError(""); setConversionStep("configure");
    focusInEditor(() => configurationRef.current);
  }
  function addVariant() {
    const row = newBundleRow(draft.attributes.length, draft.conversion ? draft.original : embedded ? commonData : draft);
    setVariantsOpen(true); openRow(row.key); setSingleVariant(false);
    change({ rows: [...draft.rows, row] });
    setTimeout(()=>formRef.current?.querySelector(`[data-variant-key="${row.key}"] input`)?.focus(),0);
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
    if (!draft.familyId && !draft.conversion && draft.rows.length < 2) { singleVariantReturn.current = document.activeElement; setSingleVariant(true); setError(""); return false; }
    const invalidControl = [...(formRef.current?.elements || [])].find(control => control.willValidate && !control.validity.valid);
    if (invalidControl) {
      showError(invalidControl.validationMessage, { control: invalidControl,
        variantKey: invalidControl.closest("[data-variant-key]")?.dataset.variantKey,
        section: invalidControl === reasonRef.current ? "prepare" : invalidControl.closest("#bundle-attribute-fields") ? "attributes" : undefined });
      return false;
    }
    try {
      if (!draft.name.trim() || !draft.categoryId || !draft.unitMeasure.trim()) throw new Error("Completa el nombre, la categoría y la unidad de venta.");
      bundlePayload(draft, createId(), files, commonFiles);
      setError(""); return true;
    } catch (err) { setAttributesOpen(true); setVariantsOpen(true); showError(err.message, err); return false; }
  }
  function review() {
    if(dimensionDialog)return;
    if(unitPreview)return;
    if(unitInput!==null){void openUnitPreview(unitInput);return;}
    onReviewOpen?.();
    if (draft.conversion && conversionStep === "prepare") { continueConversion(); return; }
    if (guard.current || !validateDraft()) return;
    if (bundleRequiresConfirmation(draft)) setConfirmSave(true);
    else void save();
  }
  function backFromConfirmation() {
    setConfirmSave(false);
    focusInEditor(() => formRef.current?.querySelector('button[type="submit"]'));
  }
  useImperativeHandle(reviewRef, () => ({ review, continueAsSimple,
    snapshot() { return guard.current || uncertain ? null : { draft, commonFiles }; },
    resume(base, images) { setDraft(d => resumeBundleDraft(d, base)); setCommonFiles(images); setError(""); setPreview(false); requestAnimationFrame(()=>formRef.current?.querySelector("input")?.focus()); },
    resumeConversion(base, images) { setDraft(d=>resumeConversionDraft(d,base)); setCommonFiles(images); },
    saveSimple() { if (!guard.current && !uncertain) void save(true); },
  }));
  async function load(id) {
    setBusy(true); setError(""); setConflict(false);
    try { const data=id ? await getProductBundleRequest(id) : await getProductConversionRequest(conversionId);savedStock.current=stockSnapshots(id ? data.variants : [data.product]);const next=id ? bundleDraft(data) : conversionDraft(data);setDraft(next);setBaseline(bundleDraftSignature(next));setCommonFiles([]);setAuthorized(false);setExpandedRows(new Set());if(!id)setConversionStep("prepare"); }
    catch (e) { setConflict(true); showError(getApiError(e)); }
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
    } catch(e) { setConflict(true); showError(getApiError(e,e.message || "No se pudo confirmar el cambio. Consulta el estado actualizado antes de reintentar."));setStatusTarget(null); }
    finally { guard.current=false;setBusy(false); }
  }
  const addAttributes = names => {
    setAttributePicker(false);setAttributesOpen(true);setVariantsOpen(true);
    if(definitionLocked){setDimensionName(names[0]);setDimensionDialog(true);setExpandedRows(new Set(draft.rows.map(r=>r.key)));return;}
    const added=names.map(name=>({...newBundleAttribute(),name}));
    change({attributes:[...draft.attributes,...added],rows:draft.rows.map(r=>({...r,selections:[...r.selections,...names.map(()=>"")],optionTexts:[...draft.attributes.map((_,i)=>r.optionTexts?.[i]??bundleRowValues(draft,r)[i]),...names.map(()=>"")]}))});
    focusInEditor(()=>formRef.current?.querySelector(`[data-bundle-attribute="${added[0].key}"]`));
  };
  useBarcodeScanner({ enabled: modalOpen && !locked, captureInModal: true,
    isInputAllowed: target => Boolean(target?.dataset.bundleBarcode),
    onScan: (barcode, {target}) => { if(target?.dataset.bundleBarcode) rowChange(target.dataset.bundleBarcode,{barcode}); } });
  async function finish(result) {
    const creation = frozen.current?.variants?.map(row => ({ initialStock: row.initialStock, existing: Boolean(row.id) }));
    sessionStorage.removeItem(pendingKey); frozen.current = null; setUncertain(false);
    toast.success(result.familyId ? "Producto y variantes guardados." : "Producto guardado.");
    setCanRetry(false); setDraft(d => ({ ...d, familyId: result.familyId, revision: null }));
    try { await onSaved(); } catch { toast.warning("Guardado confirmado. Recarga Inventario para actualizar la lista."); }
    if (embedded || inline) { await onCreated?.(result, creation); return; }
    await load(result.familyId);
  }
  async function recover() {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const key = frozen.current?.operationKey || sessionStorage.getItem(pendingKey);
      const result = key && await getProductBundleOperationRequest(key);
      if (result) await finish(result);
      else if (frozen.current) showError("No hay un guardado confirmado. Puedes reintentar exactamente la misma operación sin duplicar productos.");
      else { sessionStorage.removeItem(pendingKey); setUncertain(false); showError("No se encontró un guardado confirmado. Revisa la familia antes de volver a completar el formulario."); }
    } catch (e) { showError(getApiError(e, "No se pudo verificar el resultado. No crees otra operación todavía.")); }
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
        const body = asSimple ? simpleProductPayload(commonData, createId(), selectedFiles) : bundlePayload(draft, createId(), selectedFiles, commonFiles);
        body.images = await Promise.all(selectedFiles.map(encodeImage));
        // Keep the operation key before posting: a lost response must not create a new batch.
        sessionStorage.setItem(pendingKey, body.operationKey); frozen.current = body;
      }
      const result = await saveProductBundleRequest(frozen.current); await finish(result);
    } catch (e) {
      const status = e.response?.status;
      if(status === 409) setConflict(true);
      setAttributesOpen(true);
      setVariantsOpen(true);
      if (frozen.current && (!status || status >= 500)) { setUncertain(true); setCanRetry(true); }
      else { frozen.current = null; sessionStorage.removeItem(pendingKey); setUncertain(false); }
      const unitProblem = e.response?.data?.details;
      const affected = unitProblem?.field === "unitMeasure" && draft.rows.find(row=>row.id===unitProblem.productId);
      showError(getApiError(e, e.message || "No se pudo guardar. Revisa los datos."), e.response ? affected ? { section:"variants",variantKey:affected.key,field:"unitMeasure" } : {} : e);
    } finally { guard.current = false; setBusy(false); }
  }
  const previewAction = <button ref={previewTrigger} type="button" disabled={locked} className={secondaryButtonClass} onClick={() => setPreview(true)}><Eye size={16} />Vista previa del catálogo</button>;
  const content = <form noValidate ref={formRef} className="grid min-w-0 gap-4" onSubmit={e => { e.preventDefault(); if(embedded){if(validateDraft())onBack();}else review(); }}>
      {modalOpen && !contextualError && errorNotice}

      {familyId && !draft.familyId && !busy && <button type="button" onClick={() => load(familyId)}>Reintentar consulta de la familia</button>}
      {conversionId && !draft.conversion && !busy && <button type="button" onClick={() => load()}>Reintentar consulta del producto original</button>}
      {conversionId && !draft.conversion && busy && <p role="status" className="m-0 text-sm">Cargando producto original…</p>}
      {conflict && (familyId || conversionId) && <button type="button" className={`${secondaryButtonClass} w-fit text-xs`} disabled={locked} onClick={()=>setReloadConfirm(true)}>Recargar información vigente</button>}
      {uncertain && <div className={box}><p className="m-0 text-sm">Hay un guardado cuyo resultado debe verificarse antes de continuar.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button>{canRetry && <button type="button" disabled={busy} onClick={save}>Reintentar mismo guardado</button>}</div></div>}
      <fieldset disabled={locked&&!dimensionDialog} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        {draft.conversion && <section hidden={conversionStep !== "prepare"} className={conversionStep === "prepare" ? box : "hidden"} aria-label="Preparar conversión">
          <h3 className="m-0 text-base font-bold">1. Preparar conversión</h3>
          <p className="m-0 break-words text-sm"><strong>Producto #{draft.original.id}</strong> · {draft.original.name}</p>
          <p className="m-0 text-sm">Stock físico actual: <strong>{formatQuantityWithUnit(draft.original.currentStock,draft.original.unitMeasure)}</strong></p>
          <ul className="m-0 grid gap-1 pl-5 text-sm"><li>Conserva su ID, stock, imágenes e historial.</li><li>No se registrará otra entrada inicial para el original.</li><li>En el siguiente paso deberás asignarle una combinación de atributos.</li></ul>
          {contextualError && errorTarget.section === "prepare" && errorNotice}
          <label>Motivo de conversión<textarea ref={reasonRef} data-bundle-field="reason" {...fieldFeedback("reason")} required minLength={8} maxLength={500} className={area} value={draft.conversion.reason} onChange={e => change({ conversion:{...draft.conversion,reason:e.target.value} })} /></label>
          <div className="variant-editor-actions"><button type="button" className={`${secondaryButtonClass} mr-auto!`} onClick={backToProduct}>Volver al producto</button>{!externalActions && <button type="button" className="product-positive-action" onClick={continueConversion}>Continuar</button>}</div>
        </section>}
        <div hidden={Boolean(conversionId && conversionStep === "prepare")} className={conversionId && conversionStep === "prepare" ? "hidden" : "grid min-w-0 gap-4"}>
        {draft.conversion && <h3 ref={configurationRef} tabIndex={-1} className="m-0 text-base font-bold">2. Configurar variantes</h3>}
        {!embedded && <section inert={dimensionDialog} className={box} aria-label="Datos generales">
          <h3 className="m-0 text-base font-bold">Datos generales</h3>
          {contextualError && errorTarget.section === "general" && errorNotice}
          <div className="bundle-general-fields grid min-w-0 items-start gap-3 sm:grid-cols-2">
            <label>Nombre general<input data-bundle-field="generalName" {...fieldFeedback("generalName")} required maxLength={150} value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
            {familyId&&user.role==="ADMIN" ? <AuditedValueControl label="Categoría" value={categories.find(c=>Number(c.id)===Number(draft.categoryId))?.name||`Categoría #${draft.categoryId}`} action="Cambiar categoría" disabled={locked||conflict}
              help={dirty ? "Guarda o descarta los cambios pendientes antes de cambiar categoría." : "Operación independiente para todas las variantes."}
              onClick={()=>{if(dirty){toast.warning("Guarda o descarta explícitamente el borrador antes de cambiar categoría. No se perderán tus cambios.");return;}setCategoryDialog(true);}}/>
              : <ProductCategoryField categories={categories} value={draft.categoryId} disabled={hasExisting} inputProps={{"data-bundle-field":"categoryId",...fieldFeedback("categoryId")}} onChange={categoryId=>change({categoryId})}/>}
            {familyId&&user.role==="ADMIN" ? <AuditedValueControl data-brand-correction label="Marca" value={draft.brand||"Sin marca registrada"} action="Corregir marca" disabled={locked||conflict}
              help={dirty ? "Guarda o descarta los cambios pendientes antes de corregir la marca." : "Corrección independiente del mismo fabricante, para todas las variantes."}
              onClick={()=>{if(dirty){toast.warning("Guarda o descarta explícitamente el borrador antes de corregir la marca. Tus datos se conservan.");return;}setBrandDialog(true);}}/>
              : <div className="grid min-w-0 content-start gap-1"><label>Marca (opcional)<input maxLength={100} placeholder="Sin marca registrada" disabled={hasExisting} value={draft.brand} onChange={e => change({ brand: e.target.value })} /></label>
              {hasExisting && <p className="m-0 flex items-start gap-1 text-xs text-slate-500"><Info size={14} className="mt-0.5 shrink-0" aria-hidden="true"/>La marca está protegida; sus correcciones requieren una operación independiente.</p>}</div>}
            <div className="grid min-w-0 content-start gap-2"><ProductUnitField label="Unidad general" disabled={locked||Boolean(draft.conversion)} value={unitInput??draft.unitMeasure} inputProps={{"data-bundle-field":"generalUnit",...fieldFeedback("generalUnit")}} onChange={setUnitInput} onCommit={openUnitPreview}/>
              <p className="m-0 text-xs text-slate-500">Selecciona una unidad o escríbela y pulsa Enter para revisar su aplicación. Solo la confirmación actualiza el borrador; cancelar conserva las unidades.</p>
              {unitPlan.valid&&unitPlan.same===unitPlan.rows.length&&<span className="text-xs text-slate-500">Todas las variantes ya utilizan esta unidad.</span>}
            </div>
          </div>
          <label>Características generales (opcional)<textarea className={area} value={draft.description} onChange={e => change({ description: e.target.value })} /></label>
          {hasExisting && <p className="m-0 text-xs text-slate-500">Nombre y características describen la familia, no los artículos. La unidad general es el valor inicial de las variantes nuevas; aplicarla a otras requiere confirmar la vista previa.</p>}
          <details className="min-w-0 text-xs"><summary className="cursor-pointer py-2 font-semibold">Fotografías comunes (opcional){commonFiles.length>0 ? ` · ${commonFiles.length} seleccionadas` : ""}</summary>
            <div className="grid min-w-0 gap-2 pt-2">
            <ProductImagesManager compact disabled={locked} pendingFiles={commonFiles}
              onFilesSelected={selected=>setCommonFiles(current=>[...new Map([...current,...selected].map(file=>[`${file.name}|${file.size}|${file.lastModified}`,file])).values()])}
              onRemovePending={index=>setCommonFiles(current=>current.filter((_,i)=>i!==index))}/>
            {commonFiles.length>0 && <p className="m-0">Se aplicarán a: {draft.rows.filter(r=>r.useCommon).map(r=>bundleRowName(draft,r)).join(", ") || "ninguna variante; marca las filas correspondientes"}.</p>}
            <p className="m-0 text-slate-500">Se agregan solo a los artículos marcados, sin reemplazar sus fotos. Actualmente cada artículo conserva una copia independiente; no existe una galería general compartida.</p></div>
          </details>
        </section>}
        <section className={box} aria-label="Atributos de variación">
          <div className="variant-section-heading"><h3 className="m-0 min-w-0 text-base font-bold">{familyId ? <button type="button" className="variant-section-toggle" aria-expanded={attributesOpen} aria-controls="bundle-attribute-fields" onClick={()=>setAttributesOpen(v=>!v)}><ChevronDown size={17} className={attributesOpen ? "rotate-180" : ""}/>Atributos ({draft.attributes.length})</button> : <>Atributos ({draft.attributes.length})</>}</h3>
            {draft.attributes.length<8 && <button type="button" data-add-dimension aria-label="Agregar otro atributo" title="Agregar otro atributo" className={`${secondaryButtonClass} variant-section-add ml-auto! mr-0! min-h-11 text-xs`} disabled={locked || (definitionLocked && !familyId)} onClick={()=>{if(definitionLocked&& (dirty||conflict)){toast.warning(conflict?"Recarga la familia antes de ampliar sus atributos.":"Guarda o descarta explícitamente el borrador antes de ampliar los atributos. Tus datos se conservan.");return;}setAttributePicker(true);}}><Plus size={18} aria-hidden="true"/><span>Agregar otro atributo</span></button>}
          </div>
          {contextualError && errorTarget.section === "attributes" && errorNotice}
          {definitionLocked && <p className="m-0 flex items-start gap-1 text-xs text-slate-500"><Info size={14} className="mt-0.5 shrink-0" aria-hidden="true"/>Una dimensión nueva se incorpora por separado, asignando una opción a todos los artículos. No se eliminan ni reasignan las dimensiones existentes.</p>}
          <div id="bundle-attribute-fields" hidden={!attributesOpen} className={attributesOpen ? "grid min-w-0 gap-2" : "hidden"}>
          <p className="m-0 text-xs text-slate-500">La presentación (por ejemplo, 400 ml) es una opción; no cambia la unidad de venta.</p>
          {draft.attributes.map((a, i) => <div inert={dimensionDialog} key={a.key} className="grid min-w-0 gap-2 py-2">
            <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1">{familyId && a.id && user.role === "ADMIN" ? <AuditedValueControl label={`Nombre del atributo ${i+1}`} value={a.name} action="Renombrar atributo" data-rename-attribute={a.id} disabled={locked||conflict} help={dirty ? "Guarda o descarta los cambios pendientes antes de renombrar." : "Solo cambia el nombre descriptivo; conserva opciones e identificadores."} onClick={()=>{if(dirty){toast.warning("Guarda o descarta los cambios pendientes antes de renombrar. Tu borrador se conserva.");return;}setRenameTarget({id:a.id,name:a.name});}}/>
              : <label>Nombre del atributo {i+1}<input data-bundle-field="attributeName" data-bundle-attribute={a.key} {...fieldFeedback("attributeName", undefined, a.key)} required maxLength={60} disabled={definitionLocked} value={a.name} placeholder="Color, medida, presentación…" onChange={e => change({ attributes: draft.attributes.map((at, j) => j === i ? { ...at, name: e.target.value } : at) })} /></label>}</div>
            {!definitionLocked && draft.attributes.length > 1 && <button type="button" className={`${secondaryButtonClass} mr-0! min-h-11 shrink-0`} aria-label={`Quitar atributo ${i+1}`} onClick={() => change({ attributes: draft.attributes.filter((_,j)=>j!==i),rows:draft.rows.map(r=>({...r,selections:r.selections.filter((_,j)=>j!==i),optionTexts:r.optionTexts?.filter((_,j)=>j!==i)})) })}><Trash2 size={16}/></button>}</div>
            <AttributeMeasurementFields attribute={a} label={`atributo ${i+1}`} disabled={locked||definitionLocked} hasValues={a.draftOptions.length>0||draft.rows.some(r=>r.optionTexts?.[i]?.trim())} onChange={measurement=>change({attributes:draft.attributes.map((at,j)=>j===i?{...at,...measurement}:at)})}/>
            {legacyMeasurementCandidate(a)&&<p className="m-0 text-xs text-slate-500">Estas etiquetas podrían revisarse para una futura unidad estructurada ({legacyMeasurementCandidate(a)}). Solo diagnóstico: no se convierten ni se retiran sufijos.</p>}
            <p className="m-0 text-xs text-slate-500">Indica el valor de {a.name || "este atributo"} en cada variante. Solo se guardan las combinaciones que completes.</p>
          </div>)}
          <div ref={setDimensionAttributeSlot}/>
          </div>
        </section>
        <section className={box} aria-label="Variantes concretas">
          <div className="variant-section-heading"><h3 className="m-0 min-w-0 text-base font-bold">{familyId ? <button type="button" className="variant-section-toggle" aria-expanded={variantsOpen} aria-controls="bundle-variant-rows" onClick={()=>setVariantsOpen(v=>!v)}><ChevronDown size={17} className={variantsOpen ? "rotate-180" : ""}/>Variantes ({draft.rows.length})</button> : <>Variantes ({draft.rows.length})</>}</h3>
          {draft.rows.length<100 && <button type="button" aria-label="Agregar otra variante" title="Agregar otra variante" disabled={locked} className={`${secondaryButtonClass} variant-section-add ml-auto! mr-0! min-h-11 text-xs`} onClick={addVariant}><Plus size={18} aria-hidden="true"/><span>Agregar otra variante</span></button>}</div>
          {contextualError && errorTarget.section === "variants" && errorNotice}
          <p className="m-0 text-xs text-slate-500">Configura solo las combinaciones que venderás. Cada artículo conserva su precio y stock.</p>
          <div id="bundle-variant-rows" hidden={!variantsOpen} className={variantsOpen ? "grid min-w-0 gap-3" : "hidden"}>
          {draft.rows.map((row, index) => <section key={row.key} className={`${box} ${error && errorTarget?.variantKeys.includes(row.key) ? "variant-has-error" : ""}`} aria-label={`Variante ${index + 1}`} data-variant-key={row.key}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h4 className="m-0 min-w-0 flex-1 text-sm font-bold"><button type="button" className="variant-section-toggle min-h-11 w-full flex-wrap! justify-start! text-left" aria-expanded={expandedRows.has(row.key)} aria-controls={`variant-fields-${row.key}`} onClick={()=>setExpandedRows(current=>{const next=new Set(current);if(next.has(row.key))next.delete(row.key);else next.add(row.key);return next;})}><ChevronDown size={17} className={expandedRows.has(row.key)?"rotate-180":""}/><span>Variante {index+1}{row.id ? ` · Producto #${row.id} ·` : ""}</span>{row.id && <span className={badgeClass(row.status ? "success" : "neutral")}>{row.status ? "Activo" : "Inactivo"}</span>}<span className="min-w-0 break-words font-normal">{bundleRowLabels(draft,row).filter(Boolean).join(" · ") || bundleRowName(draft,row) || "Sin nombre"}</span></button></h4>{!row.id && draft.rows.length>1 && <button type="button" aria-label={`Quitar variante ${index+1}`} className={`${secondaryButtonClass} mr-0! min-h-11`} onClick={()=>change({rows:draft.rows.filter(r=>r.key!==row.key)})}><Trash2 size={16}/></button>}</div>
            {error && errorTarget?.variantKeys.includes(row.key) && <span className="text-xs font-semibold text-critical-600">Revisar variante {index+1}</span>}
            <div id={`variant-fields-${row.key}`} hidden={!expandedRows.has(row.key)} className={expandedRows.has(row.key) ? "grid min-w-0 gap-3" : "hidden"}>
            {row.isOriginal && <p className="m-0 text-sm font-bold text-rust-700">Original conservado — sin entrada de stock</p>}
            <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">{draft.attributes.map((a, i) => {const selected=a.draftOptions.find(o=>o.key===row.selections[i]);const canCorrect=familyId&&selected?.id&&user.role==="ADMIN"&&!a.unitCode;return <div key={a.key} className="grid min-w-0 content-start gap-1"><label htmlFor={`option-input-${a.key}-${row.key}`}>Opción de {a.name || `atributo ${i + 1}`}{a.unitCode?` (${a.unitCode})`:""}</label><div className="bundle-option-control relative min-w-0"><input id={`option-input-${a.key}-${row.key}`} data-bundle-field="selections" {...fieldFeedback("selections", row.key)} className={canCorrect?"pr-12!":""} required maxLength={100} inputMode={a.measurementKind?"decimal":undefined} disabled={locked||!validAttributeMeasurement(a)||(row.hasHistory && !row.isOriginal)} value={row.optionTexts?.[i] ?? bundleRowValues(draft,row)[i]} placeholder={a.measurementKind?"Ej.: 100 (sin unidad)":"Ej.: 400 ml"} list={`options-${a.key}-${row.key}`} onChange={e => setDraft(d => setBundleRowOption(d,row.key,i,e.target.value))} /><datalist id={`options-${a.key}-${row.key}`}>{a.draftOptions.map(o => <option key={o.key} value={o.label} />)}</datalist>
              {canCorrect&&<button type="button" title="Editar" data-option-label={selected.id} aria-haspopup="dialog" aria-label={`Corregir etiqueta compartida ${selected.label} de ${a.name}, producto #${row.id}`} className="bundle-option-pencil inventory-pencil-button" disabled={locked||conflict} onClick={event=>{if(dirty){toast.warning("Guarda o descarta explícitamente el borrador antes de corregir la etiqueta. Tus datos se conservan.");return;}optionLabelReturn.current=event.currentTarget;setOptionLabelTarget({attributeId:a.id,optionId:selected.id,attributeName:a.name,label:selected.label});}}><Pencil size={16} aria-hidden="true"/><span className="sr-only">Corregir etiqueta compartida</span></button>}</div>
              {a.measurementKind&&<p className="m-0 break-words text-xs text-slate-500">Vista previa: {attributeOptionLabel(row.optionTexts?.[i]??bundleRowValues(draft,row)[i],a.unitCode)||"Ingresa un valor positivo sin unidad"}{a.id?". Los valores guardados no se corrigen como etiquetas de texto.":""}</p>}
            </div>;})}
            </div>
            <div ref={dimensionRowRef(row.id)}/>
            <fieldset disabled={locked} className="m-0 grid min-w-0 gap-3 border-0 p-0">
            {row.hasHistory && !row.isOriginal && <p className="m-0 text-xs text-slate-500">Esta combinación tiene historial. Para otro valor, agrega una variante con una opción nueva; no cambies el significado de la opción utilizada.</p>}
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">{row.id && !row.isOriginal && user.role === "ADMIN" ? <ProductNameCorrectionAction asField key={`${row.id}-${draft.revision}`} product={row} dirty={dirty} busy={locked||conflict} onOpenChange={setNameCorrectionOpen} onConflict={()=>setConflict(true)} onRenamed={async()=>{await load(familyId);await onSaved();}}/>
                : <label>Nombre identificable<input data-bundle-field="name" {...fieldFeedback("name", row.key)} maxLength={150} required disabled={Boolean(row.id) || row.isOriginal} value={bundleRowName(draft, row)} onChange={e => rowChange(row.key, { name: e.target.value, nameCustomized: true })} /></label>}</div>
              <label>Precio CLP<input data-bundle-field="price" {...fieldFeedback("price", row.key)} required type="number" min="0" step="1" max="9999999999" value={row.price} onChange={e => rowChange(row.key, { price: e.target.value })} /></label>
              <label>Código de barras (opcional)<span className="relative block"><ScanBarcode aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={18}/><input data-bundle-field="barcode" {...fieldFeedback("barcode", row.key)} className="pl-10! text-xs" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,64}" maxLength={64} data-bundle-barcode={row.key} value={row.barcode || ""} onChange={e=>rowChange(row.key,{barcode:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} placeholder="Haz clic aquí y escanea, o escribe el código" title="Lector tipo teclado o ingreso manual; Enter no guarda el formulario"/></span></label>
            </div>
            <label>Descripción individual (opcional)<textarea className={area} value={row.description ?? (row.id ? "" : draft.description)} onChange={e=>rowChange(row.key,{description:e.target.value})}/></label>
            <div className="variant-inventory-fields grid min-w-0 items-start gap-3 lg:grid-cols-3">
              <div className="relative grid min-w-0 content-start gap-1"><ProductUnitField label="Unidad individual" editIcon={!(row.hasHistory||row.isOriginal)} disabled={locked||row.hasHistory||row.isOriginal} value={row.unitMeasure??draft.unitMeasure} inputProps={{"data-bundle-field":"unitMeasure",...fieldFeedback("unitMeasure",row.key)}} onChange={unitMeasure=>rowChange(row.key,{unitMeasure})}/>{(row.hasHistory||row.isOriginal)&&<span className="text-xs text-slate-500">{row.isOriginal?"La conversión conserva la unidad original.":"Unidad protegida por ventas, pedidos o movimientos de inventario, incluidas entradas."}</span>}{row.id&&!row.hasHistory&&!row.isOriginal&&<span className="text-xs text-slate-500">Se verifican compromisos pendientes al guardar. Si existe un bloqueo, no se guarda ningún cambio del conjunto.</span>}</div>
              <label className="content-start">Stock mínimo<input data-bundle-field="minimumStock" {...fieldFeedback("minimumStock", row.key)} className="min-h-10.25" type="number" required min="0" step="1" max="2147483647" value={row.minimumStock} onChange={e => rowChange(row.key, { minimumStock: e.target.value })} /></label>
              {row.id ? <VariantStockSummary product={savedStock.current.get(row.id)} draftMinimumStock={row.minimumStock}/> : <label className="content-start" htmlFor={`initial-stock-${row.key}`}>Stock inicial
                <input data-bundle-field="initialStock" {...fieldFeedback("initialStock", row.key)} className="min-h-10.25" id={`initial-stock-${row.key}`} type="number" min="0" max="2147483647" step="1" value={row.initialStock} onChange={e => rowChange(row.key, { initialStock: e.target.value })} aria-describedby={[fieldFeedback("initialStock", row.key)["aria-describedby"],`initial-stock-help-${row.key}`].filter(Boolean).join(" ")}/>
                <span className="text-xs font-normal text-slate-500" id={`initial-stock-help-${row.key}`}>Al guardar se registra una entrada si es mayor que cero.</span>
              </label>}
            </div>
            <div className="variant-stock-actions flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              {row.id ? <>
                <button type="button" className={`${row.status ? dangerButtonClass : secondaryButtonClass} mr-0! min-h-10 px-3 text-xs`} disabled={dirty || Boolean(draft.conversion)}
                  title={dirty || draft.conversion ? "Guarda primero la configuración pendiente para cambiar un estado existente" : undefined} onClick={()=>setStatusTarget(row)}>
                  {row.status ? <XCircle size={16}/> : <CheckCircle size={16}/>} {row.status ? "Desactivar" : "Activar"}
                </button></> : <label className="variant-online-control"><input type="checkbox" checked={row.status} onChange={e=>rowChange(row.key,{status:e.target.checked})}/>Activo inicialmente</label>}
              <label className="variant-online-control"><input type="checkbox" checked={row.inStoreOnly} onChange={e=>rowChange(row.key,{inStoreOnly:e.target.checked})}/>Solo presencial</label>
              {commonFiles.length>0 && <label className="variant-online-control"><input type="checkbox" checked={row.useCommon} onChange={e=>rowChange(row.key,{useCommon:e.target.checked})}/>La imagen común representa esta variante</label>}
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
            </fieldset>
            </div>
          </section>)}
          </div>
        </section>
        {files.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Confirmo la autorización de uso de estas imágenes y que corresponden a las variantes seleccionadas.</label>}
        <div hidden={dimensionDialog} className="bundle-footer-actions" data-external-actions={externalActions ? "true" : undefined}><button type="button" className={secondaryButtonClass} onClick={draft.conversion ? () => { setConversionStep("prepare"); focusInEditor(() => reasonRef.current); } : embedded ? backToProduct : onClose}>{draft.conversion ? "Volver a preparar conversión" : embedded ? "Volver al producto" : "Cancelar"}</button>{!dimensionDialog&&previewAction}{!externalActions && <button type="submit" className="product-positive-action creation-continue-action">{inline && !draft.conversion ? <><span>{busy ? "Guardando…" : actionLabel}</span><ArrowRight size={18} aria-hidden="true" /></> : <><Save size={16}/>{busy ? "Guardando…" : draft.conversion ? "Revisar conversión" : embedded ? "Confirmar configuración" : "Guardar cambios"}</>}</button>}</div>
        </div>
      </fieldset>
    </form>
  ;
  const focusDimensionTrigger=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>formRef.current?.querySelector('[data-add-dimension]')?.focus()));
  const closeDimension=()=>{setDimensionDialog(false);focusDimensionTrigger();};
  const editorContent=<>{content}<div ref={setDimensionActionSlot}/>
    {dimensionDialog&&draft.familyId&&<FamilyDimensionDialog inline slots={{attribute:dimensionAttributeSlot,actions:dimensionActionSlot,rows:dimensionRowSlots}} previewAction={previewAction} initialName={dimensionName} onInvalidAttribute={()=>setAttributesOpen(true)} onInvalidRow={key=>{setVariantsOpen(true);openRow(key);}} draft={draft} userId={user.id} onClose={closeDimension} onReviewChange={setDimensionReview} onBusyChange={setDimensionLocked} onConflict={()=>setConflict(true)} onSaved={async()=>{setDimensionDialog(false);await load(familyId);await onSaved();focusDimensionTrigger();}}/>}
  </>;
  return <>
    {inline && !modalOpen && <div className="grid gap-3">
      {errorNotice}
      {simpleModeEnabled && pendingFiles.length > 0 && <label className="variant-online-control"><input type="checkbox" checked={authorized} onChange={event=>setAuthorized(event.target.checked)}/>Confirmo la autorización de uso de las imágenes de este producto.</label>}
      {uncertain && <div role="status" className={box}><p className="m-0 text-sm">Consulta el resultado del guardado pendiente antes de crear otro artículo.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button>{canRetry && <button type="button" disabled={busy} onClick={()=>save()}>Reintentar mismo guardado</button>}</div>}
    </div>}
    {inline ? <div hidden={!modalOpen || preview} className={modalOpen && !preview ? "min-w-0" : "hidden"}>{editorContent}</div> : <AppModal panelClassName="bundle-editor-modal" suspended={nameCorrectionOpen || categoryDialog || brandDialog || Boolean(optionLabelTarget) || dimensionReview || attributePicker || Boolean(unitPreview)} open={modalOpen && !preview && !singleVariant && !confirmSave && !statusTarget && !reloadConfirm && !renameTarget} title={<span className="flex min-w-0 items-start gap-3"><span className="min-w-0 break-words">{draft.conversion ? "Convertir producto en variantes" : embedded ? "Agregar variantes" : "Editar producto con variantes"}</span>{draft.familyId&&!draft.conversion&&!embedded&&<span className="mt-0.5 shrink-0 rounded border border-slate-300 px-2 py-0.5 font-mono text-xs font-semibold text-slate-500">Familia #{draft.familyId}</span>}</span>}
      description="Cada opción mantiene su identificación, precio e inventario." size="xlarge" onClose={() => { if(dimensionDialog){if(!dimensionLocked)closeDimension();return;}if (!busy) { if(embedded) onBack();else onClose(); } }}>{editorContent}</AppModal>}
    {attributePicker&&<AttributeSuggestionDialog existing={draft.attributes.map(a=>a.name)} limit={definitionLocked?1:8-draft.attributes.length} audited={definitionLocked} onClose={()=>{setAttributePicker(false);focusDimensionTrigger();}} onConfirm={addAttributes}/>}
    {unitPreview&&<ProductUnitApplicationDialog plan={unitPreview} onClose={closeUnitPreview} onConfirm={applyGeneralUnit}/>}
    {categoryDialog&&draft.familyId&&<FamilyCategoryDialog draft={draft} categories={categories} userId={user.id} onClose={()=>setCategoryDialog(false)} onConflict={()=>setConflict(true)} onSaved={async()=>{setCategoryDialog(false);await load(familyId);await onSaved();}}/>}
    {brandDialog&&draft.familyId&&<FamilyBrandDialog draft={draft} userId={user.id} onClose={()=>setBrandDialog(false)} onConflict={()=>setConflict(true)} onSaved={async()=>{setBrandDialog(false);await load(familyId);await onSaved();requestAnimationFrame(()=>requestAnimationFrame(()=>formRef.current?.querySelector('[data-brand-correction]')?.focus()));}}/>}
    {optionLabelTarget&&draft.familyId&&<OptionLabelCorrectionDialog draft={draft} target={optionLabelTarget} userId={user.id}
      onClose={()=>{setOptionLabelTarget(null);requestAnimationFrame(()=>requestAnimationFrame(()=>optionLabelReturn.current?.focus()));}}
      onConflict={()=>setConflict(true)} onSaved={async()=>{const id=optionLabelTarget.optionId,rowKey=optionLabelReturn.current?.closest('[data-variant-key]')?.dataset.variantKey;setOptionLabelTarget(null);await load(familyId);setVariantsOpen(true);if(rowKey)openRow(rowKey);await onSaved();requestAnimationFrame(()=>requestAnimationFrame(()=>{const control=formRef.current?.querySelector(`${rowKey?`[data-variant-key="${rowKey}"] `:""}[data-option-label="${id}"]`);control?.scrollIntoView({block:"center"});control?.focus();}));}}/>}
    {renameTarget && <ProductAttributeRenameDialog familyId={familyId} target={renameTarget} revision={draft.revision} userId={user.id}
      onClose={()=>{const id=renameTarget.id;setRenameTarget(null);requestAnimationFrame(()=>requestAnimationFrame(()=>formRef.current?.querySelector(`[data-rename-attribute="${id}"]`)?.focus()));}}
      onConflict={()=>setConflict(true)} onRenamed={async()=>{const id=renameTarget.id;await load(familyId);setAttributesOpen(true);setRenameTarget(null);try{await onSaved();}catch{toast.warning("Renombrado confirmado. Actualiza Inventario para renovar sus etiquetas.");}requestAnimationFrame(()=>formRef.current?.querySelector(`[data-rename-attribute="${id}"]`)?.focus());}}/>}
    <AppModal open={singleVariant} title="Solo has configurado una variante" size="small" onClose={()=>{setSingleVariant(false);requestAnimationFrame(()=>requestAnimationFrame(()=>singleVariantReturn.current?.focus()));}}>
      <p>Para crear una familia necesitas al menos dos variantes. Puedes agregar otra o guardar este artículo como producto simple.</p>
      <p className="text-xs text-slate-500">Como simple se conservarán los datos, stock e imágenes de la primera variante. Los atributos no se guardarán; el borrador seguirá disponible en esta ventana.</p>
      <div className="grid gap-3"><button ref={singleVariantChoice} type="button" className="product-positive-action m-0! w-full" onClick={addVariant}>Agregar otra variante</button>{inline && <button type="button" className={`${secondaryButtonClass} m-0! w-full`} onClick={continueAsSimple}>Continuar como producto simple</button>}</div>
    </AppModal>
    <AppModal open={reloadConfirm} title="Recargar información vigente" size="small" onClose={()=>setReloadConfirm(false)}><p>Se descartará el borrador de este conjunto para cargar los cambios más recientes. No se guardarán datos ni se sobrescribirá a otro administrador.</p><div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} onClick={()=>setReloadConfirm(false)}>Conservar borrador</button><button type="button" className="product-positive-action" onClick={()=>{setReloadConfirm(false);load(familyId);}}>Descartar borrador y recargar</button></div></AppModal>
    {preview && (!inline || modalOpen) && <ProductBundlePreview inline={inline} draft={draft} commonFiles={commonFiles} categories={categories} onClose={() => { setPreview(false); requestAnimationFrame(()=>previewTrigger.current?.focus()); }} />}
    <AppModal open={Boolean(statusTarget)} title={statusTarget?.status ? "Desactivar variante" : "Activar variante"} onClose={()=>{if(!busy)setStatusTarget(null);}} size="small">
      <p>Confirma el cambio únicamente para <strong>#{statusTarget?.id} · {statusTarget?.name}</strong>. Su asociación, stock, precio, código e historial se conservarán. No se guardarán otros cambios ni se registrarán entradas de inventario.</p>
      <div className="admin-form-actions"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={()=>setStatusTarget(null)}>Volver</button><button type="button" className={statusTarget?.status ? dangerButtonClass : "product-positive-action"} disabled={busy} onClick={changeExistingStatus}>{busy ? "Actualizando…" : statusTarget?.status ? "Sí, desactivar" : "Sí, activar"}</button></div>
    </AppModal>
    <AppModal open={confirmSave} title={draft.conversion ? "Confirmar conversión del producto" : "Confirmar cambios de fotografías"} onClose={backFromConfirmation} size={draft.conversion ? "large" : "small"}>
      {draft.conversion ? <ProductConversionSummary draft={draft}/> : <p>Se quitarán las fotografías guardadas que retiraste del borrador. Las imágenes de las demás variantes no se modificarán. El guardado se realizará en una única operación.</p>}
      <div className="admin-form-actions mt-4"><button type="button" className={secondaryButtonClass} onClick={backFromConfirmation}>Revisar</button><button type="button" className="product-positive-action" disabled={busy} onClick={save}>{draft.conversion ? "Confirmar conversión" : "Confirmar guardado"}</button></div></AppModal>
  </>;
}

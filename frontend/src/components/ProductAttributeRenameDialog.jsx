import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import { getApiError } from "../api/httpClient.js";
import { renameFamilyAttributeRequest, getAttributeRenameOperationRequest } from "../services/productFamilies.service.js";
import { attributeRenameStorageKey } from "../helpers/attributeRename.js";
import { productNameCorrectionStorageKey } from "../helpers/productNameCorrection.js";
import { correctProductNameRequest, getProductNameCorrectionRequest } from "../services/products.service.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";

export default function ProductAttributeRenameDialog({ familyId, productId, target, revision, userId, onClose, onRenamed, onConflict }) {
  const productMode = Boolean(productId);
  const maxName = productMode ? 150 : 60;
  const [name, setName] = useState(target.body?.name || target.name);
  const [reason, setReason] = useState(target.body?.reason || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(Boolean(target.body));
  const [error, setError] = useState("");
  const guard = useRef(false), frozen = useRef(target.body || null), alertRef = useRef(null);
  const errorId = useId(), explanationId = useId();
  const storageKey = productMode ? productNameCorrectionStorageKey(userId, productId) : attributeRenameStorageKey(userId, familyId);
  const normalizedName = name.trim().replace(/\s+/g, " ");
  function report(message) {
    setError(message);
    toast.error(<span aria-hidden="true">{message}</span>, { id: `${storageKey}-error` });
    requestAnimationFrame(() => { alertRef.current?.scrollIntoView({ block: "center" }); alertRef.current?.focus(); });
  }
  async function finish(result) {
    sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false);
    await onRenamed(result);
    toast.success(productMode ? "Nombre corregido. ID e historial conservados." : "Nombre del atributo actualizado. Opciones y artículos conservados.");
  }
  async function submit(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (guard.current) return;
    if (!frozen.current && (!confirmed || !normalizedName || normalizedName.length > maxName || reason.trim().length < 8 || reason.trim().length > 500)) {
      report("Revisa el nuevo nombre, indica un motivo de entre 8 y 500 caracteres y confirma el cambio descriptivo."); return;
    }
    guard.current = true; setBusy(true); setError("");
    try {
      if (!frozen.current) {
        const body = { name: normalizedName, reason: reason.trim(), confirmed: true, expectedRevision: revision, operationKey: crypto.randomUUID() };
        sessionStorage.setItem(storageKey, JSON.stringify({ id: target.id, name: target.name, body }));
        frozen.current = body;
      }
      await finish(await (productMode ? correctProductNameRequest(productId, frozen.current) : renameFamilyAttributeRequest(familyId, target.id, frozen.current)));
    } catch (failure) {
      if (frozen.current && (!failure.response || failure.response.status >= 500)) setUncertain(true);
      else { sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); }
      if (failure.response?.status === 409) onConflict();
      report(getApiError(failure, "No se pudo confirmar el renombrado. Consulta el resultado antes de volver a intentarlo."));
    } finally { guard.current = false; setBusy(false); }
  }
  async function recover() {
    if (guard.current || !frozen.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const result = await (productMode ? getProductNameCorrectionRequest(productId, frozen.current.operationKey) : getAttributeRenameOperationRequest(familyId, target.id, frozen.current.operationKey));
      if (result) await finish(result);
      else {
        sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); setConfirmed(false);
        report("No hay un renombrado confirmado. Revisa los datos antes de confirmar nuevamente.");
      }
    } catch (failure) { report(getApiError(failure, "No se pudo comprobar el resultado. No inicies otra operación todavía.")); }
    finally { guard.current = false; setBusy(false); }
  }
  return <AppModal open initialFocusSelector="fieldset input" title={productMode ? "Corregir nombre del producto" : "Renombrar atributo"} size="medium" onClose={() => { if (!busy && !uncertain) onClose(); }}>
    <form className="grid min-w-0 gap-3" onSubmit={submit}>
      <p id={explanationId} className="m-0 text-sm">{productMode ? `Solo se corrige el nombre del producto #${productId}. Conserva su ID; las operaciones históricas capturadas mantienen sus datos y su procedencia, incluidas las referencias posteriores del legado.` : "Este cambio actualizará el nombre del atributo en todas las variantes de la familia, sin modificar sus opciones, identificadores ni existencias."}</p>
      <p className="m-0 text-xs text-slate-500">{productMode ? "Corrección descriptiva del mismo artículo físico. No utilices esta acción para cambiar una presentación de 400 ml por 200 ml ni sustituir el producto. No se guardarán otros datos." : "Solo para correcciones descriptivas: no cambies la característica representada por las opciones existentes."}</p>
      <p className="m-0 break-words text-sm">Nombre actual: <strong>{target.name}</strong></p>
      {error && <p id={errorId} ref={alertRef} tabIndex={-1} role="alert" className="m-0 break-words rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      <fieldset disabled={busy || uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <label>Nuevo nombre<input required minLength={productMode ? 2 : 1} maxLength={maxName} value={name} onChange={event => { setName(event.target.value); setConfirmed(false); }} aria-describedby={explanationId}/></label>
        <label>Motivo del cambio<textarea required minLength={8} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="min-h-20 w-full min-w-0 resize-y rounded border border-slate-300 bg-white p-2 text-ink-950"/></label>
        <p className="m-0 break-words text-sm"><strong>{target.name}</strong> → <strong>{normalizedName || "Nuevo nombre pendiente"}</strong></p>
        <label className="variant-online-control"><input className="shrink-0" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{productMode ? "Confirmo que sigue siendo el mismo artículo comercial y físico; solo corrijo su identificación descriptiva." : "Confirmo que es un cambio descriptivo y conserva el significado de las opciones."}</span></label>
      </fieldset>
      {uncertain && <div className="grid gap-2 rounded border border-slate-200 p-3 text-sm"><p className="m-0">Hay un renombrado pendiente de verificar. No cierres esta ventana ni inicies otra operación hasta consultar el resultado.</p><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" className={secondaryButtonClass} disabled={busy} onClick={submit}>Reintentar mismo renombrado</button></div></div>}
      <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy || uncertain} onClick={onClose}>Cancelar</button><button type="submit" className="product-positive-action" disabled={busy || uncertain || !confirmed}>{busy ? "Comprobando…" : "Confirmar renombrado"}</button></div>
    </form>
  </AppModal>;
}

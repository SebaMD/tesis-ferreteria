import { createId } from "../helpers/createId.js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import api, { getApiError } from "../api/httpClient.js";
import { getProductBundleRequest, getFamilyActivationEligibilityRequest } from "../services/productFamilies.service.js";
import { dangerButtonClass, secondaryButtonClass } from "../helpers/uiClasses.js";

function pending(key) {
  try { const b = JSON.parse(sessionStorage.getItem(key)); if (b?.confirmed === true && typeof b.reason === "string" && /^[a-f0-9]{64}$/.test(b.expectedRevision) && /^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)) return b; } catch { /* Never automatically replay a command. */ }
  return null;
}
export default function FamilyDeactivationDialog({ familyId, userId, onClose, onSaved, activate = false }) {
  const storageKey = activate ? `fyf-family-activation-${userId}-${familyId}` : `fyf-family-deactivation-${userId}-${familyId}`, path = `/product-families/${familyId}/${activate ? "activations" : "deactivations"}`;
  const [stored] = useState(() => pending(storageKey));
  const frozen = useRef(stored), guard = useRef(false);
  const [bundle, setBundle] = useState(null), [busy, setBusy] = useState(true), [uncertain, setUncertain] = useState(Boolean(stored));
  const [eligibility, setEligibility] = useState(null);
  const [reason, setReason] = useState(stored?.reason || ""), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([getProductBundleRequest(familyId),activate ? getFamilyActivationEligibilityRequest(familyId) : null]).then(([value,check]) => { if (active) { setBundle(value); setEligibility(check); if(activate && (!check.eligible || check.expectedRevision!==value.revision)) setError(check.reason || "La familia cambió. Cierra y revisa nuevamente."); } }).catch(e => { if (active) setError(getApiError(e)); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [familyId,activate]);
  const active = bundle?.variants.filter(p => p.status !== false) || [], inactive = bundle?.variants.filter(p => p.status === false) || [];
  const canSubmit = activate ? eligibility?.eligible && eligibility.expectedRevision===bundle?.revision : active.length>0;
  async function finish() {
    sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false);
    toast.success(activate ? "Familia activada. Los SKU previamente inactivos se conservaron sin cambios." : "Familia desactivada. Sus variantes se conservan en los productos desactivados.");
    try { await onSaved(); } catch { toast.warning("Operación confirmada. Recarga el inventario antes de continuar."); }
  }
  async function submit(event) {
    event?.preventDefault(); if (guard.current || !bundle) return;
    if (!frozen.current && (!confirmed || reason.trim().length < 8 || reason.trim().length > 500 || !canSubmit)) { setError("Confirma la familia e indica un motivo de 8 a 500 caracteres."); return; }
    guard.current = true; setBusy(true); setError("");
    try {
      if (!frozen.current) { const body = { operationKey: createId(), expectedRevision: bundle.revision, reason: reason.trim(), confirmed: true, ...(activate ? {sourceEventId:eligibility.sourceEventId} : {}) }; sessionStorage.setItem(storageKey, JSON.stringify(body)); frozen.current = body; }
      await api.post(path, frozen.current); await finish();
    } catch (e) {
      if (!e.response || e.response.status >= 500) setUncertain(Boolean(frozen.current));
      else { sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); }
      setError(getApiError(e, "No se pudo confirmar la operación. Consulta su resultado antes de reintentar."));
    } finally { guard.current = false; setBusy(false); }
  }
  async function recover() {
    if (guard.current || !frozen.current) return; guard.current = true; setBusy(true); setError("");
    try { const result = (await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;
      if (result) await finish();
      else { sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); setConfirmed(false); setError("No hay una operación confirmada. Cierra y revisa la familia antes de volver a confirmar."); }
    } catch (e) { setError(getApiError(e)); } finally { guard.current = false; setBusy(false); }
  }
  return <AppModal open title={activate ? "Activar familia" : "Desactivar familia completa"} size="medium" onClose={() => { if (!busy && !uncertain) onClose(); }}>
    <form onSubmit={submit} className="grid min-w-0 gap-3">
      {busy && !bundle && <p role="status">Consultando todas las variantes…</p>}
      {error && <p role="alert" className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      {bundle && <><strong className="break-words">Familia #{familyId} · {bundle.family.name}</strong>
        <p className="m-0 text-sm">{active.length} variantes activas y {inactive.length} previamente inactivas.</p>
        <p className="m-0 text-sm">{activate ? "Se activarán exclusivamente los SKU de la desactivación verificada. Se conservarán stock, identidad e historial. Los artículos previamente inactivos seguirán inactivos." : "Se desactivarán conjuntamente todas las variantes activas para nuevas ventas. Se conservarán sus IDs, stock, movimientos, imágenes e historial. Un compromiso comercial incompatible bloqueará toda la operación."}</p>
        <p className="m-0 break-words text-sm"><strong>{activate ? "Se activarán: " : "Se desactivarán: "}</strong>{(activate ? eligibility?.productIds || [] : active.map(p=>p.id)).map(id => `Producto #${id}`).join(", ") || "Ninguna"}</p>
        <p className="m-0 break-words text-sm"><strong>Sin cambio, ya inactivas: </strong>{(activate ? eligibility?.previouslyInactiveProductIds || [] : inactive.map(p=>p.id)).map(id => `Producto #${id}`).join(", ") || "Ninguna"}</p>
        <p className="m-0 text-xs text-slate-500">No se archiva ni elimina la familia. La activación individual continúa disponible en Editar; la masiva solo restaura una desactivación verificable sin cambios posteriores.</p>
        <fieldset disabled={busy || uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <label>{activate ? "Motivo de activación" : "Motivo de desactivación"}<textarea required minLength={8} maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setConfirmed(false); }} className="min-h-20 w-full rounded border border-slate-300 bg-white p-2" /></label>
          <label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{activate ? "Confirmo activar únicamente los SKU indicados y preservar los previamente inactivos." : "Confirmo la desactivación completa de las variantes activas de esta familia."}</label>
        </fieldset></>}
      {uncertain && <div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No inicies otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>{activate ? "Reintentar misma activación" : "Reintentar misma desactivación"}</button></div>}
      <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy || uncertain} onClick={onClose}>Cancelar</button><button type="submit" className={activate ? "product-positive-action" : dangerButtonClass} disabled={busy || uncertain || !confirmed || !canSubmit}>{activate ? "Activar familia" : "Desactivar familia completa"}</button></div>
    </form>
  </AppModal>;
}

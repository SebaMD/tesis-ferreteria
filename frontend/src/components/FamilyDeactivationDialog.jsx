import { createId } from "../helpers/createId.js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import api, { getApiError } from "../api/httpClient.js";
import { getProductBundleRequest } from "../services/productFamilies.service.js";
import { dangerButtonClass, secondaryButtonClass } from "../helpers/uiClasses.js";

function pending(key) {
  try { const b = JSON.parse(sessionStorage.getItem(key)); if (b?.confirmed === true && typeof b.reason === "string" && /^[a-f0-9]{64}$/.test(b.expectedRevision) && /^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)) return b; } catch { /* Never automatically replay a command. */ }
  return null;
}
export default function FamilyDeactivationDialog({ familyId, userId, onClose, onSaved }) {
  const storageKey = `fyf-family-deactivation-${userId}-${familyId}`, path = `/product-families/${familyId}/deactivations`;
  const [stored] = useState(() => pending(storageKey));
  const frozen = useRef(stored), guard = useRef(false);
  const [bundle, setBundle] = useState(null), [busy, setBusy] = useState(true), [uncertain, setUncertain] = useState(Boolean(stored));
  const [reason, setReason] = useState(stored?.reason || ""), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; getProductBundleRequest(familyId).then(value => { if (active) setBundle(value); }).catch(e => { if (active) setError(getApiError(e)); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [familyId]);
  const active = bundle?.variants.filter(p => p.status !== false) || [], inactive = bundle?.variants.filter(p => p.status === false) || [];
  async function finish() {
    sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false);
    toast.success("Familia desactivada. Sus variantes se conservan en los productos desactivados.");
    try { await onSaved(); } catch { toast.warning("Desactivación confirmada. Recarga el inventario antes de continuar."); }
  }
  async function submit(event) {
    event?.preventDefault(); if (guard.current || !bundle) return;
    if (!frozen.current && (!confirmed || reason.trim().length < 8 || reason.trim().length > 500 || !active.length)) { setError("Confirma la familia e indica un motivo de 8 a 500 caracteres."); return; }
    guard.current = true; setBusy(true); setError("");
    try {
      if (!frozen.current) { const body = { operationKey: createId(), expectedRevision: bundle.revision, reason: reason.trim(), confirmed: true }; sessionStorage.setItem(storageKey, JSON.stringify(body)); frozen.current = body; }
      await api.post(path, frozen.current); await finish();
    } catch (e) {
      if (!e.response || e.response.status >= 500) setUncertain(Boolean(frozen.current));
      else { sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); }
      setError(getApiError(e, "No se pudo confirmar la desactivación. Consulta su resultado antes de reintentar."));
    } finally { guard.current = false; setBusy(false); }
  }
  async function recover() {
    if (guard.current || !frozen.current) return; guard.current = true; setBusy(true); setError("");
    try { const result = (await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;
      if (result) await finish();
      else { sessionStorage.removeItem(storageKey); frozen.current = null; setUncertain(false); setConfirmed(false); setError("No hay una desactivación confirmada. Cierra y revisa la familia antes de volver a confirmar."); }
    } catch (e) { setError(getApiError(e)); } finally { guard.current = false; setBusy(false); }
  }
  return <AppModal open title="Desactivar familia completa" size="medium" onClose={() => { if (!busy && !uncertain) onClose(); }}>
    <form onSubmit={submit} className="grid min-w-0 gap-3">
      {busy && !bundle && <p role="status">Consultando todas las variantes…</p>}
      {error && <p role="alert" className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      {bundle && <><strong className="break-words">Familia #{familyId} · {bundle.family.name}</strong>
        <p className="m-0 text-sm">{active.length} variantes activas y {inactive.length} previamente inactivas.</p>
        <p className="m-0 text-sm">Se desactivarán conjuntamente todas las variantes activas para nuevas ventas. Se conservarán sus IDs, stock, movimientos, imágenes e historial. Un compromiso comercial incompatible bloqueará toda la operación.</p>
        <p className="m-0 break-words text-sm"><strong>Se desactivarán: </strong>{active.map(p => `Producto #${p.id}`).join(", ") || "Ninguna"}</p>
        {inactive.length > 0 && <p className="m-0 break-words text-sm"><strong>Sin cambio, ya inactivas: </strong>{inactive.map(p => `Producto #${p.id}`).join(", ")}</p>}
        <p className="m-0 text-xs text-slate-500">No se archiva ni elimina la familia. La reactivación se realiza por SKU dentro del editor; no se activarán automáticamente artículos previamente inactivos.</p>
        <fieldset disabled={busy || uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <label>Motivo de desactivación<textarea required minLength={8} maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setConfirmed(false); }} className="min-h-20 w-full rounded border border-slate-300 bg-white p-2" /></label>
          <label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo la desactivación completa de las variantes activas de esta familia.</label>
        </fieldset></>}
      {uncertain && <div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No inicies otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar misma desactivación</button></div>}
      <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy || uncertain} onClick={onClose}>Cancelar</button><button type="submit" className={dangerButtonClass} disabled={busy || uncertain || !confirmed || !active.length}>Desactivar familia completa</button></div>
    </form>
  </AppModal>;
}

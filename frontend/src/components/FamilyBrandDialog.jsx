import {useRef,useState} from "react";
import {toast} from "sonner";
import AppModal from "./AppModal.jsx";
import api,{getApiError} from "../api/httpClient.js";
import {brandCorrectionKey,pendingBrandCorrection} from "../helpers/familyBrand.js";
import {secondaryButtonClass} from "../helpers/uiClasses.js";

export default function FamilyBrandDialog({draft,userId,onClose,onSaved,onConflict}){
 const stored=pendingBrandCorrection(userId,draft.familyId);
 const [brand,setBrand]=useState(stored?.brand||draft.brand||""),[reason,setReason]=useState(stored?.reason||""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(Boolean(stored)),[error,setError]=useState("");
 const frozen=useRef(stored),guard=useRef(false),alert=useRef(null);
 const key=brandCorrectionKey(userId,draft.familyId),path=`/product-families/${draft.familyId}/brand-corrections`;
 function report(e){const message=getApiError(e,e.message||"No se pudo confirmar la corrección");setError(message);toast.error(<span aria-hidden="true">{message}</span>,{id:key});requestAnimationFrame(()=>{alert.current?.focus();alert.current?.scrollIntoView({block:"center"});});}
 async function finish(result){sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);try{await onSaved(result);}catch{onConflict();toast.warning("Corrección confirmada. Recarga el editor antes de guardar otros datos.");}toast.success("Marca corregida en la familia y todos sus artículos.");}
 async function submit(event){event?.preventDefault();event?.stopPropagation();if(guard.current)return;
  const clean=brand.trim().replace(/\s+/g," ");
  if(!frozen.current&&(!confirmed||!clean||clean.length>100||[...brand].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||clean.toLocaleLowerCase("es")===(draft.brand||"").trim().replace(/\s+/g," ").toLocaleLowerCase("es")||reason.trim().length<8||reason.trim().length>500)){report(new Error("Indica una marca corregida distinta, motivo de 8–500 caracteres y confirma el mismo fabricante"));return;}
  guard.current=true;setBusy(true);setError("");
  try{if(!frozen.current){const body={brand:clean,reason:reason.trim(),expectedRevision:draft.revision,operationKey:crypto.randomUUID(),confirmed:true};sessionStorage.setItem(key,JSON.stringify(body));frozen.current=body;}await finish((await api.post(path,frozen.current)).data.data);}
  catch(e){if(frozen.current&&(!e.response||e.response.status>=500))setUncertain(true);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);}if(e.response?.status===409)onConflict();report(e);}finally{guard.current=false;setBusy(false);}}
 async function recover(){if(guard.current||!frozen.current)return;guard.current=true;setBusy(true);try{const result=(await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;if(result)await finish(result);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);setConfirmed(false);report(new Error("No hay una corrección confirmada. Revisa antes de volver a confirmar."));}}catch(e){report(e);}finally{guard.current=false;setBusy(false);}}
 return <AppModal open initialFocusSelector="fieldset input" title="Corregir marca" size="medium" onClose={()=>{if(!busy&&!uncertain)onClose();}}>
  <form className="grid min-w-0 gap-3" onSubmit={submit}>
   <strong className="break-words">{draft.name}</strong>
   <p className="m-0 break-words text-sm">Marca actual: <strong>{draft.brand||"Sin marca registrada"}</strong> · {draft.rows.length} variantes, incluidas las inactivas.</p>
   <p className="m-0 text-sm">Corrige únicamente la denominación de la misma marca y fabricante comercial. No sirve para sustituir físicamente los artículos. Se conservan IDs, existencias y capturas históricas.</p>
   {error&&<p ref={alert} role="alert" tabIndex={-1} className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
   <fieldset disabled={busy||uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
    <label>Nueva marca<input required maxLength={100} value={brand} onChange={e=>{setBrand(e.target.value);setConfirmed(false);}} autoComplete="off"/></label>
    <label>Motivo de la corrección<textarea required minLength={8} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}} className="min-h-20 w-full rounded border border-slate-300 bg-white p-2"/></label>
    <p className="m-0 break-words text-sm">Cambio: {draft.brand||"Sin marca registrada"} → <strong>{brand||"Indica la corrección"}</strong></p>
    <label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que es la misma marca y fabricante, no otro producto físico.</label>
   </fieldset>
   {uncertain&&<div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No inicies otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar misma corrección</button></div>}
   <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy||uncertain} onClick={onClose}>Cancelar</button><button type="submit" className="product-positive-action" disabled={busy||uncertain||!confirmed}>Confirmar corrección</button></div>
  </form>
 </AppModal>;
}

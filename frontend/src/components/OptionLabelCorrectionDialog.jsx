import { createId } from "../helpers/createId.js";
import {useRef,useState} from "react";
import {toast} from "sonner";
import AppModal from "./AppModal.jsx";
import api,{getApiError} from "../api/httpClient.js";
import {optionLabelStorageKey,pendingOptionLabel} from "../helpers/optionLabelCorrection.js";
import {secondaryButtonClass} from "../helpers/uiClasses.js";

export default function OptionLabelCorrectionDialog({draft,target,userId,onClose,onSaved,onConflict}){
 const stored=pendingOptionLabel(userId,draft.familyId);
 const [label,setLabel]=useState(stored?.command.label||target.label),[reason,setReason]=useState(stored?.command.reason||""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(Boolean(stored)),[error,setError]=useState("");
 const frozen=useRef(stored?.command||null),guard=useRef(false),alert=useRef(null);
 const key=optionLabelStorageKey(userId,draft.familyId),path=`/product-families/${draft.familyId}/attributes/${target.attributeId}/options/${target.optionId}/label-corrections`;
 const attributeIndex=draft.attributes.findIndex(a=>a.id===target.attributeId),option=draft.attributes[attributeIndex]?.draftOptions.find(o=>o.id===target.optionId);
 const affected=option?draft.rows.filter(row=>row.id&&row.selections[attributeIndex]===option.key):[];
 function report(e){const message=getApiError(e,e.message||"No se pudo confirmar la etiqueta");setError(message);toast.error(<span aria-hidden="true">{message}</span>,{id:key});requestAnimationFrame(()=>{alert.current?.focus();alert.current?.scrollIntoView({block:"center"});});}
 async function finish(result){sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);try{await onSaved(result);}catch{onConflict();toast.warning("Corrección confirmada. Recarga antes de guardar otros datos.");}toast.success("Etiqueta corregida. Opciones, productos e historial conservados.");}
 async function submit(event){event?.preventDefault();event?.stopPropagation();if(guard.current)return;
  const clean=label.trim().replace(/\s+/g," ");
  if(!frozen.current&&(!confirmed||!clean||clean.length>100||[...label].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||clean.toLocaleLowerCase("es")===target.label.trim().replace(/\s+/g," ").toLocaleLowerCase("es")||reason.trim().length<8||reason.trim().length>500)){report(new Error("Indica otra etiqueta descriptiva, motivo de 8–500 caracteres y confirma la misma opción física"));return;}
  guard.current=true;setBusy(true);setError("");
  try{if(!frozen.current){const command={label:clean,reason:reason.trim(),expectedRevision:draft.revision,operationKey:createId(),confirmed:true};sessionStorage.setItem(key,JSON.stringify({target,command}));frozen.current=command;}await finish((await api.post(path,frozen.current)).data.data);}
  catch(e){if(frozen.current&&(!e.response||e.response.status>=500))setUncertain(true);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);}if(e.response?.status===409)onConflict();report(e);}finally{guard.current=false;setBusy(false);}}
 async function recover(){if(guard.current||!frozen.current)return;guard.current=true;setBusy(true);try{const result=(await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;if(result)await finish(result);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);setConfirmed(false);report(new Error("No hay una corrección confirmada. Revisa antes de volver a confirmar."));}}catch(e){report(e);}finally{guard.current=false;setBusy(false);}}
 return <AppModal open initialFocusSelector="fieldset input" title="Corregir etiqueta de opción" size="medium" onClose={()=>{if(!busy&&!uncertain)onClose();}}>
  <form className="grid min-w-0 gap-3" onSubmit={submit}>
   <strong className="wrap-break-word">{draft.name} · {target.attributeName}</strong>
   <p className="m-0 wrap-break-word text-sm">Etiqueta actual: <strong>{target.label}</strong> · {affected.length} variantes afectadas, incluidas las inactivas.</p>
   <ul className="m-0 grid max-h-40 gap-1 overflow-y-auto pl-5 text-sm">{affected.map(row=><li className="wrap-break-word" key={row.id}>#{row.id} · {row.name} · {row.status?"Activa":"Inactiva"}</li>)}</ul>
   {!affected.length&&<p className="m-0 text-sm">Esta opción no está asignada actualmente a artículos.</p>}
   <p className="m-0 text-sm">Corrige solo ortografía o formato de la misma opción física, para todos sus artículos. No cambia 400 ml por 200 ml ni un color por otro. Se conservan IDs, combinaciones, existencias y capturas anteriores.</p>
   {error&&<p ref={alert} role="alert" tabIndex={-1} className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
   <fieldset disabled={busy||uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
    <label>Nueva etiqueta<input required maxLength={100} value={label} onChange={e=>{setLabel(e.target.value);setConfirmed(false);}} autoComplete="off"/></label>
    <label>Motivo de la corrección<textarea required minLength={8} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}} className="min-h-20 w-full rounded border border-slate-300 bg-white p-2"/></label>
    <p className="m-0 wrap-break-word text-sm">Cambio: {target.label} → <strong>{label||"Indica la corrección"}</strong></p>
    <label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que corrige el texto sin cambiar el significado físico de la opción.</label>
   </fieldset>
   {uncertain&&<div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No inicies otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar misma corrección</button></div>}
   <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy||uncertain} onClick={onClose}>Cancelar</button><button type="submit" className="product-positive-action" disabled={busy||uncertain||!confirmed}>Confirmar corrección</button></div>
  </form>
 </AppModal>;
}

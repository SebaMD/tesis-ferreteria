import { useRef, useState } from "react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import { ProductCategoryField } from "./ProductFormFields.jsx";
import api from "../api/httpClient.js";
import { getApiError } from "../api/httpClient.js";
import { secondaryButtonClass } from "../helpers/uiClasses.js";

import { categoryChangeKey, pendingCategoryChange } from "../helpers/familyCategory.js";
export default function FamilyCategoryDialog({draft,categories,userId,onClose,onSaved,onConflict}){
  const saved=pendingCategoryChange(userId,draft.familyId);
  const [categoryId,setCategoryId]=useState(saved?.categoryId||draft.categoryId),[reason,setReason]=useState(saved?.reason||""),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(Boolean(saved)),[error,setError]=useState("");
  const frozen=useRef(saved),guard=useRef(false),alert=useRef(null);
  const key=categoryChangeKey(userId,draft.familyId),path=`/product-families/${draft.familyId}/category-changes`;
  function report(e){const message=getApiError(e,e.message||"No se pudo confirmar el cambio");setError(message);toast.error(<span aria-hidden="true">{message}</span>,{id:key});requestAnimationFrame(()=>{alert.current?.focus();alert.current?.scrollIntoView({block:"center"});});}
  async function finish(result){sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);try{await onSaved(result);}catch{onConflict();toast.warning("Cambio confirmado. Recarga el editor antes de guardar otros datos.");}toast.success("Familia y todas sus variantes reclasificadas.");}
  async function submit(event){event?.preventDefault();event?.stopPropagation();if(guard.current)return;
    if(!frozen.current&&(!confirmed||Number(categoryId)===Number(draft.categoryId)||reason.trim().length<8)){report(new Error("Selecciona otra categoría, indica el motivo y confirma el cambio"));return;}
    guard.current=true;setBusy(true);setError("");
    try{if(!frozen.current){const body={categoryId:Number(categoryId),reason:reason.trim(),expectedRevision:draft.revision,operationKey:crypto.randomUUID(),confirmed:true};sessionStorage.setItem(key,JSON.stringify(body));frozen.current=body;}await finish((await api.post(path,frozen.current)).data.data);}
    catch(e){if(frozen.current&&(!e.response||e.response.status>=500))setUncertain(true);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);}if(e.response?.status===409)onConflict();report(e);}finally{guard.current=false;setBusy(false);}}
  async function recover(){if(guard.current||!frozen.current)return;guard.current=true;setBusy(true);try{const r=(await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;if(r)await finish(r);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);setConfirmed(false);report(new Error("No hay un cambio confirmado. Revisa antes de volver a confirmar."));}}catch(e){report(e);}finally{guard.current=false;setBusy(false);}}
  return <AppModal open title="Cambiar categoría" size="medium" onClose={()=>{if(!busy&&!uncertain)onClose();}}>
    <form className="grid min-w-0 gap-3" onSubmit={submit}>
      <strong className="break-words">{draft.name}</strong><p className="m-0 text-sm">Categoría actual: {categories.find(c=>Number(c.id)===Number(draft.categoryId))?.name||`#${draft.categoryId}`} · {draft.rows.length} variantes, incluidas las inactivas.</p>
      <p className="m-0 text-sm">La nueva categoría se aplicará a todas las variantes. Se conservarán sus identificadores, existencias y operaciones anteriores. La clasificación vigente puede afectar promociones y reportes del catálogo actual.</p>
      {error&&<p role="alert" tabIndex={-1} ref={alert} className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
      <fieldset disabled={busy||uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0"><ProductCategoryField label="Categoría destino" categories={categories} value={categoryId} onChange={v=>{setCategoryId(v);setConfirmed(false);}}/><label>Motivo<textarea required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className="min-h-20 w-full rounded border border-slate-300 bg-white p-2"/></label><p className="m-0 break-words text-sm">Destino: <strong>{categories.find(c=>Number(c.id)===Number(categoryId))?.name||"Selecciona categoría"}</strong></p><label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo la reclasificación conjunta de todos los artículos.</label></fieldset>
      {uncertain&&<div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No inicies otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar mismo cambio</button></div>}
      <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy||uncertain} onClick={onClose}>Cancelar</button><button className="product-positive-action" type="submit" disabled={busy||uncertain||!confirmed}>Confirmar cambio</button></div>
    </form>
  </AppModal>;
}

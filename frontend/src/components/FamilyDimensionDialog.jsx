import {useEffect,useId,useRef,useState} from "react";
import {toast} from "sonner";
import AppModal from "./AppModal.jsx";
import api,{getApiError} from "../api/httpClient.js";
import {dimensionStorageKey,pendingDimension,dimensionDraft} from "../helpers/familyDimension.js";
import {bundleRowLabels} from "../helpers/productBundleForm.js";
import {secondaryButtonClass} from "../helpers/uiClasses.js";

export default function FamilyDimensionDialog({draft,userId,onClose,onSaved,onConflict,inline=false,onReviewChange,onBusyChange}){
 const stored=pendingDimension(userId,draft.familyId);
 const [name,setName]=useState(stored?.name||""),[optionsText,setOptionsText]=useState(stored?.options.join("\n")||""),[reason,setReason]=useState(stored?.reason||"");
 const [selections,setSelections]=useState(()=>Object.fromEntries((stored?.assignments||[]).map(a=>[a.productId,String(a.optionIndex)])));
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(Boolean(stored)),[error,setError]=useState("");
 const guard=useRef(false),frozen=useRef(stored),alert=useRef(null);
 const form=useRef(null),reviewTrigger=useRef(null);
 const errorId=useId();
 const [review,setReview]=useState(false);
 useEffect(()=>{if(!inline)return undefined;const frame=requestAnimationFrame(()=>{const control=form.current?.querySelector('input:not(:disabled),button:not(:disabled)');control?.scrollIntoView({block:'center'});control?.focus();});return()=>cancelAnimationFrame(frame);},[inline]);
 useEffect(()=>{onReviewChange?.(review);return()=>onReviewChange?.(false);},[review,onReviewChange]);
 useEffect(()=>{onBusyChange?.(busy||uncertain);return()=>onBusyChange?.(false);},[busy,uncertain,onBusyChange]);
 const key=dimensionStorageKey(userId,draft.familyId),path=`/product-families/${draft.familyId}/dimension-additions`;
 const config=dimensionDraft(name,optionsText,selections,draft.rows);
 const duplicateName=draft.attributes.some(a=>a.name.trim().replace(/\s+/g," ").toLocaleLowerCase("es")===config.name.toLocaleLowerCase("es"));
 function back(){setReview(false);requestAnimationFrame(()=>requestAnimationFrame(()=>reviewTrigger.current?.focus()));}
 function prepare(event){event.preventDefault();event.stopPropagation();setError("");if(!config.valid||duplicateName||reason.trim().length<8||reason.trim().length>500){report(new Error(duplicateName?"Ya existe un atributo con ese nombre":"Completa el atributo, sus opciones, todas las asignaciones y un motivo de 8 a 500 caracteres"));const invalid=form.current?.querySelector(duplicateName?'input[name="dimensionName"]':'input:invalid,textarea:invalid,select:invalid');if(invalid){invalid.closest('details')?.setAttribute('open','');requestAnimationFrame(()=>requestAnimationFrame(()=>{invalid.scrollIntoView({block:'center'});invalid.focus();}));}return;}setConfirmed(false);setReview(true);}
 function report(e){const message=getApiError(e,e.message||"No se pudo confirmar la ampliación");setError(message);toast.error(<span aria-hidden="true">{message}</span>,{id:key});requestAnimationFrame(()=>requestAnimationFrame(()=>{alert.current?.focus();alert.current?.scrollIntoView({block:"center"});}));}
 async function finish(result){sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);try{await onSaved(result);}catch{onConflict();toast.warning("Ampliación confirmada. Recarga antes de guardar otros cambios.");}toast.success("Atributo incorporado. Artículos e historial conservados.");}
 async function submit(event){event?.preventDefault();event?.stopPropagation();if(guard.current)return;
  if(!frozen.current&&(!config.valid||duplicateName||!confirmed||reason.trim().length<8||reason.trim().length>500)){report(new Error("Completa el atributo, todas las asignaciones y el motivo antes de confirmar"));return;}
  guard.current=true;setBusy(true);setError("");try{
   if(!frozen.current){const body={name:config.name,options:config.options,assignments:config.assignments,reason:reason.trim(),confirmed:true,expectedRevision:draft.revision,operationKey:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(body));frozen.current=body;}
   await finish((await api.post(path,frozen.current)).data.data);
  }catch(e){if(frozen.current&&(!e.response||e.response.status>=500))setUncertain(true);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);}setReview(false);if(e.response?.status===409)onConflict();report(e);}finally{guard.current=false;setBusy(false);}}
 async function recover(){if(guard.current||!frozen.current)return;guard.current=true;setBusy(true);try{const result=(await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;if(result)await finish(result);else{sessionStorage.removeItem(key);frozen.current=null;setUncertain(false);setConfirmed(false);report(new Error("No hay una ampliación confirmada. Revisa todas las asignaciones antes de reintentar."));}}catch(e){report(e);}finally{guard.current=false;setBusy(false);}}
 const area="min-h-20 w-full min-w-0 rounded border border-slate-300 bg-white p-2";
 const combination=row=>bundleRowLabels(draft,row).map((v,i)=>`${draft.attributes[i].name}: ${v}`).join(" · ");
 const content=<>
  <form ref={form} noValidate className="grid min-w-0 gap-3" onSubmit={inline?prepare:submit}>
   <strong className="break-words">{draft.name}</strong><p className="m-0 text-sm">Se ampliará la clasificación vigente de {draft.rows.length} artículos, incluidos los inactivos. Se conservarán IDs, existencias y capturas históricas. No se crearán combinaciones ni productos automáticamente.</p>
   {error&&<p id={errorId} ref={alert} role="alert" tabIndex={-1} className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
   <fieldset disabled={busy||uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
    <details open className="min-w-0"><summary className="cursor-pointer py-2 text-base font-bold">Atributos · nueva dimensión</summary><div className="grid min-w-0 gap-3">
    {inline&&draft.attributes.map(a=><div key={a.id} className="rounded border border-slate-200 p-3 text-sm"><strong>{a.name}</strong><p className="m-0 break-words text-xs text-slate-500">{a.draftOptions.map(o=>o.label).join(" · ")}</p></div>)}
    <section className="grid min-w-0 gap-3 rounded-lg border border-rust-500 p-3"><label>Nombre del nuevo atributo<input name="dimensionName" required maxLength={60} value={name} onChange={e=>{setName(e.target.value);setConfirmed(false);}} placeholder="Ej.: Color"/></label>
    <label>Opciones, una por línea<textarea className={area} required value={optionsText} onChange={e=>{setOptionsText(e.target.value);setSelections({});setConfirmed(false);}} placeholder={"Negro\nAzul"}/></label>
    <p className="m-0 text-xs text-slate-500">Asigna una opción a cada artículo. Cambiar la lista de opciones borra únicamente estas asignaciones nuevas para evitar desplazarlas por error.</p>
    </section>
    </div></details>
    <details open className="min-w-0"><summary className="cursor-pointer py-2 text-base font-bold">Variantes ({draft.rows.length}) · asignación del nuevo atributo</summary><div className="grid min-w-0 gap-3">
    {draft.rows.map(row=>{const old=bundleRowLabels(draft,row).map((v,i)=>`${draft.attributes[i].name}: ${v}`).join(" · ");const option=config.options[Number(selections[row.id])];return <section key={row.id} className="grid min-w-0 gap-2 rounded border border-slate-200 p-3">
     <strong className="break-words text-sm">Producto #{row.id} · {row.name} · {row.status?"Activo":"Inactivo"}</strong><p className="m-0 break-words text-xs">Antes: {old}</p>
     <label>Asignar {config.name||"nuevo atributo"} a producto #{row.id}<select required aria-invalid={error&&(selections[row.id]===undefined||selections[row.id]==="")?true:undefined} aria-describedby={error&&(selections[row.id]===undefined||selections[row.id]==="")?errorId:undefined} value={selections[row.id]??""} onChange={e=>{setSelections(v=>({...v,[row.id]:e.target.value}));setConfirmed(false);}}><option value="">Selecciona explícitamente una opción</option>{config.options.map((o,i)=><option key={`${i}-${o}`} value={i}>{o}</option>)}</select></label>
     <p className="m-0 break-words text-xs">Después: {old} · {config.name||"Nuevo atributo"}: {selections[row.id]!==undefined&&selections[row.id]!==""&&option?option:"Pendiente de asignar"}</p>
    </section>;})}
    </div></details>
    <label>Motivo de la ampliación<textarea className={area} required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {!inline&&<label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo la vista previa y la asignación explícita a todos los artículos del mismo producto comercial.</label>}
   </fieldset>
   {uncertain&&<div className="grid gap-2"><p className="m-0 text-sm">Resultado pendiente de verificar. No crees otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar misma ampliación</button></div>}
   <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy||uncertain} onClick={onClose}>Cancelar nueva dimensión</button><button ref={reviewTrigger} type="submit" className="product-positive-action" disabled={busy||uncertain||(!inline&&(!confirmed||!config.valid))}>{inline?"Revisar nueva dimensión":"Confirmar incorporación"}</button></div>
  </form>
  {inline&&<AppModal open={review} title="Confirmar nueva dimensión" size="large" onClose={()=>{if(!busy)back();}}>
   <div className="grid min-w-0 gap-3"><p className="m-0 break-words"><strong>{draft.name}</strong> · {config.name}</p>
    <p className="m-0 text-sm">Solo se incorporará esta dimensión. Precios, stock, imágenes y nombres no se guardan en esta operación.</p>
    {draft.rows.map(row=><section key={row.id} className="grid min-w-0 gap-1 rounded border border-slate-200 p-3 text-sm"><strong className="break-words">#{row.id} · {row.name} · {row.status?"Activo":"Inactivo"}</strong><span className="break-words">Antes: {combination(row)}</span><span className="break-words">Después: {combination(row)} · {config.name}: {config.options[Number(selections[row.id])]}</span></section>)}
    <p className="m-0 break-words whitespace-pre-wrap text-sm">Motivo: {reason}</p>
    <label className="variant-online-control"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/>Confirmo las asignaciones y que se conserva la identidad física de los artículos.</label>
    <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={back}>Volver a revisar</button><button type="button" className="product-positive-action" disabled={busy||!confirmed} onClick={submit}>{busy?"Guardando…":"Confirmar incorporación"}</button></div>
   </div>
  </AppModal>}
 </>;
 return inline?content:<AppModal open title="Agregar atributo a la familia" size="large" onClose={()=>{if(!busy&&!uncertain)onClose();}}>{content}</AppModal>;
}

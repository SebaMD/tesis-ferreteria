import { createId } from "../helpers/createId.js";
import {useEffect,useRef,useState} from "react";
import {toast} from "sonner";
import api,{getApiError} from "../api/httpClient.js";
import useAuth from "../hooks/useAuth.js";
import AppModal from "./AppModal.jsx";
import AuditedValueControl from "./AuditedValueControl.jsx";
import {ProductCategoryField} from "./ProductFormFields.jsx";
import {secondaryButtonClass} from "../helpers/uiClasses.js";
import {classificationStorageKey,pendingProductClassification} from "../helpers/productClassification.js";

export default function ProductClassificationAction({field,product,categories,dirty,busy,onSaved,onOpenChange}){
 const {user}=useAuth(),isBrand=field==="brand",key=classificationStorageKey(user.id,product.id,field);
 const read=()=>pendingProductClassification(key,field);
 const [stored]=useState(read),[open,setOpen]=useState(Boolean(stored));const trigger=useRef(null);
 useEffect(()=>{if(open)onOpenChange(true);return()=>{if(open)onOpenChange(false);};},[open,onOpenChange]);
 const label=isBrand?"Marca":"Categoría",current=isBrand?product.brand:product.categoryId;
 const display=value=>isBrand?(value||"Sin marca registrada"):(categories.find(c=>c.id===Number(value))?.name||`Categoría #${value}`);
 const close=()=>{setOpen(false);requestAnimationFrame(()=>requestAnimationFrame(()=>trigger.current?.focus()));};
 return <><AuditedValueControl label={label} value={display(current)} action={`Corregir ${label.toLowerCase()}`} buttonRef={trigger} disabled={busy||user.role!=="ADMIN"}
 help={dirty?"Guarda o descarta los cambios pendientes antes de corregir este dato.":"Corrección administrativa independiente; conserva el ID y las capturas históricas."}
 onClick={()=>{if(dirty){toast.warning("Guarda o descarta el borrador antes de la corrección. No se perderán tus datos.");return;}setOpen(true);}}/>
 {open&&<ClassificationDialog field={field} product={product} categories={categories} stored={read()} storageKey={key} onClose={close} onSaved={async r=>{await onSaved(r);close();}}/>}</>;
}
function ClassificationDialog({field,product,categories,stored,storageKey,onClose,onSaved}){
 const isBrand=field==="brand",[value,setValue]=useState(stored?.value??(isBrand?product.brand||"":product.categoryId)),[reason,setReason]=useState(stored?.reason||""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(Boolean(stored)),[error,setError]=useState("");
 const frozen=useRef(stored),guard=useRef(false),alert=useRef(null),path=`/products/${product.id}/classification-corrections`;
 const display=v=>isBrand?(v||"Sin marca registrada"):(categories.find(c=>c.id===Number(v))?.name||`Categoría #${v}`);
 function report(e){const message=getApiError(e,e.message||"No se pudo confirmar la corrección");setError(message);toast.error(<span aria-hidden="true">{message}</span>,{id:storageKey});requestAnimationFrame(()=>alert.current?.focus());}
 async function finish(result){sessionStorage.removeItem(storageKey);frozen.current=null;setUncertain(false);try{await onSaved(result);toast.success("Corrección administrativa confirmada.");}catch{setError("Corrección confirmada. Cierra y recarga el editor antes de guardar otros datos.");}}
 async function submit(event){event?.preventDefault();event?.stopPropagation();if(guard.current)return;
  const next=isBrand?String(value).trim().replace(/\s+/g," "):Number(value),previous=isBrand?product.brand:product.categoryId;
  if(!frozen.current&&(!confirmed||reason.trim().length<8||reason.trim().length>500||(isBrand?(!next||next.length>100||[...String(value)].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||next.toLocaleLowerCase("es")===(previous||"").trim().replace(/\s+/g," ").toLocaleLowerCase("es")):(!categories.some(c=>c.id===next)||next===previous)))){report(new Error("Indica un valor diferente válido, motivo de 8–500 caracteres y confirma el mismo artículo."));return;}
  guard.current=true;setBusy(true);setError("");try{
   if(!frozen.current){const body={field,value:next,previousValue:previous,reason:reason.trim(),expectedRevision:product.updatedAt,operationKey:createId(),confirmed:true};sessionStorage.setItem(storageKey,JSON.stringify(body));frozen.current=body;}
   await finish((await api.post(path,frozen.current)).data.data);
  }catch(e){if(frozen.current&&(!e.response||e.response.status>=500))setUncertain(true);else{sessionStorage.removeItem(storageKey);frozen.current=null;setUncertain(false);}report(e);}finally{guard.current=false;setBusy(false);}
 }
 async function recover(){if(guard.current||!frozen.current)return;guard.current=true;setBusy(true);try{const r=(await api.get(`${path}/${encodeURIComponent(frozen.current.operationKey)}`)).data.data;if(r)await finish(r);else{sessionStorage.removeItem(storageKey);frozen.current=null;setUncertain(false);setConfirmed(false);setError("No hay una corrección confirmada. Revisa el producto antes de volver a confirmar.");}}catch(e){report(e);}finally{guard.current=false;setBusy(false);}}
 return <AppModal open initialFocusSelector="fieldset input" title={`Corregir ${isBrand?"marca":"categoría"} de producto simple`} onClose={()=>{if(!busy&&!uncertain)onClose();}}>
 <form onSubmit={submit} className="grid min-w-0 gap-3"><strong className="wrap-break-word">Producto #{product.id} · {product.name}</strong>
 <p className="m-0 text-sm">Actual: <strong>{display(isBrand?product.brand:product.categoryId)}</strong></p>
 <p className="m-0 text-sm">{isBrand?"Solo corrige la denominación del mismo fabricante, no lo sustituye por otro.":"Reclasifica el mismo artículo. La categoría vigente puede afectar promociones y reportes actuales."} Se conservan ID, existencias y operaciones históricas capturadas, incluida la procedencia del legado.</p>
 {error&&<p role="alert" tabIndex={-1} ref={alert} className="rounded border border-critical-600 bg-critical-50 p-3 text-sm text-critical-600">{error}</p>}
 <fieldset disabled={busy||uncertain} className="m-0 grid min-w-0 gap-3 border-0 p-0">
 {isBrand?<label>Nueva marca<input required maxLength={100} value={value} onChange={e=>{setValue(e.target.value);setConfirmed(false);}}/></label>:<ProductCategoryField categories={categories} value={value} onChange={v=>{setValue(v);setConfirmed(false);}}/>}
 <label>Motivo<textarea className="min-h-24 w-full min-w-0 resize-y rounded border border-slate-300 bg-white p-3" required minLength={8} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label>
 <p className="m-0 wrap-break-word text-sm">Propuesto: <strong>{display(value)}</strong></p>
 <label className="variant-online-control"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que es una corrección de datos del mismo artículo físico, sin cambiar unidades ni cantidades.</label></fieldset>
 {uncertain&&<div className="grid gap-2"><p role="status">Resultado incierto: consulta antes de iniciar otra operación.</p><button type="button" disabled={busy} onClick={recover}>Consultar resultado</button><button type="button" disabled={busy} onClick={submit}>Reintentar misma corrección</button></div>}
 <div className="variant-editor-actions"><button type="button" className={secondaryButtonClass} disabled={busy||uncertain} onClick={onClose}>Cancelar</button><button type="submit" className="product-positive-action" disabled={busy||uncertain||!confirmed}>Confirmar corrección</button></div></form></AppModal>;
}

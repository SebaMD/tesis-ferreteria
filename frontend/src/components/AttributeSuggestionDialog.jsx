import {useState} from "react";
import {Check} from "lucide-react";
import AppModal from "./AppModal.jsx";
import {ATTRIBUTE_SUGGESTIONS,normalizedAttribute,selectedAttributeNames} from "../helpers/attributeSuggestions.js";
export default function AttributeSuggestionDialog({existing,limit,audited=false,onClose,onConfirm}) {
 const [selected,setSelected]=useState([]),[other,setOther]=useState(false),[custom,setCustom]=useState("");
 const result=selectedAttributeNames(selected,other,custom,existing,limit);
 const toggle=name=>setSelected(old=>old.includes(name)?old.filter(n=>n!==name):limit===1?[name]:[...old,name]);
 return <AppModal open title="Elegir atributos" size="small" onClose={onClose}><div className="grid min-w-0 gap-3">
  <p className="m-0 text-sm">{audited?"Esta familia admite una dimensión por operación auditada. Después podrás agregar otra.":"Elige nombres de atributos. Sus opciones se completan en cada variante (máximo ocho atributos)."}</p>
  <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Atributos frecuentes">
   {ATTRIBUTE_SUGGESTIONS.map(name=>{const active=selected.includes(name),exists=existing.some(n=>normalizedAttribute(n)===normalizedAttribute(name));return <button type="button" key={name} aria-pressed={active} disabled={exists} className={`m-0! flex min-h-10 items-center gap-1 rounded-full! border px-3 text-sm ${active?"border-rust-600 bg-rust-100 text-rust-800":"border-slate-300 bg-white"}`} onClick={()=>{toggle(name);if(limit===1)setOther(false);}}>{active&&<Check size={15} aria-hidden="true"/>}{name}{exists?" · ya existe":""}</button>;})}
   <button type="button" aria-pressed={other} className={`m-0! min-h-10 rounded-full! border px-3 text-sm ${other?"border-rust-600 bg-rust-100 text-rust-800":"border-slate-300 bg-white"}`} onClick={()=>{setOther(v=>!v);if(limit===1)setSelected([]);}}>{other?"✓ ":""}Otro</button>
  </div>
  {other&&<label>Nombre personalizado (puedes completarlo en el editor)<input maxLength={60} value={custom} onChange={e=>setCustom(e.target.value)}/></label>}
  {!result.valid&&(selected.length>0||other)&&<p role="status" className="m-0 text-sm text-critical-600">Revisa nombres repetidos o el máximo de atributos.</p>}
  <div className="variant-editor-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="product-positive-action" disabled={!result.valid} onClick={()=>onConfirm(result.names)}>Agregar al editor</button></div>
 </div></AppModal>;
}

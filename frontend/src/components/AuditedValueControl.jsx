import {useId} from "react";
import {Pencil} from "lucide-react";

export default function AuditedValueControl({label,value,action,disabled,onClick,help,buttonRef,...props}){
 const id=useId();
 return <div className="grid min-w-0 content-start gap-1">
  <span className="text-sm font-semibold">{label}</span>
  <div className="inventory-edit-value flex min-h-10.25 w-full min-w-0 items-center justify-between rounded border border-slate-300 bg-slate-50 text-sm text-ink-950">
   <span className="min-w-0 select-text break-words px-3 py-2">{value}</span>
   <button {...props} ref={buttonRef} type="button" title="Editar" aria-haspopup="dialog" aria-label={`${action}: ${value}`} aria-describedby={help?id:undefined} disabled={disabled} onClick={onClick}
    className="inventory-pencil-button shrink-0 self-stretch"><Pencil size={16} aria-hidden="true"/></button>
  </div>
  {help&&<p id={id} className="m-0 text-xs text-slate-500">{help}</p>}
 </div>;
}

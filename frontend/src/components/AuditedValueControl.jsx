import {useId} from "react";
import {Pencil} from "lucide-react";

export default function AuditedValueControl({label,value,action,disabled,onClick,help,buttonRef,...props}){
 const id=useId();
 return <div className="grid min-w-0 content-start gap-1">
  <span className="text-sm font-semibold">{label}</span>
  <button {...props} ref={buttonRef} type="button" aria-haspopup="dialog" aria-label={`${action}: ${value}`} aria-describedby={help?id:undefined} disabled={disabled} onClick={onClick}
   className="m-0! flex min-h-10.25 w-full min-w-0 items-center justify-between gap-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-500">
   <span className="min-w-0 break-words">{value}</span><Pencil size={16} className="shrink-0" aria-hidden="true"/>
  </button>
  {help&&<p id={id} className="m-0 text-xs text-slate-500">{help}</p>}
 </div>;
}

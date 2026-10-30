import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import AppModal from "./AppModal.jsx";
import api, { getApiError } from "../api/httpClient.js";
import { formatClp } from "../helpers/formatters.js";
import useCustomerNotice from "../hooks/useCustomerNotice.js";

const initial={deliveryEnabled:true,flatFee:3000,freeShippingFrom:500000};
export default function DeliverySettingsManager({role}){
 const {refreshNotices}=useCustomerNotice();
 const [open,setOpen]=useState(false),[current,setCurrent]=useState(null),[form,setForm]=useState(initial);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[review,setReview]=useState(false);
 const canConfigure = ["ADMIN", "MANAGER"].includes(role);
 useEffect(()=>{
  if (!open || !canConfigure) return;
  let active=true;
  api.get('/delivery-settings').then(({data})=>{if(!active)return;const p=data.data;setCurrent(p);setForm(p?.pricingMode==='LOCAL_FIXED'?{deliveryEnabled:p.deliveryEnabled,flatFee:Number(p.flatFee),freeShippingFrom:p.freeShippingFrom===null?null:Number(p.freeShippingFrom)}:initial);})
   .catch(e=>{if(active)setError(getApiError(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[open,canConfigure]);
 if (!canConfigure) return null;
 const edit=(key,value)=>{setForm(f=>({...f,[key]:value}));setReview(false);};
 async function save(e){e.preventDefault();if (!canConfigure || loading || error) return;if (!review){setReview(true);return;}setLoading(true);
  try{await api.put('/delivery-settings',{...form,pricingMode:'LOCAL_FIXED',pickupEnabled:true,minimumProductsTotal:null,isDemo:false,expectedRevisionId:current?.id??null});toast.success('Tarifa local guardada como nueva revisión');setOpen(false);refreshNotices();}
  catch(err){setError(getApiError(err));}finally{setLoading(false);}
 }
 return <><button type="button" className="border-slate-300 bg-white text-ink-950 focus-visible:outline-2 focus-visible:outline-rust-500 max-[720px]:w-full" onClick={()=>{setError('');setReview(false);setLoading(true);setOpen(true);}}><Settings size={17}/>Configurar despacho local</button>
 <AppModal open={open} onClose={()=>{if(!loading)setOpen(false);}} title="Configurar despacho local" description="Solo Santa Juana, Región del Biobío. Cada guardado crea una revisión; no recalcula pedidos anteriores.">
 <form onSubmit={save} className="grid min-w-0 gap-4">
 {error&&<p role="alert" className="text-sm text-critical-600">{error}</p>}
 {current?.pricingMode!=='LOCAL_FIXED'&&<p className="text-sm">Confirmar activará la tarifa local para nuevas compras. Las solicitudes antiguas conservarán su aprobación y condiciones históricas.</p>}
 <fieldset disabled={loading||Boolean(error)} className="grid min-w-0 gap-3 border-0 p-0">
 <label className="delivery-settings-checkbox"><input type="checkbox" checked={form.deliveryEnabled} onChange={e=>edit('deliveryEnabled',e.target.checked)}/><span>Despacho local habilitado</span></label>
 <label>Tarifa fija CLP<input required type="number" min="0" max="9999999999" step="1" value={form.flatFee} onChange={e=>edit('flatFee',Number(e.target.value))}/></label>
 <label className="delivery-settings-checkbox"><input type="checkbox" checked={form.freeShippingFrom!==null} onChange={e=>edit('freeShippingFrom',e.target.checked?500000:null)}/><span>Habilitar despacho gratuito por monto</span></label>
 {form.freeShippingFrom!==null&&<label>Umbral CLP (debe superarse)<input required type="number" min="1" max="9999999999" step="1" value={form.freeShippingFrom} onChange={e=>edit('freeShippingFrom',Number(e.target.value))}/></label>}
 </fieldset>
 <p className="m-0 text-sm">Se utiliza el subtotal de productos después de descuentos. Igualar el umbral no concede gratuidad. Retiro en tienda: $0. Deshabilitar despacho impide también iniciar nuevos pagos de solicitudes antiguas; no cancela pagos iniciados.</p>
 {review&&<p role="status" className="rounded border border-slate-200 p-3 text-sm">Revisa: {form.deliveryEnabled?'despacho '+formatClp(form.flatFee):'despacho deshabilitado'}. {form.freeShippingFrom===null?'Sin beneficio por monto.':'Gratis solo por productos netos superiores a '+formatClp(form.freeShippingFrom)+'.'} Se conservan los importes de los pedidos existentes.</p>}
 <div className="variant-editor-actions"><button type="button" disabled={loading} onClick={()=>setOpen(false)}>Cancelar</button><button type="submit" disabled={loading||Boolean(error)}>{loading?'Cargando…':review?'Confirmar y guardar revisión':'Revisar cambios'}</button></div>
 </form></AppModal></>;
}

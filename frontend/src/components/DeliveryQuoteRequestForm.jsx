import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getApiError } from "../api/httpClient.js";
import { createDeliveryQuote } from "../services/deliveryQuotes.service.js";

export default function DeliveryQuoteRequestForm({items,isClient,user,guestData,verification,verified}) {
  const [form,setForm]=useState({recipientName:isClient?`${user?.names||""} ${user?.surnames||""}`.trim():guestData.name,phone:isClient?user?.phone||"":guestData.phone,address:"",commune:"",reference:"",nonUrgent:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[created,setCreated]=useState(null);
  const operation=useRef(null),submitting=useRef(false);
  const edit=(key,value)=>{setForm(f=>({...f,[key]:value}));operation.current=null;};
  const submit=async event=>{
    event.preventDefault();if(submitting.current||!verified)return;submitting.current=true;setBusy(true);setError("");
    const payload={items,...form,...(!isClient?{guestName:guestData.name,guestEmail:guestData.email.trim().toLowerCase(),challengeId:verification?.challengeId}:{})};
    const signature=JSON.stringify(payload);if(operation.current?.signature!==signature)operation.current={signature,key:crypto.randomUUID()};
    try{setCreated((await createDeliveryQuote({...payload,requestKey:operation.current.key},!isClient)).request);}
    catch(e){setError(getApiError(e,"No se pudo registrar la solicitud. Puedes reintentar sin duplicarla."));}
    finally{submitting.current=false;setBusy(false);}
  };
  if(created)return <div role="status" className="rounded-md border border-positive-200 bg-positive-50 p-4 text-sm"><strong>Solicitud #{created.id} registrada</strong><p>No se creó un pedido ni se reservó stock. Consulta el estado para conocer la evaluación de FYF.</p><Link to={`/delivery-quotes/${created.id}`} className="font-bold underline">Consultar solicitud</Link></div>;
  return <form onSubmit={submit} className="grid gap-3">
    <div className="grid gap-3 sm:grid-cols-2">{[["recipientName","Nombre de quien recibirá",240],["phone","Teléfono del receptor",20],["address","Dirección",300],["commune","Comuna (Región del Biobío)",120]].map(([key,label,max])=><label key={key} className="grid min-w-0 gap-1 text-sm">{label}<input required minLength={key==="phone"?7:3} maxLength={max} value={form[key]} onChange={e=>edit(key,e.target.value)} /></label>)}</div>
    <label className="grid gap-1 text-sm">Referencias de ubicación<textarea maxLength={500} value={form.reference} onChange={e=>edit("reference",e.target.value)} /></label>
    <label className="flex! items-center gap-2 text-sm"><input type="checkbox" className="size-4! min-h-0! shrink-0" checked={form.nonUrgent} onChange={e=>edit("nonUrgent",e.target.checked)} /> Puedo coordinar una entrega no urgente</label>
    <small className="text-slate-500">La ubicación y cobertura deben ser confirmadas por FYF. Una entrega no urgente puede permitir evaluar el beneficio condicionado; no lo concede automáticamente.</small>
    {error&&<p role="alert" className="checkout-quote-alert rounded-md p-3 text-sm">{error}</p>}
    {!verified&&<p className="text-sm text-slate-500">Verifica primero el correo para enviar la solicitud.</p>}
    <button type="submit" disabled={busy||!verified||!items.length}>{busy?"Registrando solicitud...":"Solicitar cotización de despacho"}</button>
  </form>;
}

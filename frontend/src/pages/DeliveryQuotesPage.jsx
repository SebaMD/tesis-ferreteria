import { createId } from "../helpers/createId.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiError } from "../api/httpClient.js";
import useAuth from "../hooks/useAuth.js";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import OrderAmounts from "../components/orders/OrderAmounts.jsx";
import HistoricalIdentityNote from "../components/HistoricalIdentityNote.jsx";
import { formatClp, formatDate as formatDateValue } from "../helpers/formatters.js";
import { submitWebpayForm } from "../helpers/onlineOrders.js";
import { saveGuestOrderAccessToken } from "../helpers/guestCheckout.js";
import { deliveryQuoteApi as api, deliveryQuoteStates as states, savedDeliveryQuoteIds, quotePinRequest, quotePinVerify, recoverQuoteAccess } from "../services/deliveryQuotes.service.js";

const inputClass="grid min-w-0 gap-1 text-sm";
const formatDate=value=>formatDateValue(value,{dateStyle:"short",timeStyle:"short"});
const freightReasons={PAID_FREIGHT:"Flete con importe",FREE_RADIUS:"Sin cobro: recorrido confirmado hasta 5 km",FREE_CONDITIONAL:"Gratuidad condicionada aprobada",FREE_EXCEPTION:"Excepción comercial gratuita"};
function QuoteDetails({id,guest,staff,warehouse,back}) {
  const [q,setQ]=useState(null),[order,setOrder]=useState(null),[summary,setSummary]=useState(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[assignees,setAssignees]=useState([]);
  const [action,setAction]=useState(""),[reason,setReason]=useState(""),[assignee,setAssignee]=useState("");
  const [freight,setFreight]=useState({amount:"",reason:"PAID_FREIGHT",vehicle:"",distanceKm:"",trips:"",routeConfirmed:false,coordinated:false,notes:"",customerNote:""});
  const command=useRef(null),paymentBusy=useRef(false);
  const load=useCallback(async()=>{
    const next=await api("get","",undefined,guest,id);setQ(next);
    if(!warehouse)setOrder(await api("get","/order",undefined,guest,id));
    return next;
  },[id,guest,warehouse]);
  useEffect(()=>{let active=true;Promise.resolve().then(()=>{if(active)return load();}).catch(e=>{if(active)setError(getApiError(e,"No se pudo consultar la solicitud o tu acceso no es válido."));});if(staff)api("get","/assignees").then(setAssignees).catch(()=>{});return()=>{active=false;};},[load,staff]);
  const refresh=async()=>{setError("");setSummary(null);setAccepted(false);try{await load();}catch(e){setError(getApiError(e));}};
  const run=async(suffix,body)=>{
    if(busy||!q)return;setBusy(true);setError("");
    const signature=JSON.stringify({suffix,body,version:q.version});if(command.current?.signature!==signature)command.current={signature,key:createId()};
    try{await api("post",suffix,{expectedVersion:q.version,commandKey:command.current.key,...body},guest,id);setAction("");setReason("");setSummary(null);setAccepted(false);await load();}
    catch(e){setError(getApiError(e,"No se pudo guardar. Actualiza el estado antes de reintentar."));}
    finally{setBusy(false);}
  };
  const review=async()=>{setBusy(true);setError("");setAccepted(false);try{setSummary(await api("get","/summary",undefined,guest,id));}catch(e){setSummary(null);setError(getApiError(e));}finally{setBusy(false);}};
  const pay=async(retry=false)=>{
    if(paymentBusy.current||(!retry&&(!accepted||!summary)))return;paymentBusy.current=true;setBusy(true);setError("");let redirected=false;
    try{
      const fingerprint=summary?.quoteFingerprint;
      if(!command.current||command.current.signature!==fingerprint)command.current={signature:fingerprint,key:createId()};
      const payment=await api("post",retry?"/payment":"/checkout",retry?{}:{commandKey:command.current.key,expectedVersion:summary.expectedVersion,accepted:true,quoteFingerprint:summary.quoteFingerprint,commercialSignature:summary.commercialSignature},guest,id);
      if(guest&&payment.guestAccessToken)saveGuestOrderAccessToken(payment.orderId,payment.guestAccessToken);
      submitWebpayForm(payment);redirected=true;
    }catch(e){
      setAccepted(false);setSummary(null);setError(getApiError(e,"No se pudo iniciar el pago. Consulta el pedido existente antes de reintentar."));
      if(e?.response?.data?.code==="QUOTE_CHANGED")try{setSummary(await api("get","/summary",undefined,guest,id));}catch{/* Keep payment blocked until a valid new summary is available. */}
      await load().catch(()=>{});
    }finally{if(!redirected){paymentBusy.current=false;setBusy(false);}}
  };
  const latest=q?.revisions?.at(-1);
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to={back}>Volver a solicitudes</Link><button type="button" disabled={busy} onClick={refresh}>Actualizar estado</button></div>
    {error&&<div role="alert" className="checkout-quote-alert rounded-md p-4 text-sm">{error}</div>}
    {q&&<>
      <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="mt-0 text-lg">Solicitud #{q.id} · {states[q.status]||q.status}</h2><p className="text-sm text-slate-500">{formatDate(q.createdAt)} · Versión {q.version}</p>
        {!order&&<p className="text-sm">Esta solicitud no es un pedido pagado. Los productos todavía no están reservados.</p>}
        <div className="grid gap-2 text-sm sm:grid-cols-2"><span>Receptor: {q.delivery.recipientName}</span><span>Teléfono: {q.delivery.phone}</span><span className="break-words">Dirección: {q.delivery.address}, {q.delivery.commune}</span><span>Referencias: {q.delivery.reference||"Sin referencias"}</span><span>Entrega: {q.delivery.nonUrgent?"No urgente, a coordinar":"Urgencia por coordinar con FYF"}</span></div>
        <ul className="mb-0 space-y-2 pl-5 text-sm">{q.items.map(i=><li key={i.productId}>{i.name} · Producto #{i.productId} · {i.quantity} {i.unitMeasure}<HistoricalIdentityNote capture={i.historicalIdentity}/></li>)}</ul>
      </section>
      {q.revisions.length>0&&<section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mt-0">Revisiones del flete</h3>
        <div className="grid gap-3">{q.revisions.map(r=><article key={r.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <strong>Revisión {r.version} · {r.kind==="APPROVED"?"Aprobación":"Propuesta"} · {formatClp(r.amount)}</strong>
          <p className="my-1">{freightReasons[r.reason]||r.reason} {r.validUntil&&`· Vigencia: ${formatDate(r.validUntil)}`}</p>
          {r.createdAt&&<p className="text-xs text-slate-500">{formatDate(r.createdAt)} · Responsable #{r.createdBy}</p>}
          {(r.vehicle||r.distanceKm!=null||r.trips!=null)&&<p>Vehículo: {r.vehicle||"Sin especificar"} · Distancia informada: {r.distanceKm??"Sin informar"} km · Viajes: {r.trips??"Sin informar"}</p>}
          {r.customerNote&&<p>{r.customerNote}</p>}
          {r.notes&&<p className="mb-0">Observaciones internas: {r.notes}</p>}
        </article>)}</div>
      </section>}
      {!staff&&!warehouse&&q.status==="APPROVED"&&!order&&<section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4"><h3 className="m-0">Revisar y aceptar cotización</h3><button type="button" disabled={busy} onClick={review}>Consultar total actualizado</button>{summary&&<><OrderAmounts order={summary}/><p className="text-xs">Válida hasta {formatDate(summary.validUntil)}. {summary.conditions}</p><label className="flex! items-start gap-2 text-sm"><input className="size-4! min-h-0!" type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>He revisado los productos, el destino y el importe total; acepto esta cotización.</label><button type="button" disabled={busy||!accepted} onClick={()=>pay()}>Aceptar y pagar con Webpay</button></>}</section>}
      {order&&<section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm"><strong>Pedido #{order.id} · {order.status} · {formatClp(order.total)}</strong><p className="m-0">El pedido conserva su importe. Un nuevo intento exige autorización vigente; un pago ya iniciado puede conciliarse posteriormente.</p>{!staff&&!warehouse&&["PENDING_PAYMENT","PAYMENT_FAILED","CANCELLED","EXPIRED"].includes(order.status)&&<button type="button" disabled={busy||q.status==="CLOSED_UNPAID"} onClick={()=>pay(true)}>Continuar o reintentar pago del pedido</button>}{["PAYMENT_FAILED","CANCELLED","EXPIRED"].includes(order.status)&&q.status!=="CLOSED_UNPAID"&&<button type="button" disabled={busy} onClick={()=>setAction("close-unpaid")}>Cerrar pedido impago</button>}{q.status==="CLOSED_UNPAID"&&<p>El intento anterior está cerrado; no se modificó ni duplicó este pedido. Para una compra nueva, vuelve al carrito y revisa las condiciones de entrega vigentes antes de pagar.</p>}<Link to={guest?"/guest-orders":"/orders"}>Consultar pedidos</Link></section>}
      <div className="flex flex-wrap gap-2">
        {staff&&["REQUESTED","ASSIGNED","PROPOSED"].includes(q.status)&&<button type="button" onClick={()=>setAction("assign")}>Asignar responsable</button>}
        {(staff||warehouse)&&["REQUESTED","ASSIGNED","PROPOSED"].includes(q.status)&&<button type="button" onClick={()=>setAction("proposals")}>Registrar propuesta</button>}
        {staff&&q.status==="PROPOSED"&&latest&&<button type="button" onClick={()=>setAction("approve")}>Aprobar propuesta</button>}
        {staff&&["PROPOSED","APPROVED"].includes(q.status)&&<button type="button" onClick={()=>setAction("request-changes")}>Solicitar correcciones / revocar</button>}
        {staff&&["REQUESTED","ASSIGNED","PROPOSED","APPROVED"].includes(q.status)&&<button type="button" onClick={()=>setAction("reject")}>Rechazar solicitud</button>}
        {!warehouse&&["REQUESTED","ASSIGNED","PROPOSED","APPROVED"].includes(q.status)&&<button type="button" onClick={()=>setAction("cancel")}>Cancelar solicitud</button>}
      </div>
      {action&&<form className="grid gap-3 rounded-lg border border-slate-300 bg-white p-4" onSubmit={e=>{e.preventDefault();if(action==="proposals")run("/proposals",{...freight,amount:Number(freight.amount),distanceKm:freight.distanceKm===""?null:Number(freight.distanceKm),trips:freight.trips===""?null:Number(freight.trips)});else run(`/${action}`,{reason,...(action==="assign"?{assigneeId:Number(assignee)}:{}),...(action==="approve"?{proposalRevisionId:latest.id}:{})});}}><h3 className="m-0">Confirmar {action==="approve"?`aprobación de ${formatClp(latest.amount)}`:action==="proposals"?"propuesta de flete":action==="assign"?"asignación":"decisión"}</h3>
        {action==="assign"&&<label className={inputClass}>Encargado<select required value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Seleccionar</option>{assignees.map(a=><option key={a.id} value={a.id}>{a.names} {a.surnames}</option>)}</select></label>}
        {action==="proposals"?<>
          <div className="grid gap-3 sm:grid-cols-2">{[["amount","Importe final propuesto CLP","number"],["vehicle","Vehículo previsto","text"],["distanceKm","Distancia de ida informada (km)","number"],["trips","Viajes previstos","number"]].map(([key,label,type])=><label key={key} className={inputClass}>{label}<input type={type} required={key==="amount"} min="0" step={key==="distanceKm"?"0.01":"1"} value={freight[key]} onChange={e=>setFreight(f=>({...f,[key]:e.target.value}))}/></label>)}</div>
          <label className={inputClass}>Motivo<select value={freight.reason} onChange={e=>setFreight(f=>({...f,reason:e.target.value}))}><option value="PAID_FREIGHT">Flete con importe</option><option value="FREE_RADIUS">Sin cobro: recorrido confirmado hasta 5 km</option><option value="FREE_CONDITIONAL">Gratuidad condicionada por monto</option><option value="FREE_EXCEPTION">Excepción comercial gratuita</option></select></label>
          {[['routeConfirmed','Recorrido verificado manualmente'],['coordinated','Entrega coordinada con el cliente']].map(([key,label])=><label key={key} className="flex! items-center gap-2 text-sm"><input type="checkbox" className="size-4! min-h-0!" checked={freight[key]} onChange={e=>setFreight(f=>({...f,[key]:e.target.checked}))}/>{label}</label>)}
          <label className={inputClass}>Observaciones internas<textarea required minLength={8} maxLength={1000} value={freight.notes} onChange={e=>setFreight(f=>({...f,notes:e.target.value}))}/></label><label className={inputClass}>Nota para el cliente<textarea maxLength={500} value={freight.customerNote} onChange={e=>setFreight(f=>({...f,customerNote:e.target.value}))}/></label><small>Registrar una propuesta no la aprueba ni habilita el pago.</small>
        </>:<label className={inputClass}>Motivo obligatorio<textarea minLength={8} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)}/></label>}
        <div className="flex flex-wrap justify-between gap-2"><button type="button" disabled={busy} onClick={()=>setAction("")}>Volver sin confirmar</button><button type="submit" disabled={busy}>{busy?"Guardando...":"Confirmar operación"}</button></div>
      </form>}
      <details className="rounded-md border border-slate-200 bg-white p-3 text-sm"><summary>Historial de decisiones</summary><ul>{q.events.map(e=><li key={e.id}>{formatDate(e.createdAt)} · {e.type}{e.actorId&&` · Usuario #${e.actorId}`}{e.payload?.reason&&` · ${e.payload.reason}`}</li>)}</ul></details>
    </>}
  </div>;
}

export default function DeliveryQuotesPage(){
  const {id}=useParams(),{user,isAuthenticated}=useAuth();const staff=["ADMIN","MANAGER"].includes(user?.role),warehouse=user?.role==="WAREHOUSE",guest=!isAuthenticated;
  const base=staff||warehouse?"/delivery-requests":"/delivery-quotes";
  const [list,setList]=useState([]),[status,setStatus]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[cursor,setCursor]=useState(null),[recovery,setRecovery]=useState({id:"",email:""});
  const load=useCallback(async()=>{setBusy(true);setError("");try{const query=new URLSearchParams();if(cursor)query.set("beforeId",cursor);if(status)query.set("status",status);setList(guest?await Promise.all(savedDeliveryQuoteIds().map(n=>api("get","",undefined,true,n).catch(()=>null))).then(a=>a.filter(Boolean)) :await api("get",`?${query}`));}catch(e){setError(getApiError(e));}finally{setBusy(false);}},[guest,cursor,status]);
  useEffect(()=>{let active=true;Promise.resolve().then(()=>{if(active&&!id)return load();});return()=>{active=false;};},[id,load]);
  return <main className="mx-auto grid w-full max-w-5xl min-w-0 gap-5 px-4 py-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="m-0 text-2xl font-bold">Solicitudes de despacho anteriores</h1><p className="mb-0 text-sm text-slate-500">Compatibilidad histórica: consulta y finaliza solicitudes del flujo anterior, separadas de los pedidos pagados. Esta página no crea solicitudes nuevas. Las compras actuales eligen retiro en tienda o despacho local en Santa Juana y conocen el total antes de pagar.</p></div><Link to={staff||warehouse?"/online-orders-management":guest?"/guest-orders":"/orders"}>Volver a {staff||warehouse?"Pedidos y repartos":"Mis pedidos"}</Link></header>
    {id?<QuoteDetails key={`${id}-${user?.id||"guest"}`} id={Number(id)} guest={guest} staff={staff} warehouse={warehouse} back={base}/>:<>
      <div className="flex flex-wrap gap-3"><select aria-label="Filtrar solicitudes por estado" value={status} onChange={e=>{setStatus(e.target.value);setCursor(null);}}><option value="">Todos los estados</option>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" disabled={busy} onClick={load}>Actualizar solicitudes</button></div>
      {error&&<p role="alert" className="checkout-quote-alert rounded-md p-3">{error}</p>}
      <div className="grid gap-3">{list.filter(q=>!status||q.status===status).map(q=><Link className="rounded-lg border border-slate-200 bg-white p-4 text-inherit no-underline hover:border-rust-500" key={q.id} to={`${base}/${q.id}`}><strong>Solicitud #{q.id} · {states[q.status]}</strong><p className="mb-0 text-sm">{formatDate(q.createdAt)} · {q.delivery.commune} · {q.items.length} artículos</p></Link>)}{!busy&&!list.length&&<p>No hay solicitudes disponibles en esta página.</p>}</div>
      {!guest&&<div className="flex flex-wrap gap-2"><button type="button" disabled={!cursor||busy} onClick={()=>setCursor(null)}>Primeras solicitudes</button><button type="button" disabled={list.length<100||busy} onClick={()=>setCursor(list.at(-1)?.id)}>Siguiente página</button></div>}
      {guest&&<section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4"><h2 className="m-0 text-lg">Recuperar acceso a mi solicitud</h2><p className="text-sm">Las solicitudes de esta pestaña se recuerdan durante la sesión. Para recuperar otra, verifica el correo utilizado y el número recibido al solicitarla.</p><label className={inputClass}>Número de solicitud<input type="number" min="1" value={recovery.id} onChange={e=>setRecovery(r=>({...r,id:e.target.value}))}/></label><label className={inputClass}>Correo<input type="email" value={recovery.email} onChange={e=>setRecovery(r=>({...r,email:e.target.value}))}/></label>{Number(recovery.id)>0&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recovery.email)&&<EmailVerificationPanel key={`${recovery.id}-${recovery.email}`} email={recovery.email} requestCode={()=>quotePinRequest(recovery.email,true)} verifyCode={body=>quotePinVerify(body,true)} onVerified={async result=>{await recoverQuoteAccess(recovery.id,result.challengeId);await load();}}/>}</section>}
    </>}
  </main>;
}

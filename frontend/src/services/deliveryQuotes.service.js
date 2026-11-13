import api from "../api/httpClient.js";
import { getOrCreateGuestSessionId } from "../helpers/guestCheckout.js";
const guestBase="/online-orders/guest/delivery-quotes";
const tokenKey=id=>`fyf_delivery_quote_${Number(id)}`;
export function saveDeliveryQuoteAccess(id,token){if(/^[A-Za-z0-9_-]{43}$/.test(token||""))sessionStorage.setItem(tokenKey(id),token);}
export function readDeliveryQuoteAccess(id){return sessionStorage.getItem(tokenKey(id));}
export function savedDeliveryQuoteIds(){return Object.keys(sessionStorage).filter(k=>/^fyf_delivery_quote_\d+$/.test(k)).map(k=>Number(k.split("_").at(-1)));}
export async function quotePinRequest(email,access=false){return (await api.post(`${guestBase}/${access?"access":"verification"}/request`,{email},{headers:{"X-Guest-Session":getOrCreateGuestSessionId()}})).data.data;}
export async function quotePinVerify(body,access=false){return (await api.post(`${guestBase}/${access?"access":"verification"}/verify`,body,{headers:{"X-Guest-Session":getOrCreateGuestSessionId()}})).data.data;}
export async function recoverQuoteAccess(id,challengeId){const data=(await api.post(`${guestBase}/${Number(id)}/recover-access`,{challengeId},{headers:{"X-Guest-Session":getOrCreateGuestSessionId()}})).data.data;saveDeliveryQuoteAccess(id,data.accessToken);return data;}
export async function createDeliveryQuote(body,guest=false){const data=(await api.post(guest?guestBase:"/delivery-quotes",body,guest?{headers:{"X-Guest-Session":getOrCreateGuestSessionId()}}:{})).data.data;if(data.accessToken)saveDeliveryQuoteAccess(data.request.id,data.accessToken);return data;}
export async function deliveryQuoteApi(method,suffix="",body,guest=false,id){
  const path=(guest?guestBase:"/delivery-quotes")+(id?`/${Number(id)}`:"")+suffix;
  return (await api.request({method,url:path,data:body,...(guest?{headers:{"X-Delivery-Quote-Token":readDeliveryQuoteAccess(id)}}:{})})).data.data;
}
export const deliveryQuoteStates={REQUESTED:"Solicitud recibida",ASSIGNED:"En evaluación",PROPOSED:"Cotización propuesta",APPROVED:"Cotización aprobada",REJECTED:"Rechazada",CANCELLED:"Cancelada",EXPIRED:"Vencida",ORDER_CREATED:"Pedido generado",CLOSED_UNPAID:"Pedido impago cerrado"};

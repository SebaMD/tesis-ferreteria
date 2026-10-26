import { validateCreateCheckoutBody } from "../onlineOrders/onlineOrders.validation.js";
import { isValidEmail, normalizeEmail } from "../../utils/email.js";

export class DeliveryQuoteError extends Error {
  constructor(message:string,public readonly statusCode=409){super(message);this.name="DeliveryQuoteError";}
}
export function object(input:unknown,allowed:string[]):Record<string,unknown>{
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw new DeliveryQuoteError("Parámetros inválidos o no permitidos",400);
  return input as Record<string,unknown>;
}
export function integer(value:unknown,min=1,max=2147483647):number{
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)throw new DeliveryQuoteError("Número entero inválido",400);return value;
}
export function text(value:unknown,min:number,max:number):string{
  if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)throw new DeliveryQuoteError(`Ingrese texto de entre ${min} y ${max} caracteres`,400);return value.trim();
}
export function command(input:unknown,extra:string[]=[]){
  const b=object(input,["commandKey","expectedVersion",...extra]);
  const commandKey=text(b.commandKey,20,80);if(!/^[a-zA-Z0-9-]+$/.test(commandKey))throw new DeliveryQuoteError("Clave de operación inválida",400);
  return {b,commandKey,expectedVersion:integer(b.expectedVersion)};
}
export function validateQuoteRequest(input:unknown,guest=false){
  const b=object(input,["requestKey","items","recipientName","phone","address","commune","reference","nonUrgent",...(guest?["guestName","guestEmail","challengeId"]:[])]);
  const requestKey=text(b.requestKey,20,80);if(!/^[a-zA-Z0-9-]+$/.test(requestKey))throw new DeliveryQuoteError("Clave inválida",400);
  const validated=validateCreateCheckoutBody({checkoutKey:requestKey.slice(0,64),items:b.items,deliveryType:"PICKUP"});
  if(!validated.success)throw new DeliveryQuoteError(validated.error,400);
  validated.value.items.forEach(i=>integer(i.quantity));
  const phone=text(b.phone,7,20);if(!/^[+0-9()\s-]{7,20}$/.test(phone))throw new DeliveryQuoteError("Teléfono inválido",400);
  if(typeof b.nonUrgent!=="boolean")throw new DeliveryQuoteError("Indique si la entrega no es urgente",400);
  const guestEmail=guest?normalizeEmail(text(b.guestEmail,3,254)):null;
  if(guestEmail&&!isValidEmail(guestEmail))throw new DeliveryQuoteError("Correo inválido",400);
  return {requestKey,items:validated.value.items.sort((a,b)=>a.productId-b.productId),recipientName:text(b.recipientName,2,240),phone,address:text(b.address,3,300),commune:text(b.commune,2,120),
    reference:b.reference==null||b.reference===""?null:text(b.reference,1,500),nonUrgent:b.nonUrgent,guestName:guest?text(b.guestName,2,240):null,guestEmail,challengeId:guest?integer(b.challengeId):null};
}
export const FREIGHT_REASONS=["PAID_FREIGHT","FREE_RADIUS","FREE_CONDITIONAL","FREE_EXCEPTION"] as const;
export function validateFreight(input:unknown){
  const {b,...base}=command(input,["amount","reason","vehicle","distanceKm","trips","routeConfirmed","coordinated","notes","customerNote"]);
  const amount=integer(b.amount,0,9999999999);const reason=text(b.reason,1,30);
  if(!FREIGHT_REASONS.includes(reason as typeof FREIGHT_REASONS[number]))throw new DeliveryQuoteError("Motivo de flete inválido",400);
  if(typeof b.routeConfirmed!=="boolean"||typeof b.coordinated!=="boolean")throw new DeliveryQuoteError("Confirme las condiciones del flete",400);
  let distanceKm:string|null=null;
  if(b.distanceKm!=null){if(typeof b.distanceKm!=="number"||!Number.isFinite(b.distanceKm)||b.distanceKm<0||b.distanceKm>99999999||Number(b.distanceKm.toFixed(2))!==b.distanceKm)throw new DeliveryQuoteError("Distancia informativa inválida",400);distanceKm=b.distanceKm.toFixed(2);}
  if((reason==="PAID_FREIGHT")!== (amount>0))throw new DeliveryQuoteError("El importe no corresponde al motivo del flete",400);
  if(reason==="FREE_RADIUS"&&(!b.routeConfirmed||distanceKm===null||Number(distanceKm)>5))throw new DeliveryQuoteError("La gratuidad por recorrido exige confirmar manualmente hasta 5 km",400);
  if(reason==="FREE_CONDITIONAL"&&!b.coordinated)throw new DeliveryQuoteError("La gratuidad condicionada exige coordinación",400);
  return {...base,amount:amount.toFixed(2),reason,vehicle:b.vehicle==null||b.vehicle===""?null:text(b.vehicle,1,120),distanceKm,trips:b.trips==null?null:integer(b.trips),routeConfirmed:b.routeConfirmed,coordinated:b.coordinated,
    notes:text(b.notes,8,1000),customerNote:b.customerNote==null||b.customerNote===""?null:text(b.customerNote,1,500)};
}
export function validateManualSettings(input:unknown){
  const b=object(input,["expectedRevisionId","deliveryEnabled","conditionalFreeEnabled","conditionalFreeFrom","approvalValidityHours","evaluationValidityHours"]);
  if(typeof b.deliveryEnabled!=="boolean"||typeof b.conditionalFreeEnabled!=="boolean")throw new DeliveryQuoteError("Indique las modalidades habilitadas",400);
  return {expectedRevisionId:b.expectedRevisionId===null?null:integer(b.expectedRevisionId),deliveryEnabled:b.deliveryEnabled,conditionalFreeEnabled:b.conditionalFreeEnabled,
    conditionalFreeFrom:integer(b.conditionalFreeFrom??500000,1,9999999999).toFixed(2),approvalValidityHours:integer(b.approvalValidityHours??24,1,168),evaluationValidityHours:integer(b.evaluationValidityHours??72,1,720)};
}

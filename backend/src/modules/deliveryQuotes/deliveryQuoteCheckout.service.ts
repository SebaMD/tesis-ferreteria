import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { deliveryQuoteRequestsTable as requests, deliveryQuoteItemsTable as items, deliveryQuoteRevisionsTable as revisions, deliveryQuoteEventsTable as events, onlineOrdersTable as orders, onlinePaymentsTable as payments } from "../../db/schema/index.js";
import { currentDeliveryPolicy } from "../deliverySettings/deliverySettings.service.js";
import { commercialQuoteSignature, DeliveryPolicyError, quoteFingerprint } from "../deliverySettings/deliveryPricing.js";
import { buildCommercialAmounts } from "../onlineOrders/commercialAmounts.js";
import { createCheckoutForOwner, priceCheckoutItems, continueOnlineOrderPaymentService, retryOnlineOrderPaymentService, retryGuestOnlineOrderPaymentService, continueGuestPaymentByTokenService, reconcileDueOnlinePaymentsService, type CheckoutOwner } from "../onlineOrders/onlineOrders.service.js";
import { createGuestOrderAccessToken, hashGuestDeviceId } from "../onlineOrders/guestOrderAccess.js";
import { createGuestOrderAccessRecord } from "../onlineOrders/guestOrderAccess.repository.js";
import { loadDeliveryQuote, expireDeliveryQuote, recordDeliveryQuoteEvent, type QuotePrincipal } from "./deliveryQuotes.service.js";
import { assertApprovedFreight, legacyManualPolicy } from "./manualDeliveryAuthorization.js";
import { DeliveryQuoteError, command, integer, text } from "./deliveryQuotes.validation.js";

type Quote=typeof requests.$inferSelect;
async function commercial(tx:DbTransaction,q:Quote) {
  await currentDeliveryPolicy(tx);
  if(q.status!=="APPROVED")throw new DeliveryQuoteError("La solicitud no tiene una aprobación vigente",409);
  const [approval]=await tx.select().from(revisions).where(and(eq(revisions.requestId,q.id),eq(revisions.kind,"APPROVED"))).orderBy(desc(revisions.version)).limit(1);
  if(!approval)throw new DeliveryQuoteError("FYF debe aprobar el flete antes de pagar",409);
  const policy=await legacyManualPolicy(tx,approval.policyRevisionId);
  const requested=await tx.select({productId:items.productId,quantity:items.quantity}).from(items).where(eq(items.requestId,q.id)).orderBy(items.productId);
  const orderItems=await priceCheckoutItems(tx,requested);
  const productsSubtotal=orderItems.reduce((n,i)=>n+Number(i.unitPrice)*i.quantity,0);
  const productsDiscountTotal=orderItems.reduce((n,i)=>n+Number(i.discountAmount),0);
  const productsNet=productsSubtotal-productsDiscountTotal,total=productsNet+Number(approval.amount);
  if(!Number.isSafeInteger(total)||total<=0||total>9999999999)throw new DeliveryQuoteError("El total supera el importe permitido",400);
  assertApprovedFreight(policy,approval,q.nonUrgent,productsNet);
  const reason=({PAID_FREIGHT:"MANUAL_APPROVED",FREE_RADIUS:"MANUAL_FREE_RADIUS",FREE_CONDITIONAL:"MANUAL_FREE_CONDITIONAL",FREE_EXCEPTION:"MANUAL_FREE_EXCEPTION"} as Record<string,string>)[approval.reason];
  const delivery={fee:Number(approval.amount),reason};
  const context={requestId:q.id,version:q.version,approvedRevisionId:approval.id,validUntil:approval.validUntil!.toISOString(),
    destination:{recipientName:q.recipientName,phone:q.phone,address:q.address,commune:q.commune,reference:q.reference,nonUrgent:q.nonUrgent},freightReason:approval.reason};
  const economics={revisionId:policy!.id,deliveryType:"DELIVERY",items:orderItems,fee:delivery.fee};
  const fingerprint=createHash("sha256").update(JSON.stringify({technical:quoteFingerprint(economics),context})).digest("hex");
  const signature=commercialQuoteSignature(economics,context);
  const amounts={productsSubtotal:productsSubtotal.toFixed(2),productsDiscountTotal:productsDiscountTotal.toFixed(2),deliveryFee:approval.amount,total:total.toFixed(2),deliveryFeeReason:reason,deliveryType:"DELIVERY"};
  return {policy:policy!,approval,context,orderItems,productsSubtotal,productsDiscountTotal,productsNet,total,delivery,fingerprint,signature,
    summary:{...amounts,items:orderItems,requestId:q.id,expectedVersion:q.version,approvedRevisionId:approval.id,validUntil:approval.validUntil,delivery:context.destination,
      quoteFingerprint:fingerprint,commercialSignature:signature,commercialAmounts:buildCommercialAmounts(amounts),conditions:"Importe de flete aprobado por FYF; productos sujetos a revalidación antes del pago."}};
}

async function linkedOrder(tx:DbTransaction,id:number) {
  const [order]=await tx.select({id:orders.id,status:orders.status,total:orders.total,reservationExpiresAt:orders.reservationExpiresAt}).from(orders).where(eq(orders.deliveryQuoteRequestId,id));return order??null;
}
export async function deliveryQuoteSummary(id:number,p:QuotePrincipal) {
  return db.transaction(async tx=>{
    await currentDeliveryPolicy(tx);
    const {q,u}=await loadDeliveryQuote(tx,integer(id),p);
    if(u?.role==="WAREHOUSE")throw new DeliveryQuoteError("No tienes permisos para consultar el resumen comercial",403);
    const current=await expireDeliveryQuote(tx,q);
    if(current.status==="EXPIRED")return {expired:true as const};
    return (await commercial(tx,current)).summary;
  });
}
export async function deliveryQuoteOrder(id:number,p:QuotePrincipal){return db.transaction(async tx=>{const {u}=await loadDeliveryQuote(tx,id,p);if(u?.role==="WAREHOUSE")throw new DeliveryQuoteError("No tienes permisos para consultar importes del pedido",403);return linkedOrder(tx,id);});}

export async function checkoutDeliveryQuote(id:number,p:QuotePrincipal,input:unknown,guestDeviceId?:string) {
  const b=command(input,["quoteFingerprint","commercialSignature","accepted"]);
  if(b.b.accepted!==true)throw new DeliveryQuoteError("Debes aceptar expresamente el resumen antes de pagar",400);
  const acceptedFingerprint=text(b.b.quoteFingerprint,64,64),acceptedSignature=text(b.b.commercialSignature,64,64);
  const snapshot=await db.transaction(async tx=>{const {q,u}=await loadDeliveryQuote(tx,integer(id),p);if(u?.role!=="CLIENT"&&u!==null)throw new DeliveryQuoteError("Solo el comprador puede aceptar",403);return q;});
  const owner:CheckoutOwner=snapshot.clientId!==null?{type:"CLIENT",clientId:snapshot.clientId}:{type:"GUEST",guestSessionHash:snapshot.guestSessionHash!,guestDeviceHash:hashGuestDeviceId(guestDeviceId||""),guestName:snapshot.guestName!,guestEmail:snapshot.guestEmail!,guestPhone:snapshot.phone};
  let locked:Awaited<ReturnType<typeof loadDeliveryQuote>>;
  const data={checkoutKey:`delivery-quote-${id}`,quoteFingerprint:acceptedFingerprint,items:[],deliveryType:"DELIVERY" as const,deliveryRecipientName:snapshot.recipientName,deliveryPhone:snapshot.phone,deliveryAddress:snapshot.address,deliveryCommune:snapshot.commune,deliveryReference:snapshot.reference,deliveryLatitude:null,deliveryLongitude:null,saveDeliveryAddress:false};
  return createCheckoutForOwner(owner,data,{
    authorize:async tx=>{await currentDeliveryPolicy(tx);locked=await loadDeliveryQuote(tx,id,p);if(locked.u?.role!=="CLIENT"&&locked.u!==null)throw new DeliveryQuoteError("Solo el comprador puede aceptar",403);},
    resolve:async tx=>{
      const q=locked.q;
      if(q.version!==b.expectedVersion)throw new DeliveryPolicyError("La solicitud cambió. Revisa y acepta el nuevo resumen.",409,"QUOTE_CHANGED");
      const priced=await commercial(tx,q);
      if(priced.fingerprint!==acceptedFingerprint||priced.signature!==acceptedSignature)throw new DeliveryPolicyError("El resumen cambió. Revisa los importes y vuelve a aceptarlo.",409,"QUOTE_CHANGED");
      const [acceptance]=await tx.insert(events).values({requestId:id,revisionId:priced.approval.id,type:"ACCEPTED",actorKind:locked.u?"USER":"GUEST",actorId:locked.u?.id??null,commandKey:b.commandKey,commandHash:createHash("sha256").update(JSON.stringify({acceptedFingerprint,acceptedSignature,version:b.expectedVersion})).digest("hex"),
        payload:{...priced.context,approvedRequestVersion:q.version,quoteFingerprint:acceptedFingerprint,commercialSignature:acceptedSignature,total:priced.total.toFixed(2)}}).returning();
      return {...priced,deliveryQuoteRequestId:id,deliveryQuoteAcceptanceId:acceptance.id};
    },
    complete:async(tx,orderId)=>{const [q]=await tx.update(requests).set({status:"ORDER_CREATED",version:locked.q.version+1,updatedAt:new Date()}).where(eq(requests.id,id)).returning();await recordDeliveryQuoteEvent(tx,q,"ORDER_CREATED",locked.u,{orderId});},
  });
}

export async function resumeDeliveryQuotePayment(id:number,p:QuotePrincipal) {
  const resolved=await db.transaction(async tx=>{
    const {q,u}=await loadDeliveryQuote(tx,id,p);if(u?.role!=="CLIENT"&&u!==null)throw new DeliveryQuoteError("Solo el comprador puede pagar",403);
    const order=await linkedOrder(tx,id);if(!order||q.status!=="ORDER_CREATED")throw new DeliveryQuoteError("No existe un pedido pagadero para esta solicitud",409);
    let token:string|undefined;
    if(!q.clientId){const access=createGuestOrderAccessToken();await createGuestOrderAccessRecord(tx,{orderId:order.id,tokenHash:access.tokenHash,expiresAt:access.expiresAt});token=access.token;}
    return {order,clientId:q.clientId,token};
  });
  if(resolved.clientId)return resolved.order.status==="PENDING_PAYMENT"?continueOnlineOrderPaymentService(resolved.clientId,resolved.order.id):retryOnlineOrderPaymentService(resolved.clientId,resolved.order.id);
  return resolved.order.status==="PENDING_PAYMENT"?continueGuestPaymentByTokenService(resolved.token!):retryGuestOnlineOrderPaymentService(resolved.token!);
}

export async function closeUnpaidDeliveryQuote(id:number,p:QuotePrincipal,input:unknown) {
  const b=command(input,["reason"]),reason=text(b.b.reason,8,1000);
  const initial=await deliveryQuoteOrder(id,p);if(!initial)throw new DeliveryQuoteError("No existe un pedido asociado",409);
  await reconcileDueOnlinePaymentsService({orderId:initial.id});
  return db.transaction(async tx=>{
    const {q,u}=await loadDeliveryQuote(tx,id,p);if(u?.role==="WAREHOUSE")throw new DeliveryQuoteError("No tienes permisos para cerrar el pago",403);
    if(q.status==="CLOSED_UNPAID")return {closed:true};
    if(q.status!=="ORDER_CREATED"||q.version!==b.expectedVersion)throw new DeliveryQuoteError("La solicitud cambió; actualiza su estado",409);
    const [order]=await tx.select().from(orders).where(eq(orders.id,initial.id)).for("update");
    const attempts=await tx.select().from(payments).where(eq(payments.orderId,order.id));
    if(!["EXPIRED","CANCELLED","PAYMENT_FAILED"].includes(order.status)||attempts.some(a=>!["EXPIRED","CANCELLED","FAILED"].includes(a.status)))throw new DeliveryQuoteError("Primero debe finalizar o conciliarse el intento anterior. No se cerró un pago ambiguo.",409);
    const [updated]=await tx.update(requests).set({status:"CLOSED_UNPAID",version:q.version+1,updatedAt:new Date()}).where(eq(requests.id,id)).returning();
    await recordDeliveryQuoteEvent(tx,updated,"PAYMENT_CLOSED",u,{orderId:order.id,reason},null,{commandKey:b.commandKey,hash:createHash("sha256").update(reason).digest("hex")});
    return {closed:true,orderId:order.id,message:"Pedido impago cerrado para nuevos intentos. Crea una solicitud nueva para reevaluar; el pedido y su importe se conservan."};
  });
}

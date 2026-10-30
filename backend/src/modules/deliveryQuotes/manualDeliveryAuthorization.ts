import { eq } from "drizzle-orm";
import type { DbTransaction } from "../../db/index.js";
import { deliveryQuoteRequestsTable as requests, deliveryQuoteRevisionsTable as revisions, deliveryQuoteEventsTable as events, onlineOrdersTable as orders } from "../../db/schema/index.js";
import { currentDeliveryPolicy } from "../deliverySettings/deliverySettings.service.js";
import { DeliveryPolicyError, type DeliveryPolicy } from "../deliverySettings/deliveryPricing.js";
import { deliveryPolicyRevisionsTable as policies } from "../../db/schema/index.js";

// Current policy lock is acquired first. After the local rollout only EXISTING
// requests may use their immutable manual revision; the global delivery switch still applies.
export async function legacyManualPolicy(tx:DbTransaction, revisionId:number){
  const current=await currentDeliveryPolicy(tx);
  if(current?.pricingMode!=="LOCAL_FIXED")return current;
  const [captured]=await tx.select().from(policies).where(eq(policies.id,revisionId));
  return captured?.pricingMode==="MANUAL_QUOTE"?{...captured,deliveryEnabled:captured.deliveryEnabled&&current.deliveryEnabled}:null;
}

export function assertApprovedFreight(policy: DeliveryPolicy | null, approval: typeof revisions.$inferSelect, nonUrgent:boolean, productsNet:number) {
  if(!policy || policy.pricingMode!=="MANUAL_QUOTE" || !policy.deliveryEnabled) throw new DeliveryPolicyError("El despacho no está disponible por ahora",409,"DELIVERY_UNAVAILABLE");
  if(approval.kind!=="APPROVED" || !approval.validUntil || approval.validUntil.getTime()<=Date.now()) throw new DeliveryPolicyError("La autorización del flete venció. Solicita una nueva evaluación de FYF.",409,"FREIGHT_AUTHORIZATION_EXPIRED");
  if(approval.reason==="FREE_CONDITIONAL" && (!policy.conditionalFreeEnabled || !nonUrgent || !approval.coordinated || productsNet<Number(policy.conditionalFreeFrom))) throw new DeliveryPolicyError("Las condiciones del beneficio cambiaron. FYF debe evaluar nuevamente el flete.",409,"FREIGHT_REVIEW_REQUIRED");
}

// Only new attempts pass this gate. Callbacks/conciliation of already started payments do not.
export async function assertManualDeliveryPaymentAuthorization(tx:DbTransaction, orderId:number) {
  const [order]=await tx.select().from(orders).where(eq(orders.id,orderId));
  if(!order?.deliveryQuoteRequestId) return;
  await currentDeliveryPolicy(tx);
  const [q]=await tx.select().from(requests).where(eq(requests.id,order.deliveryQuoteRequestId));
  const [acceptance]=await tx.select().from(events).where(eq(events.id,order.deliveryQuoteAcceptanceId!));
  const payload=acceptance?.payload as {approvedRevisionId?:number}|undefined;
  const [approval]=payload?.approvedRevisionId?await tx.select().from(revisions).where(eq(revisions.id,payload.approvedRevisionId)):[];
  if(!q || !["APPROVED","ORDER_CREATED"].includes(q.status) || acceptance?.type!=="ACCEPTED" || !approval || approval.requestId!==q.id || Number(approval.amount)!==Number(order.deliveryFee)) throw new DeliveryPolicyError("El pedido requiere una nueva evaluación comercial; su importe no fue modificado.",409,"FREIGHT_REVIEW_REQUIRED");
  assertApprovedFreight(await legacyManualPolicy(tx,approval.policyRevisionId),approval,q.nonUrgent,Number(order.productsSubtotal)-Number(order.productsDiscountTotal));
}

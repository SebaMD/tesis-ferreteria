import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";

export async function runDeliveryQuoteCheckoutTests({pool,base,call,payload,userIds,product,transactions,setFailLaunch,verify,guestPath,settings}) {
  assert.match((await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\","/"),/\/fyf-quote-test-[^/]+\/data$/);
  let policy=(await call("PUT","/delivery-quotes/settings",{expectedRevisionId:settings.id,deliveryEnabled:true,conditionalFreeEnabled:true},"ADMIN")).data;
  let next=10;
  const cmd=(q,extra={})=>({commandKey:randomUUID(),expectedVersion:q.version,...extra});
  const freight={amount:7500,reason:"PAID_FREIGHT",vehicle:"Camioneta de prueba",distanceKm:12,trips:1,routeConfirmed:false,coordinated:false,notes:"Flete calculado y registrado manualmente"};
  const approve=async(q,change={})=>{
    q=(await call("POST",`/delivery-quotes/${q.id}/proposals`,cmd(q,{...freight,...change}),"MANAGER")).data.request;
    return (await call("POST",`/delivery-quotes/${q.id}/approve`,cmd(q,{proposalRevisionId:q.revisions.at(-1).id,reason:"Aprobación explícita para prueba de checkout"}),"ADMIN")).data.request;
  };
  const make=async(change={},price={})=>{const role=`CLIENT${next++}`;const q=(await call("POST","/delivery-quotes",{...payload(),...change},role)).data.request;return {role,q:await approve(q,price)};};
  const accept=(s)=>({commandKey:randomUUID(),expectedVersion:s.expectedVersion,accepted:true,quoteFingerprint:s.quoteFingerprint,commercialSignature:s.commercialSignature});
  const summary=async(a)=> (await call("GET",`/delivery-quotes/${a.q.id}/summary`,null,a.role)).data;
  const orderCount=async id=>Number((await pool.query("select count(*) from online_orders where delivery_quote_request_id=$1",[id])).rows[0].count);
  const callback=async token=>{const r=await fetch(base+"/online-orders/payments/webpay/return",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token_ws:token}),redirect:"manual"});assert.equal(r.status,303);};
  const a=await make();const s=await summary(a);assert.equal(s.delivery.commune,"Concepción");assert.equal(s.total,"507500.00");
  await call("GET",`/delivery-quotes/${a.q.id}/summary`,null,"CLIENT2",404);
  await call("POST",`/delivery-quotes/${a.q.id}/checkout`,accept(s),"CASHIER",403);
  await call("POST",`/delivery-quotes/${a.q.id}/checkout`,{...accept(s),amount:1},a.role,400);
  await call("POST",`/delivery-quotes/${a.q.id}/checkout`,{...accept(s),accepted:false},a.role,400);
  const body=accept(s);
  const attempts=await Promise.all([call("POST",`/delivery-quotes/${a.q.id}/checkout`,body,a.role,[200,409]),call("POST",`/delivery-quotes/${a.q.id}/checkout`,body,a.role,[200,409])]);
  const payment=attempts.find(r=>r.status===200).data;assert.equal(payment.total,507500);assert.equal(await orderCount(a.q.id),1);
  const persisted=(await pool.query("select * from online_orders where id=$1",[payment.orderId])).rows[0];assert.equal(persisted.delivery_commune,"Concepción");assert.equal(persisted.delivery_fee,"7500.00");assert.equal(persisted.total,"507500.00");
  assert.equal((await pool.query("select count(*) from online_payments where order_id=$1",[payment.orderId])).rows[0].count,"1");
  assert.equal((await pool.query("select count(*) from online_order_items where order_id=$1",[payment.orderId])).rows[0].count,"1");
  assert.equal(transactions.get(payment.token).amount,507500);
  const stockBefore=(await pool.query("select current_stock from products where id=$1",[product.id])).rows[0].current_stock;
  policy=(await call("PUT","/delivery-quotes/settings",{expectedRevisionId:policy.id,deliveryEnabled:false,conditionalFreeEnabled:true},"ADMIN")).data;
  await callback(payment.token);await callback(payment.token);
  assert.equal((await pool.query("select status from online_orders where id=$1",[payment.orderId])).rows[0].status,"PAID");
  assert.equal((await pool.query("select current_stock from products where id=$1",[product.id])).rows[0].current_stock,stockBefore-5);
  assert.equal((await pool.query("select count(*) from inventory_movements where online_order_id=$1 and movement_type='EXIT'",[payment.orderId])).rows[0].count,"1");
  const {getOrderCommercialModelForNotificationService}=await import("../dist/modules/onlineOrders/onlineOrders.service.js");
  const {renderPurchaseConfirmedMail}=await import("../dist/modules/notifications/purchaseConfirmedMail.js");
  const {renderOrderReceiptPdf}=await import("../dist/modules/onlineOrders/orderReceiptPdf.js");
  const model=await getOrderCommercialModelForNotificationService(payment.orderId);assert.equal(model.total,"507500.00");assert.equal(model.deliveryFee,"7500.00");
  assert.match(renderPurchaseConfirmedMail(model).text,/Costo de despacho: \$7\.500/);assert.equal((await renderOrderReceiptPdf(model)).subarray(0,5).toString(),"%PDF-");
  const {getManagerStatisticsService}=await import("../dist/modules/reports/managerStatistics.service.js");
  const stats=await getManagerStatisticsService({from:new Date(Date.now()-86400000),toExclusive:new Date(Date.now()+86400000),fromLabel:"isolated",toLabel:"isolated"});
  assert.equal(stats.kpis.productsIncome,500000);assert.equal(stats.kpis.deliveryIncome,7500);assert.equal(stats.kpis.totalCollected,507500);assert.equal(stats.kpis.unitsSold,5);
  await call("POST",`/delivery-quotes/${a.q.id}/payment`,{},a.role,409);
  policy=(await call("PUT","/delivery-quotes/settings",{expectedRevisionId:policy.id,deliveryEnabled:true,conditionalFreeEnabled:true},"ADMIN")).data;
  console.log("PASS 3B CLIENT: explicit acceptance, forbidden client money, one order/reservation/attempt under concurrency, regional address, exact fee and simulated callback twice after dispatch suspension");

  const changed=await make(),old=await summary(changed);
  await pool.query("update products set price=110000 where id=$1",[product.id]);
  const conflict=await call("POST",`/delivery-quotes/${changed.q.id}/checkout`,accept(old),changed.role,409);assert.equal(conflict.data,undefined);assert.equal(await orderCount(changed.q.id),0);
  const refreshed=await summary(changed);assert.notEqual(refreshed.quoteFingerprint,old.quoteFingerprint);assert.notEqual(refreshed.commercialSignature,old.commercialSignature);
  await pool.query("update products set price=100000 where id=$1",[product.id]);
  // Same payable total, different price and promotion: fingerprints must still differ.
  const promo=(await call("POST","/promotions",{name:"Mismo total, condiciones diferentes",type:"PERCENTAGE_DISCOUNT",percentage:20,isActive:true,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:null,productIds:[product.id],categoryIds:[]},"MANAGER",201)).data;
  await pool.query("update products set price=125000 where id=$1",[product.id]);
  const sameTotal=await summary(changed);assert.equal(sameTotal.total,old.total);assert.notEqual(sameTotal.quoteFingerprint,old.quoteFingerprint);assert.notEqual(sameTotal.commercialSignature,old.commercialSignature);
  await call("POST",`/delivery-quotes/${changed.q.id}/checkout`,accept(old),changed.role,409);
  await call("PATCH",`/promotions/${promo.id}/status`,{isActive:false},"MANAGER");await pool.query("update products set price=100000 where id=$1",[product.id]);
  const beforeStock=(await pool.query("select current_stock from products where id=$1",[product.id])).rows[0].current_stock;
  await pool.query("update products set current_stock=0 where id=$1",[product.id]);await call("POST",`/delivery-quotes/${changed.q.id}/checkout`,accept(old),changed.role,409);assert.equal(await orderCount(changed.q.id),0);await pool.query("update products set current_stock=$2 where id=$1",[product.id,beforeStock]);
  const correction=(await call("POST",`/delivery-quotes/${changed.q.id}/request-changes`,cmd(changed.q,{reason:"Revocar el importe aprobado para reevaluación"}),"MANAGER")).data.request;
  await call("POST",`/delivery-quotes/${changed.q.id}/checkout`,accept(old),changed.role,409);assert.equal(await orderCount(changed.q.id),0);
  await approve(correction,{amount:9000});await call("POST",`/delivery-quotes/${changed.q.id}/checkout`,accept(old),changed.role,409);
  console.log("PASS 3B stale commercial summaries: changed prices/promotions, equal total still different fingerprint, depleted stock, revoked/replaced approval, no order or payment without new acceptance");

  const rollback=await make(),rs=await summary(rollback);
  await pool.query("create function isolated_checkout_failure() returns trigger language plpgsql as $$ begin if NEW.type='ORDER_CREATED' then raise exception 'deliberate isolated checkout rollback'; end if;return NEW;end $$;create trigger isolated_checkout_failure before insert on delivery_quote_events for each row execute function isolated_checkout_failure()");
  await call("POST",`/delivery-quotes/${rollback.q.id}/checkout`,accept(rs),rollback.role,500);assert.equal(await orderCount(rollback.q.id),0);
  assert.equal((await pool.query("select count(*) from delivery_quote_events where request_id=$1 and type='ACCEPTED'",[rollback.q.id])).rows[0].count,"0");
  await pool.query("drop trigger isolated_checkout_failure on delivery_quote_events;drop function isolated_checkout_failure()");
  setFailLaunch(true);await call("POST",`/delivery-quotes/${rollback.q.id}/checkout`,accept(rs),rollback.role,502);setFailLaunch(false);assert.equal(await orderCount(rollback.q.id),1);
  const failed=(await call("GET",`/delivery-quotes/${rollback.q.id}/order`,null,rollback.role)).data;assert.equal(failed.status,"PAYMENT_FAILED");
  const retry=(await call("POST",`/delivery-quotes/${rollback.q.id}/payment`,{},rollback.role)).data;assert.equal(retry.orderId,failed.id);assert.equal(await orderCount(rollback.q.id),1);
  await callback(retry.token);assert.equal((await pool.query("select status from online_orders where id=$1",[failed.id])).rows[0].status,"PAID");
  console.log("PASS 3B deliberate rollback of acceptance/order/attempt, failed provider launch releases reservation, safe retry of the same persisted order without duplicate creation");

  for(const [reason,extra]of [["FREE_RADIUS",{routeConfirmed:true,distanceKm:5}],["FREE_CONDITIONAL",{coordinated:true}]]){
    const free=await make({}, {amount:0,reason,...extra}),fs=await summary(free);assert.equal(fs.deliveryFee,"0.00");assert.equal(fs.total,"500000.00");
    const fp=(await call("POST",`/delivery-quotes/${free.q.id}/checkout`,accept(fs),free.role)).data;await callback(fp.token);
  }
  console.log("PASS 3B explicitly approved radius/conditional free freight; no automatic discount and exact CLP persisted/payment totals");

  const expiring=await make(),es=await summary(expiring),unpaid=await make(),us=await summary(unpaid),late=await make(),ls=await summary(late);
  setFailLaunch(true);await call("POST",`/delivery-quotes/${unpaid.q.id}/checkout`,accept(us),unpaid.role,502);setFailLaunch(false);
  const unpaidOrder=(await call("GET",`/delivery-quotes/${unpaid.q.id}/order`,null,unpaid.role)).data;
  const latePayment=(await call("POST",`/delivery-quotes/${late.q.id}/checkout`,accept(ls),late.role)).data;
  const originalNow=Date.now;
  try{
    Date.now=()=>originalNow()+25*3600000;
    await call("POST",`/delivery-quotes/${expiring.q.id}/checkout`,accept(es),expiring.role,409);assert.equal(await orderCount(expiring.q.id),0);
    await call("GET",`/delivery-quotes/${expiring.q.id}/summary`,null,expiring.role,410);
    await call("POST",`/delivery-quotes/${unpaid.q.id}/payment`,{},unpaid.role,409);
    assert.equal((await pool.query("select count(*) from online_payments where order_id=$1",[unpaidOrder.id])).rows[0].count,"1");
    assert.equal((await pool.query("select total,status from online_orders where id=$1",[unpaidOrder.id])).rows[0].status,"PAYMENT_FAILED");
    const unpaidQuote=(await call("GET",`/delivery-quotes/${unpaid.q.id}`,null,unpaid.role)).data;
    await call("POST",`/delivery-quotes/${unpaid.q.id}/close-unpaid`,cmd(unpaidQuote,{reason:"Autorización vencida; cerrar intento y evaluar nuevamente"}),unpaid.role);
    await call("POST",`/delivery-quotes/${unpaid.q.id}/payment`,{},unpaid.role,409);
    await callback(latePayment.token);await callback(latePayment.token);
    assert.equal((await pool.query("select status from online_orders where id=$1",[latePayment.orderId])).rows[0].status,"PAID");
  }finally{Date.now=originalNow;}
  assert.equal((await pool.query("select total from online_orders where id=$1",[unpaidOrder.id])).rows[0].total,us.total);
  console.log("PASS 3B advanced test clock: expired approval blocks initial checkout/retry, no new reservation/attempt, explicit unpaid closure preserves amount, already-started late and duplicated callbacks still reconcile");

  const race=await make(),raceSummary=await summary(race);
  const raced=await Promise.all([call("POST",`/delivery-quotes/${race.q.id}/checkout`,accept(raceSummary),race.role,[200,409]),call("POST",`/delivery-quotes/${race.q.id}/request-changes`,cmd(race.q,{reason:"Corrección concurrente explícita antes de cobro"}),"ADMIN",[200,409])]);
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal(await orderCount(race.q.id),raced[0].status===200?1:0);
  if(raced[0].status===200)await callback(raced[0].data.token);
  console.log("PASS 3B concurrent revocation versus acceptance serializes to exactly one permitted decision");

  // Approval granted before the pending deadline keeps its own full validity window.
  const oldPending=(await pool.query("insert into delivery_quote_requests(client_id,request_key,request_hash,recipient_name,phone,address,commune,reference,non_urgent,status,assigned_to,policy_revision_id,commercial_snapshot,created_at,evaluation_expires_at) select $2,$3,request_hash,recipient_name,phone,address,commune,reference,non_urgent,'PROPOSED',$4,policy_revision_id,commercial_snapshot,now()-interval '73 hours',now()-interval '1 hour' from delivery_quote_requests where id=$1 returning id",[a.q.id,userIds.CLIENT21,randomUUID(),userIds.ADMIN])).rows[0];
  await pool.query("insert into delivery_quote_items(request_id,product_id,quantity,product_name,unit_measure) select $2,product_id,quantity,product_name,unit_measure from delivery_quote_items where request_id=$1",[a.q.id,oldPending.id]);
  const source=(await pool.query("insert into delivery_quote_revisions(request_id,version,kind,amount,reason,notes,policy_revision_id,created_by,created_at) values($1,1,'PROPOSAL',7500,'PAID_FREIGHT','Aprobación previa al vencimiento pendiente',$2,$3,now()-interval '2 hours') returning id",[oldPending.id,policy.id,userIds.ADMIN])).rows[0];
  await pool.query("insert into delivery_quote_revisions(request_id,version,kind,source_revision_id,amount,reason,notes,policy_revision_id,created_by,created_at,valid_until,products_net) select request_id,2,'APPROVED',id,amount,reason,notes,policy_revision_id,created_by,created_at,now()+interval '22 hours',500000 from delivery_quote_revisions where id=$1",[source.id]);
  await pool.query("update delivery_quote_requests set status='APPROVED',version=version+1 where id=$1",[oldPending.id]);
  assert.equal((await call("GET",`/delivery-quotes/${oldPending.id}`,null,"CLIENT21")).data.status,"APPROVED");
  assert.equal((await call("GET",`/delivery-quotes/${oldPending.id}/summary`,null,"CLIENT21")).data.total,"507500.00");
  console.log("PASS 3B 72/24-hour boundary: pending deadline passed but approval issued in time remains valid under its separate approval deadline");

  const headers={"X-Guest-Session":randomBytes(32).toString("base64url")},email="guest-checkout@example.test";
  const challengeId=await verify("verification",email,headers);
  const guest=(await call("POST",guestPath,{...payload(),guestName:"Invitado flete",guestEmail:email,challengeId},null,200,headers)).data;
  const gq=await approve(guest.request),access={"X-Delivery-Quote-Token":guest.accessToken};
  const gs=(await call("GET",`${guestPath}/${gq.id}/summary`,null,null,200,access)).data;
  await call("POST",`${guestPath}/${gq.id}/checkout`,accept(gs),null,404,{"X-Delivery-Quote-Token":randomBytes(32).toString("base64url")});
  const gp=(await call("POST",`${guestPath}/${gq.id}/checkout`,accept(gs),null,200,access)).data;
  assert.ok(gp.guestAccessToken);await callback(gp.token);assert.equal(await orderCount(gq.id),1);
  console.log("PASS 3B verified guest: quote-token-only ownership, own acceptance, single delivery order with device/tracking access and simulated Webpay confirmation");
}

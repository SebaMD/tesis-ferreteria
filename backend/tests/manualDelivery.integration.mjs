import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import jwt from "jsonwebtoken";

export async function testManualDelivery({ pool, call, base, users, snapshot, transactions, productId }) {
  const directory=(await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\","/");
  assert.match(directory,/\/fyf-bundle-test-[^/]+\/data$/);
  // Other regressions deliberately leave a pending order; use a distinct isolated client.
  const clientId=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'21000000-0','Cliente','Flete','delivery-client@example.test',password,'ACTIVE',now() from users where id=$1 returning id",[users.CLIENT])).rows[0].id;
  const auth=role=>({"Content-Type":"application/json",...(role?{Authorization:`Bearer ${jwt.sign({id:role==='CLIENT'?clientId:users[role]},process.env.SESSION_SECRET)}`}:{})});
  const request=async(method,route,body,role,expected,code,headers={})=>{
    const r=await fetch(base+route,{method,headers:{...auth(role),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));
    if(code)assert.equal(result.code,code);return result.data;
  };
  const original=await call("GET","/delivery-settings",null,"ADMIN");
  for(const role of [null,"CASHIER","WAREHOUSE","CLIENT"]){
    await call("GET","/delivery-settings",null,role,role?403:401);
    await call("PUT","/delivery-settings",{expectedRevisionId:original.id,deliveryEnabled:false,flatFee:3000,freeShippingFrom:null,isDemo:true},role,role?403:401);
  }
  const historical=(await pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,delivery_recipient_name,delivery_phone,delivery_address,delivery_commune,reservation_expires_at) values($1,$2,'CANCELLED',12345,'DELIVERY','Prueba histórica','123456789','Dirección histórica','Santa Juana',now()) returning *",[users.CLIENT,randomUUID()])).rows[0];
  const items=[{productId,quantity:1}], commerce=await snapshot();
  const paymentSnapshot=()=>pool.query("select * from online_payments order by id").then(r=>r.rows);
  const payments=await paymentSnapshot(), sdkCalls=transactions.size;
  let policy=original;
  const save=async(values,role="MANAGER")=>policy=await call("PUT","/delivery-settings",{expectedRevisionId:policy.id,deliveryEnabled:policy.deliveryEnabled,flatFee:Number(policy.flatFee),freeShippingFrom:policy.freeShippingFrom==null?null:Number(policy.freeShippingFrom),isDemo:policy.isDemo,...values},role);
  const immutable=(await pool.query("select * from delivery_policy_revisions order by id")).rows;
  for(const values of [{freeShippingFrom:500000},{freeShippingFrom:1,flatFee:0},{freeShippingFrom:null,flatFee:3000,isDemo:false}]){
    await save(values);
    const notice=await call("GET","/customer-notice");
    assert.equal(notice.deliveryAnnouncement.kind,"MANUAL_QUOTE");
    assert.doesNotMatch(JSON.stringify(notice.deliveryAnnouncement),/gratis|DEMO|3\.000|3000/);
    assert.equal(notice.deliveryInformation.conditionalFreeThresholdReference,500000);
    assert.equal(notice.deliveryInformation.conditionalBenefitEnabled,false);
    assert.equal(notice.deliveryInformation.onlineQuoteRequestsEnabled,false);
    assert.equal(notice.deliveryInformation.minimumOutboundKmPriceReference,1000);
    for(const role of [null,"CLIENT"]){
      await request("POST","/online-orders/quote",{items,deliveryType:"DELIVERY",deliveryCommune:"Concepción"},role,409,"DELIVERY_MANUAL_QUOTE_REQUIRED");
    }
    const pickup=await call("POST","/online-orders/quote",{items,deliveryType:"PICKUP"});
    assert.equal(pickup.deliveryFee,"0.00");assert.equal(pickup.deliveryBenefit.active,false);
    const delivery={items,deliveryType:"DELIVERY",deliveryRecipientName:"Destinatario aislado",deliveryPhone:"123456789",deliveryAddress:"Dirección de prueba",deliveryCommune:"Santa Juana",checkoutKey:randomUUID(),quoteFingerprint:pickup.quoteFingerprint};
    await request("POST","/online-orders/checkout",delivery,"CLIENT",409,"DELIVERY_MANUAL_QUOTE_REQUIRED");
    await request("POST","/online-orders/checkout",{...delivery,deliveryFee:0},"CLIENT",400);
    assert.deepEqual(await snapshot(),commerce);assert.deepEqual(await paymentSnapshot(),payments);assert.equal(transactions.size,sdkCalls);
  }
  const session=randomBytes(32).toString("base64url"), hash=v=>createHash("sha256").update(v).digest("hex");
  const challenge=(await pool.query("insert into email_verification_challenges(email,purpose,guest_session_hash,pin_hash,expires_at,last_sent_at,verified_at) values('manual-guest@example.test','GUEST_CHECKOUT',$1,$2,now()+interval '1 hour',now(),now()) returning *",[hash(session),hash("unused")])).rows[0];
  const guest={items,deliveryType:"DELIVERY",deliveryRecipientName:"Invitado aislado",deliveryPhone:"123456789",deliveryAddress:"Dirección de prueba",deliveryCommune:"Santa Juana",checkoutKey:randomUUID(),quoteFingerprint:"0".repeat(64),guestName:"Invitado de prueba",guestEmail:challenge.email,guestEmailConfirmation:challenge.email,guestPhone:"123456789",emailVerificationChallengeId:challenge.id};
  await request("POST","/online-orders/guest/checkout",guest,null,409,"DELIVERY_MANUAL_QUOTE_REQUIRED",{"X-Guest-Session":session});
  assert.deepEqual((await pool.query("select * from email_verification_challenges where id=$1",[challenge.id])).rows[0],challenge);
  await save({deliveryEnabled:false},"ADMIN");
  assert.equal((await call("GET","/customer-notice")).deliveryAnnouncement.kind,"SUSPENDED");
  await request("POST","/online-orders/quote",{items,deliveryType:"DELIVERY"},null,409,"DELIVERY_UNAVAILABLE");
  assert.equal((await call("POST","/online-orders/quote",{items,deliveryType:"PICKUP"})).deliveryFee,"0.00");
  await save({deliveryEnabled:true});
  assert.equal((await call("GET","/customer-notice")).deliveryAnnouncement.kind,"MANUAL_QUOTE");
  const raceBody={expectedRevisionId:policy.id,deliveryEnabled:true,flatFee:Number(policy.flatFee),freeShippingFrom:null,isDemo:policy.isDemo};
  const race=await Promise.all(["ADMIN","MANAGER"].map(role=>fetch(base+"/delivery-settings",{method:"PUT",headers:auth(role),body:JSON.stringify(raceBody)})));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);await Promise.all(race.map(r=>r.text()));
  assert.deepEqual((await pool.query("select * from delivery_policy_revisions order by id limit $1",[immutable.length])).rows,immutable);
  assert.deepEqual((await pool.query("select * from online_orders where id=$1",[historical.id])).rows[0],historical);
  assert.deepEqual(await snapshot(),commerce);assert.deepEqual(await paymentSnapshot(),payments);assert.equal(transactions.size,sdkCalls);
  // Restore test policy values only, as a new revision; never rewrite an old revision.
  policy=await call("GET","/delivery-settings",null,"ADMIN");
  await save({deliveryEnabled:original.deliveryEnabled,flatFee:Number(original.flatFee),freeShippingFrom:original.freeShippingFrom==null?null:Number(original.freeShippingFrom),isDemo:original.isDemo},"ADMIN");
  console.log("PASS manual delivery: CLIENT/guest blocked without approved freight; no orders/reserves/stock/payments/consumed challenge; zero automatic benefit, pickup, suspension/reactivation, actor permissions, immutable history and concurrent policy saves");
}

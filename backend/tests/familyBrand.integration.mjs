import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
export async function testFamilyBrand({pool,call,body,users}){
 users.BRAND_CLIENT=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'19888777-0','Marca','Cliente','brand-client@example.test',password,'ACTIVE',now() from users where id=$1 returning id",[users.CLIENT])).rows[0].id;
 for(const history of [false,true]){
  const b=body();b.family.brand="Toro Negor";b.variants.forEach(v=>{v.barcode=null;if(!history)v.initialStock=0;});b.variants[1].status=false;
  const created=await call("POST","/product-families/bundle",b,"ADMIN",200,true),id=created.familyId,endpoint=`/product-families/${id}/brand-corrections`;
  const pids=created.productIds;
  const raw=async()=>(await pool.query("select fyf_dimension_state($1) state",[id])).rows[0].state;
  const captures=async()=>(await pool.query("select * from commercial_identity_snapshots where product_id=any($1) order by id",[pids])).rows;
  let sale;
  if(history)sale=await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:pids[0],quantity:1}]},"CASHIER",201);
  if(history){
   const historicalOrder=(await pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,$2,'DELIVERED',1000,'PICKUP',now()) returning id",[users.BRAND_CLIENT,randomUUID()])).rows[0].id;
   await pool.query("insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,$2,1,1000,1000)",[historicalOrder,pids[0]]);
  }
  const before=await raw();
  const snap=await call("GET",`/product-families/${id}/bundle`,null,"ADMIN");
  const input={brand:" Toro   Negro ",reason:"Corrección de marca registrada con una errata",expectedRevision:snap.revision,operationKey:randomUUID(),confirmed:true};
  for(const role of [undefined,"CLIENT","WAREHOUSE","CASHIER","MANAGER"])for(const method of ["POST","GET"])await call(method,method==="POST"?endpoint:`${endpoint}/${input.operationKey}`,method==="POST"?input:null,role,role?403:401);
  const {familyBrandOperation}=await import("../dist/modules/productFamilies/familyBrand.service.js");
  await assert.rejects(familyBrandOperation(id,users.MANAGER,input),e=>e.statusCode===403);
  for(const patch of [{brand:""},{brand:"Toro Negor"},{brand:"x\ny"},{reason:"x"},{unitMeasure:"caja"}])await call("POST",endpoint,{...input,...patch},"ADMIN",400);
  await call("POST",endpoint,{...input,expectedRevision:"a".repeat(64)},"ADMIN",409);
  await assert.rejects(pool.query("update product_families set brand='Otra' where id=$1",[id]),/audited/);
  await assert.rejects(pool.query("update products set brand='Otra' where id=$1",[pids[0]]),/audit/);
  // A pending request blocks even a zero-stock SKU with no sales, orders or ENTRY.
  const policy=(await pool.query("select id from delivery_policy_revisions order by id desc limit 1")).rows[0].id;
  const pending=(await pool.query("insert into delivery_quote_requests(client_id,request_key,request_hash,recipient_name,phone,address,commune,policy_revision_id,commercial_snapshot,evaluation_expires_at) values($1,$2,$3,'Receptor','123456789','Dirección aislada','Concepción',$4,'{}',now()+interval '1 day') returning id",[users.CLIENT,randomUUID(),"d".repeat(64),policy])).rows[0].id;
  await pool.query("insert into delivery_quote_items(request_id,product_id,quantity,product_name,unit_measure) values($1,$2,1,$3,'unidad')",[pending,pids[1],b.variants[1].name]);
  await call("POST",endpoint,input,"ADMIN",409);
  await pool.query("update delivery_quote_requests set status='CANCELLED',version=version+1 where id=$1",[pending]);
  const historical=await captures();
  const injection=await pool.connect();
  try{
   await injection.query("begin");
   await injection.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,$3,jsonb_build_object('state',fyf_dimension_state($1),'revision',$4::text,'transactionId',pg_current_xact_id()::text),jsonb_build_object('operation','FAMILY_BRAND_AUTHORIZATION','operationKey',$5::text,'requestHash',$4::text,'brand','Toro Negro'))",[id,users.ADMIN,input.reason,"a".repeat(64),randomUUID()]);
   await assert.rejects(injection.query("update products set brand='Toro Negro',price=price+1 where id=$1",[pids[0]]),e=>e.code==="23514");
  }finally{await injection.query("rollback");injection.release();}
  assert.deepEqual(await raw(),before);
  const incomplete=await pool.connect();
  try{
   await incomplete.query("begin");
   await incomplete.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,$3,jsonb_build_object('state',fyf_dimension_state($1),'revision',$4::text,'transactionId',pg_current_xact_id()::text),jsonb_build_object('operation','FAMILY_BRAND_AUTHORIZATION','operationKey',$5::text,'requestHash',$4::text,'brand','Toro Negro'))",[id,users.ADMIN,input.reason,"a".repeat(64),randomUUID()]);
   await assert.rejects(incomplete.query("commit"),e=>e.code==="23514");
  }finally{await incomplete.query("rollback");incomplete.release();}
  const promos=[];
  for(let i=0;i<2;i++)promos.push((await pool.query("insert into promotions(name,type,is_active,percentage) values($1,'PERCENTAGE_DISCOUNT',true,10) returning id",[`Marca aislada ${randomUUID()}`])).rows[0].id);
  await pool.query("insert into promotion_products(promotion_id,product_id) values($1,$3),($2,$3)",[...promos,pids[1]]);
  try{await call("POST",endpoint,input,"ADMIN",409);}finally{await pool.query("update promotions set is_active=false where id=any($1)",[promos]);}
  await pool.query("create function fail_brand_audit_test() returns trigger language plpgsql as $$ begin if NEW.next->>'operation'='FAMILY_BRAND_CORRECTION' then raise exception 'deliberate brand audit failure'; end if; return NEW; end $$;create trigger fail_brand_audit_test before insert on product_family_events for each row execute function fail_brand_audit_test()");
  try{await call("POST",endpoint,input,"ADMIN",500);}finally{await pool.query("drop trigger fail_brand_audit_test on product_family_events;drop function fail_brand_audit_test()");}
  assert.deepEqual(await raw(),before);assert.equal(await call("GET",`${endpoint}/${input.operationKey}`,null,"ADMIN"),null);
  const [a,c]=await Promise.all([call("POST",endpoint,input,"ADMIN"),call("POST",endpoint,input,"ADMIN")]);assert.notEqual(a.replayed,c.replayed);
  const after=await raw();
  assert.equal(after.family.brand,"Toro Negro");assert.equal(after.members.length,before.members.length);
  const unchanged=s=>({...s,family:{...s.family,brand:null,updated_at:null},members:s.members.map(m=>({...m,product:{...m.product,brand:null,updated_at:null}}))});
  assert.deepEqual(unchanged(after),unchanged(before));
  assert.ok(after.members.every(m=>m.product.brand==="Toro Negro"));assert.deepEqual(await captures(),historical);
  const result=await call("GET",`${endpoint}/${input.operationKey}`,null,"ADMIN");assert.equal(result.brand,"Toro Negro");assert.equal(result.previousBrand,"Toro Negor");
  await call("POST",endpoint,{...input,brand:"Otro fabricante"},"ADMIN",409);
  await call("POST",endpoint,{...input,operationKey:randomUUID()},"ADMIN",409);
  assert.equal((await pool.query("select count(*)::int n from product_family_events where next->>'operationKey'=$1",[input.operationKey])).rows[0].n,2);
  await assert.rejects(pool.query("update product_family_events set reason='alterada' where next->>'operationKey'=$1",[input.operationKey]),/immutable/);
  await assert.rejects(pool.query("delete from product_family_events where next->>'operationKey'=$1",[input.operationKey]),/immutable/);
  assert.equal((await call("GET",`/catalog/families/${id}`)).brand,"Toro Negro");
  if(!history){
   const fresh=await call("GET",`/product-families/${id}/bundle`,null,"ADMIN");
   const race=await Promise.all(["Toro Negro oficial","Toro Negro registrado"].map(brand=>call("POST",endpoint,{...input,brand,expectedRevision:fresh.revision,operationKey:randomUUID()},"ADMIN",[200,409])));
   assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  }
  if(history){
   const old=await call("GET",`/sales/${sale.id}`,null,"ADMIN");assert.equal(old.details[0].historicalIdentity.identity.brand,"Toro Negor");
   const future=await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:pids[0],quantity:1}]},"CASHIER",201);assert.equal(future.details[0].historicalIdentity.identity.brand,"Toro Negro");
   const cart={items:[{productId:pids[0],quantity:1}],deliveryType:"PICKUP"},q=await call("POST","/online-orders/quote",cart);
   await call("POST","/online-orders/checkout",{...cart,checkoutKey:randomUUID(),quoteFingerprint:q.quoteFingerprint},"BRAND_CLIENT",201);
   const latest=await call("GET",`/product-families/${id}/bundle`,null,"ADMIN");
   await call("POST",endpoint,{...input,brand:"Toro Negro corregido",operationKey:randomUUID(),expectedRevision:latest.revision},"ADMIN",409);
  }
 }
 console.log("PASS marca: ADMIN, sin/con historial, inactivos, identidad/capturas, pendientes sin ENTRY, revisión, carrera idempotente, recuperación, auditoría, rollback deliberado, catálogo y operaciones futuras");
}

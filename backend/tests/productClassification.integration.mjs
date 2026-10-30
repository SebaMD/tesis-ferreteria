import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testProductClassification({pool,call,body,users,base}){
 assert.equal((await pool.query('show server_version')).rows[0].server_version,'16.15');
 const categoryId=body().family.categoryId;
 const destination=await call('POST','/categories',{name:'Categoría destino '+randomUUID(),description:''},'ADMIN',201);
 const make=()=>call('POST','/products',{categoryId,name:'SKU simple '+randomUUID(),brand:'Boschh',unitMeasure:'unidad',price:1000},'ADMIN',201);
 const load=id=>call('GET',`/products/${id}`,null,'ADMIN');
 const command=(p,field,value)=>({field,value,previousValue:field==='brand'?p.brand:p.categoryId,expectedRevision:new Date(p.updatedAt).toISOString(),reason:'Corrección descriptiva del mismo artículo',confirmed:true,operationKey:randomUUID()});
 const endpoint=id=>`/products/${id}/classification-corrections`;
 let p=await make();const simpleId=p.id;
 for(const role of [null,'MANAGER','CLIENT','CASHIER','WAREHOUSE']){await call('POST',endpoint(p.id),command(p,'brand','Bosch'),role,role?403:401);await call('GET',`${endpoint(p.id)}/${randomUUID()}`,null,role,role?403:401);}
 const service=(await import('../dist/modules/products/productClassification.service.js')).productClassificationOperation;
 await assert.rejects(()=>service(p.id,users.MANAGER,command(p,'brand','Bosch')),e=>e.statusCode===403);
 const c=command(p,'brand','Bosch'),races=await Promise.all([call('POST',endpoint(p.id),c,'ADMIN'),call('POST',endpoint(p.id),c,'ADMIN')]);
 assert.notEqual(races[0].replayed,races[1].replayed);assert.equal((await call('GET',`${endpoint(p.id)}/${c.operationKey}`,null,'ADMIN')).value,'Bosch');
 assert.equal((await pool.query("select count(*)::int n from product_family_events where next->>'operationKey'=$1",[c.operationKey])).rows[0].n,1);
 await call('POST',endpoint(p.id),{...c,value:'Otra'},'ADMIN',409);await call('POST',endpoint(p.id),{...c,operationKey:randomUUID()},'ADMIN',409);
 p=await load(p.id);for(const invalid of [{reason:''},{confirmed:false},{previousValue:'Vieja'},{value:'Bosch'},{field:'unit'},{price:1}])await call('POST',endpoint(p.id),{...command(p,'brand','Bosch corregida'),...invalid},'ADMIN',invalid.previousValue?409:400);
 const race=await Promise.all([call('POST',endpoint(p.id),command(p,'brand','Bosch A'),'ADMIN',[200,409]),call('POST',endpoint(p.id),command(p,'brand','Bosch B'),'ADMIN',[200,409])]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 // Existing descriptive audits must not masquerade as former family associations.
 await call('GET',`/product-families/conversion/${simpleId}`,null,'ADMIN');
 const cleanCategory=await make();await call('POST',endpoint(cleanCategory.id),command(cleanCategory,'category',destination.id),'ADMIN');
 assert.equal((await load(cleanCategory.id)).categoryId,destination.id);assert.equal((await load(cleanCategory.id)).hasHistory,false);
 p=await load(simpleId);await call('POST','/inventory',{productId:p.id,movementType:'ENTRY',quantity:10,reason:'Ingreso de prueba'},'ADMIN',201);
 await call('POST','/sales',{paymentMethod:'efectivo',details:[{productId:p.id,quantity:1}]},'CASHIER',201);
 const input={items:[{productId:p.id,quantity:1}],deliveryType:'PICKUP'},q=await call('POST','/online-orders/quote',input);
 const order=await call('POST','/online-orders/checkout',{...input,checkoutKey:randomUUID(),quoteFingerprint:q.quoteFingerprint},'CLIENT',201);
 p=await load(p.id);await call('POST',endpoint(p.id),command(p,'brand','Bosch definitivo'),'ADMIN',409);await call('POST',endpoint(p.id),command(p,'category',destination.id),'ADMIN',409);
 const cb=await fetch(base+'/online-orders/payments/webpay/return',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token_ws:order.token})});assert.equal(cb.status,303);
 for(const action of ['start-preparation','finish-preparation'])await call('POST',`/order-logistics/online/${order.orderId}/${action}`,{},'WAREHOUSE');
 await call('POST',`/order-logistics/online/${order.orderId}/complete-delivery`,{receiverName:'Receptor de prueba',receiverRut:'11111111-1'},'WAREHOUSE');
 const state=async()=>Object.fromEntries(await Promise.all(['products','product_family_events','commercial_identity_snapshots','inventory_movements','sales','sale_details','online_orders','online_order_items','online_payments'].map(async t=>[t,(await pool.query(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows])));
 let before=await state();p=await load(p.id);await call('POST',endpoint(p.id),command(p,'brand','Bosch definitivo'),'ADMIN');
 let after=await state();for(const t of Object.keys(before).filter(t=>!['products','product_family_events'].includes(t)))assert.deepEqual(after[t],before[t],t);
 const original=await load(p.id);before=await state();await call('POST',endpoint(p.id),command(original,'category',destination.id),'ADMIN');after=await state();
 for(const t of Object.keys(before).filter(t=>!['products','product_family_events'].includes(t)))assert.deepEqual(after[t],before[t],t);
 const current=await load(p.id);for(const f of ['id','name','brand','price','barcode','currentStock','unitMeasure','minimumStock','variantKey','images'])assert.deepEqual(current[f],original[f],f);assert.equal(current.categoryId,destination.id);
 await assert.rejects(pool.query("update products set brand='SQL no autorizado' where id=$1",[p.id]),e=>e.code==='23514');
 await assert.rejects(pool.query('update products set category_id=$2 where id=$1',[p.id,categoryId]),e=>e.code==='23514');
 await assert.rejects(pool.query("update products set unit_measure='caja' where id=$1",[p.id]),e=>e.code==='23514');
 await call('PATCH',`/products/${p.id}`,{categoryId},'ADMIN',409);
 const familyBody=body();familyBody.variants.forEach(v=>{v.barcode=null;});const family=await call('POST','/product-families/bundle',familyBody,'ADMIN',200,true);
 const member=await load(family.productIds[0]);await call('POST',endpoint(member.id),command(member,'brand','Bosch'),'ADMIN',409);
 const duplicate=await make();await call('POST','/products',{categoryId:destination.id,name:duplicate.name,unitMeasure:'unidad',price:1000},'ADMIN',201);
 await call('POST',endpoint(duplicate.id),command(duplicate,'category',destination.id),'ADMIN',409);
 // Promotion scopes must not become incompatible, even for a currently inactive SKU.
 const promo=await make();const dates={startsAt:new Date(Date.now()-1000).toISOString(),endsAt:null};
 await call('POST','/promotions',{name:'Directa '+randomUUID(),type:'PERCENTAGE_DISCOUNT',percentage:5,isActive:true,...dates,productIds:[promo.id],categoryIds:[]},'ADMIN',201);
 await call('POST','/promotions',{name:'Destino '+randomUUID(),type:'PERCENTAGE_DISCOUNT',percentage:5,isActive:true,...dates,productIds:[],categoryIds:[destination.id]},'ADMIN',201);
 await call('POST',endpoint(promo.id),command(promo,'category',destination.id),'ADMIN',409);
 const rollback=await make(),b=command(rollback,'brand','Marca corregida');before=await state();
 await pool.query(`create function fail_simple_classification_test() returns trigger language plpgsql as $$ begin if NEW.id=${rollback.id} then raise exception 'injected failure'; end if; return NEW; end $$; create trigger fail_simple_classification_test before update on products for each row execute function fail_simple_classification_test()`);
 await call('POST',endpoint(rollback.id),b,'ADMIN',500);assert.deepEqual(await state(),before);
 await pool.query('drop trigger fail_simple_classification_test on products; drop function fail_simple_classification_test()');await call('POST',endpoint(rollback.id),b,'ADMIN');
 await assert.rejects(pool.query("delete from product_family_events where next->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION'"),/immutable/);
 // An audit without its exact product change must fail at COMMIT.
 const tx=await pool.connect();try{await tx.query('begin');const raw=(await tx.query('select to_jsonb(p) p,pg_current_xact_id()::text x from products p where id=$1',[rollback.id])).rows[0];
 await tx.query("insert into product_family_events(product_id,user_id,reason,previous,next) values($1,$2,'Auditoría incompleta de prueba',$3,$4)",[rollback.id,users.ADMIN,{product:raw.p,transactionId:raw.x},{operation:'PRODUCT_CLASSIFICATION_CORRECTION',field:'brand',previousValue:raw.p.brand,value:'Sin aplicar',operationKey:randomUUID(),requestHash:'a'.repeat(64),revision:new Date().toISOString()}]);await assert.rejects(tx.query('commit'),e=>e.code==='23514');
 }finally{await tx.query('rollback');tx.release();}
 const audit=await call('GET',`/product-audits?operation=PRODUCT_CLASSIFICATION_CORRECTION&productId=${p.id}`,null,'ADMIN');assert.ok(audit.items.length>=2);assert.ok(audit.items.every(e=>e.reason&&e.actor.id===users.ADMIN&&e.subject.productId===p.id));assert.ok(audit.items.some(e=>e.changes[0].field==='Categoría'));
 const future=(await call('GET',`/catalog/products/${p.id}`));assert.equal(future.brand,current.brand);assert.equal(future.categoryId,current.categoryId);
 console.log('PASS clasificación simple: marca/categoría sin/con ENTRY, venta/pedido finalizado, snapshots/IDs intactos, pendientes, permisos, valor/revisión, concurrencia, replay/recuperación, colisión/promociones, familia excluida, rollback, SQL/COMMIT e historial administrativo');
}

import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function testFamilyDeactivation({pool,call,body,users}){
 assert.equal((await pool.query('select inet_server_port() p')).rows[0].p,55447);
 const make=async()=>{const b=body();b.family.name='Familia desactivación '+randomUUID();b.variants.forEach((v,i)=>{v.name='SKU desactivación '+randomUUID();v.barcode=null;v.initialStock=5+i;});b.variants.push({name:'SKU previamente inactivo '+randomUUID(),price:1000,selections:[0,1],initialStock:0,status:false});return call('POST','/product-families/bundle',b,'ADMIN');};
 const load=f=>call('GET',`/product-families/${f.familyId}/bundle`,null,'ADMIN');
 const input=async f=>({operationKey:randomUUID(),expectedRevision:(await load(f)).revision,reason:'Retiro temporal de la familia completa',confirmed:true});
 const endpoint=f=>`/product-families/${f.familyId}/deactivations`;
 const raw=async f=>(await pool.query('select * from products where family_id=$1 order by id',[f.familyId])).rows;
 const snapshots=async f=>(await pool.query('select to_jsonb(s) r from commercial_identity_snapshots s where product_id=any($1) order by id',[f.productIds])).rows;
 const eventCount=async f=>(await pool.query("select count(*)::int n from product_family_events where family_id=$1 and next->>'operation'='FAMILY_DEACTIVATE'",[f.familyId])).rows[0].n;
 const f=await make(),command=await input(f);const before=await raw(f),captures=await snapshots(f);
 for(const role of [null,'CLIENT','MANAGER','WAREHOUSE','CASHIER'])await call('POST',endpoint(f),command,role,role?403:401);
 const service=(await import('../dist/modules/productFamilies/familyDeactivation.service.js')).familyDeactivationOperation;
 await assert.rejects(()=>service(f.familyId,users.CLIENT,command),e=>e.statusCode===403);
 await call('POST',endpoint(f),{...command,confirmed:false},'ADMIN',400);await call('POST',endpoint(f),{...command,price:1},'ADMIN',400);assert.deepEqual(await raw(f),before);
 const [a,b]=await Promise.all([call('POST',endpoint(f),command,'ADMIN'),call('POST',endpoint(f),command,'ADMIN')]);assert.notEqual(a.replayed,b.replayed);assert.equal(await eventCount(f),1);assert.deepEqual(a.productIds,f.productIds.slice(0,2));assert.deepEqual(a.previouslyInactiveProductIds,[f.productIds[2]]);
 const after=await raw(f);for(const p of after){const old=before.find(v=>v.id===p.id);assert.equal(p.status,false);assert.deepEqual({...p,status:old.status,updated_at:old.updated_at},old);if(!old.status)assert.deepEqual(p,old);}
 assert.deepEqual(await snapshots(f),captures);assert.equal((await call('GET',endpoint(f)+'/'+command.operationKey,null,'ADMIN')).operationKey,command.operationKey);
 await call('POST',endpoint(f),{...command,reason:'Otro motivo de desactivación'},'ADMIN',409);assert.equal(await eventCount(f),1);
 // Reactivation is deliberately individual: no previously inactive SKU is enabled.
 await call('PATCH',`/products/${f.productIds[0]}`,{status:true},'ADMIN');const reactivated=await raw(f);assert.deepEqual(reactivated.map(p=>p.status),[true,false,false]);
 const audits=await call('GET',`/product-audits?familyId=${f.familyId}&operation=FAMILY_DEACTIVATE`,null,'ADMIN');assert.equal(audits.items.length,1);assert.equal(audits.items[0].label,'Desactivación de variantes de la familia');assert.ok(audits.items[0].reason);
 const stale=await make(),old=await input(stale);await call('PATCH',`/products/${stale.productIds[0]}`,{price:1234},'ADMIN');const changed=await raw(stale);await call('POST',endpoint(stale),old,'ADMIN',409);assert.deepEqual(await raw(stale),changed);
 const rollback=await make(),rb=await input(rollback),rbBefore=await raw(rollback);
 await pool.query("create function fail_family_deactivation_test() returns trigger language plpgsql as $$begin if NEW.next->>'operation'='FAMILY_DEACTIVATE' then raise exception 'injected audit failure';end if;return NEW;end$$;create trigger fail_family_deactivation_test before insert on product_family_events for each row execute function fail_family_deactivation_test()");
 try{await call('POST',endpoint(rollback),rb,'ADMIN',500);assert.deepEqual(await raw(rollback),rbBefore);assert.equal(await eventCount(rollback),0);assert.equal(await call('GET',endpoint(rollback)+'/'+rb.operationKey,null,'ADMIN'),null);}finally{await pool.query('drop trigger fail_family_deactivation_test on product_family_events;drop function fail_family_deactivation_test()');}
 await call('POST',endpoint(rollback),rb,'ADMIN');assert.equal(await eventCount(rollback),1);
 const {createClientDeliveryQuote,actOnDeliveryQuote,saveManualDeliverySettings}=await import('../dist/modules/deliveryQuotes/deliveryQuotes.service.js');
 // Own client and explicit enabled policy: previous suites intentionally leave other clients/policies constrained.
 const policy=(await pool.query('select current_revision_id from delivery_settings where id=1')).rows[0];await saveManualDeliverySettings(users.ADMIN,{expectedRevisionId:policy?.current_revision_id??null,deliveryEnabled:true,conditionalFreeEnabled:false});
 users.FAMILY_CLIENT=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values((select id from roles where name='CLIENT'),'29999999-0','Cliente','Desactivación',$1,'unused','ACTIVE',now()) returning id",['family-'+randomUUID()+'@example.test'])).rows[0].id;
 const request=id=>({requestKey:randomUUID(),items:[{productId:id,quantity:1}],recipientName:'Prueba aislada',phone:'123456789',address:'Sector de prueba',commune:'Santa Juana',nonUrgent:false});
 const pending=await make(),pc=await input(pending),pb=await raw(pending);let q=(await createClientDeliveryQuote(users.FAMILY_CLIENT,request(pending.productIds[0]))).request;
 await call('POST',endpoint(pending),pc,'ADMIN',409);assert.deepEqual(await raw(pending),pb);
 const proposed=await actOnDeliveryQuote(q.id,{userId:users.ADMIN},'PROPOSE',{commandKey:randomUUID(),expectedVersion:q.version,amount:3000,reason:'PAID_FREIGHT',vehicle:'Prueba',distanceKm:1,trips:1,routeConfirmed:true,coordinated:false,notes:'Propuesta para prueba aislada'});
 await actOnDeliveryQuote(q.id,{userId:users.ADMIN},'APPROVE',{commandKey:randomUUID(),expectedVersion:proposed.request.version,proposalRevisionId:proposed.revisionId,reason:'Aprobación de prueba aislada'});
 await call('POST',endpoint(pending),pc,'ADMIN',409);assert.deepEqual(await raw(pending),pb);
 const ordered=await make(),oc=await input(ordered),ob=await raw(ordered);const quote=await call('POST','/online-orders/quote',{items:[{productId:ordered.productIds[0],quantity:1}],deliveryType:'PICKUP'},null);
 await call('POST','/online-orders/checkout',{checkoutKey:randomUUID(),items:[{productId:ordered.productIds[0],quantity:1}],deliveryType:'PICKUP',quoteFingerprint:quote.quoteFingerprint},'FAMILY_CLIENT',201);
 const committed=await raw(ordered);await call('POST',endpoint(ordered),oc,'ADMIN',409);assert.deepEqual(await raw(ordered),committed);assert.deepEqual(committed.map(p=>p.current_stock),ob.map(p=>p.current_stock));
 const race=await make(),rc=await input(race);const outcomes=await Promise.allSettled([service(race.familyId,users.ADMIN,rc),createClientDeliveryQuote(users.FAMILY_CLIENT,request(race.productIds[0]))]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);const raceRows=await raw(race);if(outcomes[0].status==='fulfilled')assert.ok(raceRows.every(p=>p.status===false));else assert.deepEqual(raceRows.map(p=>p.status),[true,true,false]);
 console.log('PASS family deactivation: ADMIN, mixed states, all SKU fields/snapshots preserved, individual reactivation, audit, concurrency/replay/recovery, stale revision, audit rollback, pending/approved dispatch and operational order, concurrent commitment');
}

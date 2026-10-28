import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
export async function testFamilyDimension({pool,call,body,users}){
 const input=body();input.family.attributes=input.family.attributes.slice(0,1);input.family.attributes[0].name="Medida";input.family.attributes[0].options=[{label:"400 ml"},{label:"200 ml"}];input.variants.forEach((v,i)=>{v.barcode=null;v.selections=v.selections.slice(0,1);v.status=i===0;});
 input.images=[{mimeType:"image/png",authorized:true,data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII="}];input.variants[0].imageIndexes=[0];
 const created=await call("POST","/product-families/bundle",input,"ADMIN",200,true),id=created.familyId;
 const endpoint=`/product-families/${id}/dimension-additions`,get=()=>call("GET",`/product-families/${id}/bundle`,null,"ADMIN");
 const originalSale=await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:created.productIds[0],quantity:1}]},"CASHIER",201);
 const initial=await get(),state=async()=> (await pool.query("select fyf_dimension_state($1) s",[id])).rows[0].s;
 const before=await state();let captures=(await pool.query("select * from commercial_identity_snapshots where product_id=any($1) order by id",[created.productIds])).rows;
 const command={name:"Color",options:["Negro","Azul"],assignments:created.productIds.map(productId=>({productId,optionIndex:0})),reason:"Se confirma el color físico de los artículos existentes",confirmed:true,expectedRevision:initial.revision,operationKey:randomUUID()};
 for(const role of [undefined,"CLIENT","CASHIER","WAREHOUSE","MANAGER"]){await call("POST",endpoint,command,role,role?403:401);await call("GET",`${endpoint}/${command.operationKey}`,null,role,role?403:401);}
 const {familyDimensionOperation}=await import("../dist/modules/productFamilies/familyDimension.service.js");await assert.rejects(familyDimensionOperation(id,users.MANAGER,command),e=>e.statusCode===403);
 for(const change of [{name:""},{options:["Negro"," negro "]},{assignments:command.assignments.slice(0,1)},{assignments:[command.assignments[0],command.assignments[0]]},{assignments:[command.assignments[0],{productId:999999,optionIndex:0}]},{assignments:command.assignments.map(a=>({...a,optionIndex:99}))},{price:1},{confirmed:false}])await call("POST",endpoint,{...command,...change},"ADMIN",400);
 await call("POST",endpoint,{...command,name:initial.family.attributes[0].name},"ADMIN",409);
 await call("POST",endpoint,{...command,expectedRevision:"a".repeat(64)},"ADMIN",409);
 const policy=(await pool.query("select id from delivery_policy_revisions order by id desc limit 1")).rows[0].id;
 const pending=(await pool.query("insert into delivery_quote_requests(client_id,request_key,request_hash,recipient_name,phone,address,commune,policy_revision_id,commercial_snapshot,evaluation_expires_at) values($1,$2,$3,'Receptor','123456789','Dirección aislada','Concepción',$4,'{}',now()+interval '1 day') returning id",[users.CLIENT,randomUUID(),'d'.repeat(64),policy])).rows[0].id;
 await pool.query("insert into delivery_quote_items(request_id,product_id,quantity,product_name,unit_measure) values($1,$2,1,$3,$4)",[pending,created.productIds[0],before.members[0].product.name,before.members[0].product.unit_measure]);
 await call("POST",endpoint,command,"ADMIN",409);assert.deepEqual(await state(),before);
 await pool.query("update delivery_quote_requests set status='CANCELLED',version=version+1 where id=$1",[pending]);
 const pendingReturn=(await pool.query("insert into sale_cancellation_requests(sale_id,requested_by,reason) values($1,$2,'Revisión aislada de devolución') returning id",[originalSale.id,users.CASHIER])).rows[0].id;
 await call("POST",endpoint,command,"ADMIN",409);await pool.query("update sale_cancellation_requests set status='REJECTED',reviewed_by=$2,reviewed_at=now() where id=$1",[pendingReturn,users.ADMIN]);
 await pool.query("insert into sale_deliveries(sale_id,recipient_name,recipient_rut,phone,address,commune) values($1,'Receptor','11111111-1','123456789','Dirección aislada','Concepción')",[originalSale.id]);
 await call("POST",endpoint,command,"ADMIN",409);await pool.query("update sale_deliveries set status='DELIVERED' where sale_id=$1",[originalSale.id]);
 captures=(await pool.query("select * from commercial_identity_snapshots where product_id=any($1) order by id",[created.productIds])).rows;
 await pool.query("create function tamper_dimension_auth_test() returns trigger language plpgsql as $$ begin if NEW.next->>'operation'='DIMENSION_ADD_AUTHORIZATION' then NEW.previous=jsonb_set(NEW.previous,'{state,members,0,product,price}','999');end if;return NEW;end $$;create trigger a_tamper_dimension_auth_test before insert on product_family_events for each row execute function tamper_dimension_auth_test()");
 try{await call("POST",endpoint,command,"ADMIN",409);}finally{await pool.query("drop trigger a_tamper_dimension_auth_test on product_family_events;drop function tamper_dimension_auth_test()");}
 assert.deepEqual(await state(),before);
 // Prove complete rollback even after all product classifications were updated.
 await pool.query("create function fail_dimension_audit_test() returns trigger language plpgsql as $$ begin if NEW.next->>'operation'='DIMENSION_ADD' then raise exception 'deliberate dimension audit failure'; end if;return NEW;end $$;create trigger fail_dimension_audit_test before insert on product_family_events for each row execute function fail_dimension_audit_test()");
 try{await call("POST",endpoint,command,"ADMIN",500);}finally{await pool.query("drop trigger fail_dimension_audit_test on product_family_events;drop function fail_dimension_audit_test()");}
 assert.deepEqual(await state(),before);assert.equal(await call("GET",`${endpoint}/${command.operationKey}`,null,"ADMIN"),null);
 const [one,two]=await Promise.all([call("POST",endpoint,command,"ADMIN"),call("POST",endpoint,command,"ADMIN")]);assert.notEqual(one.replayed,two.replayed);
 const after=await state();assert.equal(after.attributes.length,2);assert.deepEqual(after.attributes[0],before.attributes[0]);assert.deepEqual(after.options.filter(o=>o.attribute_id===before.attributes[0].id),before.options);
 for(let i=0;i<before.members.length;i++){const {variant_key:oldKey,updated_at:oldTime,...old}=before.members[i].product;const {variant_key:newKey,updated_at:newTime,...current}=after.members[i].product;assert.deepEqual(current,old);assert.ok(newKey.startsWith(oldKey+","));assert.ok(newTime&&oldTime);assert.deepEqual(after.members[i].values.slice(0,-1),before.members[i].values);}
 assert.deepEqual(after.images,before.images);assert.deepEqual((await pool.query("select * from commercial_identity_snapshots where product_id=any($1) order by id",[created.productIds])).rows,captures);
 assert.equal((await pool.query("select count(*)::int n from product_family_events where next->>'operationKey'=$1",[command.operationKey])).rows[0].n,2);
 const recovered=await call("GET",`${endpoint}/${command.operationKey}`,null,"ADMIN");assert.equal(recovered.attributeId,one.attributeId);
 await call("POST",endpoint,{...command,name:"Otro"},"ADMIN",409);await call("POST",endpoint,{...command,operationKey:randomUUID()},"ADMIN",409);
 await assert.rejects(pool.query("update products set variant_key=$2 where id=$1",[created.productIds[0],before.members[0].product.variant_key]),/identity cannot change/);
 await assert.rejects(pool.query("update product_family_events set reason='alterado' where next->>'operationKey'=$1",[command.operationKey]),/immutable/);
 const snapshot=await get();const f=snapshot.family;
 const variants=snapshot.variants.map(v=>({id:v.id,name:v.name,price:Number(v.price),barcode:v.barcode,minimumStock:v.minimumStock,status:v.status,inStoreOnly:v.inStoreOnly,selections:f.attributes.map(a=>a.options.findIndex(o=>v.variantOptionIds.includes(o.id)))}));
 const nextPayload={operationKey:randomUUID(),familyId:id,expectedRevision:snapshot.revision,family:{name:f.name,brand:f.brand,description:f.description,categoryId:f.categoryId,attributes:f.attributes.map(a=>({id:a.id,name:a.name,options:a.options.map(o=>({id:o.id,label:o.label}))}))},unitMeasure:"unidad",variants:[...variants,{name:`Azul nuevo ${randomUUID()}`,price:1000,minimumStock:2,initialStock:3,status:true,inStoreOnly:false,selections:[0,1]}]};
 const added=await call("POST","/product-families/bundle",nextPayload,"ADMIN",200,true);assert.equal(added.productIds.length,3);assert.equal((await get()).variants.find(p=>!created.productIds.includes(p.id)).currentStock,3);
 const publicFamily=await call("GET",`/catalog/families/${id}`);assert.equal(publicFamily.attributes.length,2);assert.ok(publicFamily.variants.every(v=>v.variantValues.length===2));
 const current=await get(),third={...command,name:"Formato",options:["Estándar"],assignments:current.variants.map(v=>({productId:v.id,optionIndex:0})),operationKey:randomUUID(),expectedRevision:current.revision};
 const race=await Promise.all([call("POST",endpoint,third,"ADMIN",[200,409]),call("POST",endpoint,{...third,name:"Embalaje",operationKey:randomUUID()},"ADMIN",[200,409])]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await get()).family.attributes.length,3);
 const latest=await get();const lastAttribute=latest.family.attributes.at(-1);
 await call("POST",`/product-families/${id}/attributes/${lastAttribute.id}/rename`,{name:"Formato de presentación",reason:"Corrección descriptiva tras ampliar dimensiones",confirmed:true,expectedRevision:latest.revision,operationKey:randomUUID()},"ADMIN");
 const target=(await pool.query("insert into categories(name) values($1) returning id",[`Dimensiones ${randomUUID()}`])).rows[0].id;
 await call("POST",`/product-families/${id}/category-changes`,{categoryId:target,reason:"Reclasificación posterior a ampliación controlada",confirmed:true,expectedRevision:(await get()).revision,operationKey:randomUUID()},"ADMIN");
 const sale=await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:created.productIds[0],quantity:1}]},"CASHIER",201);
 const fresh=(await pool.query("select identity from commercial_identity_snapshots where sale_id=$1",[sale.id])).rows[0].identity;
 assert.equal(fresh.family.attributes.length,3);assert.equal(captures.find(c=>c.sale_id).identity.family.attributes.length,1);
 for(const c of captures)assert.deepEqual((await pool.query("select * from commercial_identity_snapshots where id=$1",[c.id])).rows[0],c);
 const detachedInput=body();detachedInput.variants.forEach(v=>v.barcode=null);const detached=await call("POST","/product-families/bundle",detachedInput,"ADMIN",200,true);
 let detachBundle=await call("GET",`/product-families/${detached.familyId}/bundle`,null,"ADMIN");const member=detachBundle.variants[0];
 await call("POST",`/product-families/variants/${member.id}/detach`,{expectedFamilyId:member.familyId,expectedOptionIds:member.variantOptionIds,reason:"Desvinculación histórica de prueba aislada",confirmed:true},"ADMIN");
 detachBundle=await call("GET",`/product-families/${detached.familyId}/bundle`,null,"ADMIN");
 await call("POST",`/product-families/${detached.familyId}/dimension-additions`,{...third,expectedRevision:detachBundle.revision,operationKey:randomUUID(),assignments:detachBundle.variants.map(v=>({productId:v.id,optionIndex:0}))},"ADMIN",409);
 users.DIMENSION_CLIENT=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'16999999-0','Cliente','Dimensiones','dimension-client@example.test',password,'ACTIVE',now() from users where id=$1 returning id",[users.CLIENT])).rows[0].id;
 const cart={items:[{productId:created.productIds[0],quantity:1}],deliveryType:"PICKUP"};const cartQuote=await call("POST","/online-orders/quote",cart);
 await call("POST","/online-orders/checkout",{...cart,quoteFingerprint:cartQuote.quoteFingerprint,checkoutKey:randomUUID()},"DIMENSION_CLIENT",201);
 await call("POST",endpoint,{...third,name:"Dimensión pendiente",expectedRevision:(await get()).revision,operationKey:randomUUID()},"ADMIN",409);
 console.log("PASS dimensión controlada: historial/ENTRY, activos/inactivos, IDs/opciones/stock/capturas, asignación completa, rollback deliberado, concurrencia/replay/recuperación, SQL guard, nueva variante real y tercera dimensión");
}

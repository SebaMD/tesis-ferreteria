// Only the disposable runner's cluster is accepted. No development .env target.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const url=new URL(process.env.BUNDLE_TEST_DATABASE_URL||'http://missing');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55447');assert.equal(url.pathname,'/postgres');
const pool=new pg.Pool({connectionString:url.href});let server,applicationDb;
try{
 const dir=(await pool.query('show data_directory')).rows[0].data_directory.replaceAll('\\','/');assert.match(dir,/\/fyf-bundle-test-[^/]+\/data$/);
 console.log('Engine:',(await pool.query('select version() v')).rows[0].v);
 const folder=await mkdtemp(path.join(path.dirname(dir),'unit-schema-'));await mkdir(path.join(folder,'meta'));
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));const expectedMigrations=journal.entries.length;journal.entries=journal.entries.filter(e=>e.idx<=36);
 await writeFile(path.join(folder,'meta/_journal.json'),JSON.stringify(journal));
 for(const e of journal.entries)await copyFile(`drizzle/${e.tag}.sql`,path.join(folder,`${e.tag}.sql`));
 await migrate(drizzle(pool),{migrationsFolder:folder});
 // Keep the original incremental baseline, then bring the fixture to the schema
 // required by the current backend before exercising SKU unit business rules.
 await migrate(drizzle(pool),{migrationsFolder:'drizzle'});
 Object.assign(process.env,{DATABASE_URL:url.href,SESSION_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test',MAIL_ENABLED:'false',UPLOADS_ROOT:path.join(folder,'uploads')});
 const users={};for(const [i,role] of ['ADMIN','CLIENT','MANAGER','CASHIER','WAREHOUSE'].entries()){
  await pool.query('insert into roles(name) values($1) on conflict do nothing',[role]);
  users[role]=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values((select id from roles where name=$1),$2,$1,'Prueba',$3,'unused','ACTIVE',now()) returning id",[role,`${11111111+i}-1`,role+'@unit.example.test'])).rows[0].id;
 }
 const category=(await pool.query("insert into categories(name) values('Unidades aisladas') returning id")).rows[0].id;
 const {default:app}=await import('../dist/app.js');applicationDb=(await import('../dist/db/index.js')).db;
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(method,route,body,expected=200,role='ADMIN')=>{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api${route}`,{method,headers:{'Content-Type':route==='/product-families/bundle'?'application/vnd.fyf.product-bundle+json':'application/json',...(role?{Authorization:'Bearer '+jwt.sign({id:users[role]},process.env.SESSION_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await r.json();assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${route}: ${r.status} ${JSON.stringify(json)}`);return {...json,httpStatus:r.status};
 };
 const tables=['products','product_families','family_attributes','family_attribute_options','product_variant_values','product_images','inventory_movements','sales','sale_details','online_orders','online_order_items','online_payments','delivery_quote_requests','delivery_quote_items','commercial_identity_snapshots','product_family_events'];
 const state=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await pool.query(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows])));
 const make=async()=> (await call('POST','/product-families/bundle',{operationKey:randomUUID(),family:{name:'Familia '+randomUUID(),categoryId:category,brand:'Prueba',attributes:[{name:'Color',options:[{label:'Rojo'},{label:'Azul'}]}]},unitMeasure:'unidad',variants:[0,1].map(i=>({name:'SKU '+randomUUID(),price:1000,initialStock:0,status:i===0,selections:[i]}))})).data;
 const load=async f=>(await call('GET',`/product-families/${f.familyId}/bundle`)).data;
 const preview=async(f,d,target='metro',expected=200,role='ADMIN')=>call('GET',`/product-families/${f.familyId}/unit-eligibility?`+new URLSearchParams({unitMeasure:target,expectedRevision:d.revision}),null,expected,role);
 const edit=(f,d,target='metro')=>({operationKey:randomUUID(),familyId:f.familyId,expectedRevision:d.revision,unitMeasure:target,
  family:{name:d.family.name,brand:d.family.brand,categoryId:d.family.categoryId,description:d.family.description,attributes:d.family.attributes.map(a=>({id:a.id,name:a.name,options:a.options.map(o=>({id:o.id,label:o.label}))}))},
  variants:d.variants.map(p=>({id:p.id,name:p.name,unitMeasure:target,price:Number(p.price),barcode:p.barcode,minimumStock:p.minimumStock,status:p.status,inStoreOnly:p.inStoreOnly,selections:d.family.attributes.map(a=>a.options.findIndex(o=>p.variantOptionIds.includes(o.id)))}))});
 const f=await make();let d=await load(f),before=await state();
 const same=await preview(f,d,'unidad');assert.ok(same.data.variants.every(v=>v.state==='same'));
 const eligible=await preview(f,d);assert.ok(eligible.data.variants.every(v=>v.state==='eligible'));assert.deepEqual(await state(),before);
 for(const role of [null,'CLIENT','MANAGER','WAREHOUSE','CASHIER'])await preview(f,d,'metro',role?403:401,role);
 const service=(await import('../dist/modules/productFamilies/productBundle.service.js')).getFamilyUnitEligibility;
 await assert.rejects(()=>service(f.familyId,users.CLIENT,{unitMeasure:'metro',expectedRevision:d.revision}),e=>e.statusCode===403);
 await preview(f,{...d,revision:'a'.repeat(64)},'metro',409);
 await call('GET',`/product-families/${f.familyId}/unit-eligibility?unitMeasure=&expectedRevision=${d.revision}`,null,400);
 const body=edit(f,d),saved=await call('POST','/product-families/bundle',body);assert.equal(saved.data.replayed,false);
 const after=await load(f);assert.deepEqual(after.variants.map(p=>p.id),d.variants.map(p=>p.id));
 for(const p of after.variants){const old=d.variants.find(o=>o.id===p.id);for(const field of ['currentStock','minimumStock','price','barcode','name','brand','categoryId','variantKey','status'])assert.deepEqual(p[field],old[field],field);assert.equal(p.unitMeasure,'metro');}
 const audit=(await pool.query("select * from product_family_events where next->>'operation'='BUNDLE_SAVE' and next->>'operationKey'=$1",[body.operationKey])).rows;
 assert.equal(audit.length,1);assert.equal(audit[0].user_id,users.ADMIN);assert.ok(audit[0].reason);assert.deepEqual(audit[0].previous.variants.map(p=>p.unitMeasure),['unidad','unidad']);assert.deepEqual(audit[0].next.variants.map(p=>p.unitMeasure),['metro','metro']);
 assert.equal((await call('POST','/product-families/bundle',body)).data.replayed,true);
 assert.deepEqual((await call('GET',`/product-families/operations/${body.operationKey}`)).data.productIds,f.productIds);
 await call('POST','/product-families/bundle',{...body,unitMeasure:'kg'},409);
 const withNew=edit(f,after);withNew.family.attributes[0].options.push({label:'Verde'});
 withNew.variants.push({name:'SKU nuevo '+randomUUID(),unitMeasure:'metro',price:1000,initialStock:0,selections:[2]});
 const extended=(await call('POST','/product-families/bundle',withNew)).data;
 assert.deepEqual(extended.productIds.slice(0,2),f.productIds);assert.equal(extended.productIds.length,3);
 assert.equal((await load(f)).variants.find(p=>p.id===extended.productIds[2]).unitMeasure,'metro');
 assert.equal((await pool.query('select count(*)::int n from inventory_movements where product_id=any($1)',[extended.productIds])).rows[0].n,0);
 console.log('PASS preview ADMIN read-only; eligible existing/inactive; unchanged; revision; atomic save and audit before/after; replay/recovery');
 const entry=await make();await call('POST','/inventory',{productId:entry.productIds[0],movementType:'ENTRY',quantity:3,reason:'Entrada de prueba aislada'},201);
 d=await load(entry);before=await state();const mixed=await preview(entry,d);assert.equal(mixed.data.variants[0].state,'blocked');assert.equal(mixed.data.variants[1].state,'eligible');
 const mixedBody=edit(entry,d);mixedBody.variants.reverse(); // eligible writes first; the later rejection must roll it back
 const denied=await call('POST','/product-families/bundle',mixedBody,409);assert.equal(denied.details.productId,entry.productIds[0]);assert.deepEqual(await state(),before);
 await call('POST','/sales',{paymentMethod:'efectivo',details:[{productId:entry.productIds[0],quantity:1}]},201,'CASHIER');
 d=await load(entry);before=await state();await call('POST','/product-families/bundle',edit(entry,d),409);assert.deepEqual(await state(),before);
 const {saveManualDeliverySettings,createClientDeliveryQuote}=await import('../dist/modules/deliveryQuotes/deliveryQuotes.service.js');await saveManualDeliverySettings(users.ADMIN,{expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false});
 const requestBody=id=>({requestKey:randomUUID(),items:[{productId:id,quantity:1}],recipientName:'Prueba aislada',phone:'123456789',address:'Dirección aislada',commune:'Concepción',nonUrgent:false});
 const pending=await make(),pid=pending.productIds[0];await pool.query('update products set current_stock=5 where id=$1',[pid]);
 d=await load(pending);assert.equal((await preview(pending,d)).data.variants[0].state,'eligible');
 const request=await createClientDeliveryQuote(users.CLIENT,requestBody(pid));
 assert.equal((await load(pending)).revision,d.revision,'a quote need not alter the family revision');
 before=await state();const stale=await call('POST','/product-families/bundle',edit(pending,d),409);assert.match(stale.message,/solicitud/i);assert.deepEqual(await state(),before);
 assert.equal((await preview(pending,d)).data.variants[0].state,'blocked');
 await pool.query("update delivery_quote_requests set status='CANCELLED',version=version+1 where id=$1",[request.request.id]);
 const order=(await pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,$2,'PENDING_PAYMENT',1000,'PICKUP',now()+interval '10 minutes') returning id",[users.CLIENT,randomUUID()])).rows[0].id;
 await pool.query('insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,$2,1,1000,1000)',[order,pid]);
 d=await load(pending);before=await state();assert.equal((await preview(pending,d)).data.variants[0].state,'blocked');await call('POST','/product-families/bundle',edit(pending,d),409);assert.deepEqual(await state(),before);
 console.log('PASS ENTRY, sales snapshots, pending request created after preview, order/reservation, mixed rollback and unchanged commercial rows');
 const failure=await make();d=await load(failure);before=await state();const failed=edit(failure,d);
 await pool.query(`create function fail_unit_audit() returns trigger language plpgsql as $$ begin if NEW.family_id=${failure.familyId} and NEW.next->>'operation'='BUNDLE_SAVE' then raise exception 'unit audit rollback test'; end if; return NEW; end $$; create trigger fail_unit_audit before insert on product_family_events for each row execute function fail_unit_audit()`);
 await call('POST','/product-families/bundle',failed,500);assert.deepEqual(await state(),before);
 await pool.query('drop trigger fail_unit_audit on product_family_events; drop function fail_unit_audit()');
 await call('POST','/product-families/bundle',failed);assert.equal((await call('POST','/product-families/bundle',failed)).data.replayed,true);
 const race=await make(),rid=race.productIds[0];await pool.query('update products set current_stock=5 where id=$1',[rid]);d=await load(race);
 const raced=await Promise.all([createClientDeliveryQuote(users.CLIENT,requestBody(rid)),call('POST','/product-families/bundle',edit(race,d),[200,409])]);
 const captured=(await pool.query('select unit_measure from delivery_quote_items where request_id=$1',[raced[0].request.id])).rows[0].unit_measure;
 const units=(await pool.query('select unit_measure from products where id=any($1) order by id',[race.productIds])).rows.map(p=>p.unit_measure);
 assert.equal(captured,units[0]);assert.ok(units.every(u=>u===units[0]));
 assert.equal((await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,expectedMigrations);
 console.log('PASS audit failure rollback, durable retry, real concurrent bulk save/request, no partial units; PostgreSQL isolated current schema');
}finally{if(server)await new Promise(r=>server.close(r));if(applicationDb)await applicationDb.$client.end();await pool.end();}

// Dedicated regression on schema 0036: deliberately never applies 0037/0038.
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
 const folder=await mkdtemp(path.join(path.dirname(dir),'schema36-'));await mkdir(path.join(folder,'meta'));
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));journal.entries=journal.entries.filter(e=>e.idx<=36);assert.equal(journal.entries.at(-1).tag,'0036_controlled_family_dimension');
 await writeFile(path.join(folder,'meta/_journal.json'),JSON.stringify(journal));
 for(const e of journal.entries)await copyFile(`drizzle/${e.tag}.sql`,path.join(folder,`${e.tag}.sql`));
 await migrate(drizzle(pool),{migrationsFolder:folder});assert.equal((await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,37);
 assert.equal((await pool.query("select to_regprocedure('fyf_verify_family_brand_audit()') v")).rows[0].v,null);
 Object.assign(process.env,{DATABASE_URL:url.href,SESSION_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test',MAIL_ENABLED:'false',UPLOADS_ROOT:path.join(folder,'uploads')});
 const users={};for(const role of ['ADMIN','CLIENT']){await pool.query('insert into roles(name) values($1) on conflict do nothing',[role]);users[role]=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values((select id from roles where name=$1),$2,$1,'Prueba',$3,'unused','ACTIVE',now()) returning id",[role,role==='ADMIN'?'11111111-1':'22222222-2',role+'@example.test'])).rows[0].id;}
 const category=(await pool.query("insert into categories(name) values('Compromisos aislados') returning id")).rows[0].id;
 const {default:app}=await import('../dist/app.js');applicationDb=(await import('../dist/db/index.js')).db;
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(method,route,body,expected=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${route}`,{method,headers:{'Content-Type':route==='/product-families/bundle'?'application/vnd.fyf.product-bundle+json':'application/json',Authorization:'Bearer '+jwt.sign({id:users.ADMIN},process.env.SESSION_SECRET)},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${route}: ${r.status} ${JSON.stringify(data)}`);return {status:r.status,data:data.data};};
 const {saveManualDeliverySettings,createClientDeliveryQuote}=await import('../dist/modules/deliveryQuotes/deliveryQuotes.service.js');
 await saveManualDeliverySettings(users.ADMIN,{expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false});
 const make=async()=>{const b={operationKey:randomUUID(),family:{name:'Familia '+randomUUID(),categoryId:category,brand:'Prueba',attributes:[{name:'Medida',options:[{label:'200 ml'},{label:'400 ml'},{label:'600 ml'}]}]},unitMeasure:'unidad',variants:[0,1].map(i=>({name:'Artículo '+randomUUID(),price:1000,initialStock:0,selections:[i]}))};const result=(await call('POST','/product-families/bundle',b)).data;return {b,...result};};
 const requestBody=id=>({requestKey:randomUUID(),items:[{productId:id,quantity:1}],recipientName:'Prueba aislada',phone:'123456789',address:'Dirección aislada',commune:'Concepción',nonUrgent:false});
 const state=async()=>Object.fromEntries(await Promise.all(['products','product_families','product_variant_values','inventory_movements','online_orders','online_order_items','delivery_quote_requests','delivery_quote_items','commercial_identity_snapshots','product_family_events'].map(async t=>[t,(await pool.query(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows])));
 const f=await make(),id=f.productIds[0];
 // Synthetic available stock fixture without ENTRY, to exercise the exact history gap.
 await pool.query('update products set current_stock=5 where id=$1',[id]);
 const q=await createClientDeliveryQuote(users.CLIENT,requestBody(id));
 assert.equal((await pool.query('select count(*)::int n from inventory_movements where product_id=$1',[id])).rows[0].n,0);
 let draft=(await call('GET',`/product-families/${f.familyId}/bundle`)).data;
 const opts=draft.family.attributes[0].options;
 const before=await state();
 for(const change of [{unitMeasure:'caja'},{variantOptionIds:[opts[2].id]},{barcode:'987654321'}])await call('PATCH',`/products/${id}`,change,409);
 const bundle={...f.b,familyId:f.familyId,expectedRevision:draft.revision,operationKey:randomUUID(),family:{...draft.family,attributes:draft.family.attributes.map(a=>({id:a.id,name:a.name,options:a.options.map(o=>({id:o.id,label:o.label}))}))},variants:draft.variants.map((p,i)=>({id:p.id,name:p.name,price:Number(p.price),selections:[i===0?2:1]}))};
 delete bundle.family.id;delete bundle.family.createdAt;delete bundle.family.updatedAt;delete bundle.family.archivedAt;
 // Restrict family payload to the actual public contract.
 bundle.family={name:draft.family.name,brand:draft.family.brand,categoryId:category,description:draft.family.description,attributes:bundle.family.attributes};
 await call('POST','/product-families/bundle',bundle,409);assert.deepEqual(await state(),before);
 await call('PATCH',`/products/${id}`,{description:'Descripción corregida',minimumStock:3,price:1200,unitMeasure:'unidad',variantOptionIds:[opts[0].id]});
 draft=(await call('GET',`/product-families/${f.familyId}/bundle`)).data;
 const safeBundle={...bundle,operationKey:randomUUID(),expectedRevision:draft.revision,variants:bundle.variants.map((v,i)=>({...v,selections:[i],price:i===0?1200:v.price,minimumStock:4}))};
 await call('POST','/product-families/bundle',safeBundle);
 draft=(await call('GET',`/product-families/${f.familyId}/bundle`)).data;
 const beforeUnitBundle=await state();
 await call('POST','/product-families/bundle',{...safeBundle,operationKey:randomUUID(),expectedRevision:draft.revision,variants:safeBundle.variants.map((v,i)=>({...v,...(i===0?{unitMeasure:'caja'}:{})}))},409);
 assert.deepEqual(await state(),beforeUnitBundle);
 const stable=await state();await call('PATCH',`/products/${id}`,{unitMeasure:'caja',price:9999},409);assert.deepEqual(await state(),stable);
 await pool.query("update delivery_quote_requests set status='CANCELLED',version=version+1 where id=$1",[q.request.id]);
 await call('PATCH',`/products/${id}`,{unitMeasure:'caja',variantOptionIds:[opts[2].id]});
 // An accepted quotation has an order: ORDER_CREATED is not an exemption.
 const order=(await pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,$2,'PENDING_PAYMENT',1200,'PICKUP',now()+interval '10 minutes') returning id",[users.CLIENT,randomUUID()])).rows[0].id;
 await pool.query('insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,$2,1,1200,1200)',[order,id]);
 await pool.query("update delivery_quote_requests set status='ORDER_CREATED',version=version+1 where id=$1",[q.request.id]);
 for(const status of ['PENDING_PAYMENT','PAYMENT_FAILED']){await pool.query('update online_orders set status=$2 where id=$1',[order,status]);const s=await state();await call('PATCH',`/products/${id}`,{unitMeasure:'unidad'},409);await call('PATCH',`/products/${id}`,{variantOptionIds:[opts[0].id]},409);assert.deepEqual(await state(),s);}
 // Race real request creation against PATCH. Both orders are valid; no stale capture.
 const fresh=await make(),pid=fresh.productIds[0];await pool.query('update products set current_stock=5 where id=$1',[pid]);
 const raced=await Promise.all([createClientDeliveryQuote(users.CLIENT,requestBody(pid)),call('PATCH',`/products/${pid}`,{unitMeasure:'paquete'},[200,409])]);
 const item=(await pool.query('select unit_measure from delivery_quote_items where request_id=$1',[raced[0].request.id])).rows[0];
 const current=(await pool.query('select unit_measure from products where id=$1',[pid])).rows[0];assert.equal(item.unit_measure,current.unit_measure);
 await call('PATCH',`/products/${pid}`,{unitMeasure:'caja'},409);
 const another=await make(),other=another.productIds[0];await pool.query('update products set current_stock=5 where id=$1',[other]);
 const familyDraft=(await call('GET',`/product-families/${another.familyId}/bundle`)).data;
 const reassigned=await Promise.all([createClientDeliveryQuote(users.CLIENT,requestBody(other)),call('PATCH',`/products/${other}`,{variantOptionIds:[familyDraft.family.attributes[0].options[2].id]},[200,409])]);
 const captured=(await pool.query('select s.identity from commercial_identity_snapshots s join delivery_quote_items i on i.id=s.delivery_quote_item_id where i.request_id=$1',[reassigned[0].request.id])).rows[0].identity;
 const actual=(await pool.query('select variant_key from products where id=$1',[other])).rows[0].variant_key;
 assert.equal(captured.variantKey,actual);
 assert.equal((await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,37);
 console.log('PASS compromisos: esquema 0036, SKU sin ENTRY, solicitud, aceptación/pedido y reintentos, opciones/unidad/código bloqueados, inocuos permitidos, rollback íntegro, carrera real sin captura obsoleta; sin aplicar 0037/0038');
}finally{if(server)await new Promise(r=>server.close(r));if(applicationDb)await applicationDb.$client.end();await pool.end();}

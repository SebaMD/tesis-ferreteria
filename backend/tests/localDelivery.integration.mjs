// Disposable runner only. SDK and emails never contact external systems.
import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import pg from 'pg';import jwt from 'jsonwebtoken';import bcrypt from 'bcrypt';
import {drizzle} from 'drizzle-orm/node-postgres';import {migrate} from 'drizzle-orm/node-postgres/migrator';
const url=new URL(process.env.DELIVERY_TEST_DATABASE_URL||'http://missing');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55446');assert.equal(url.pathname,'/postgres');
const pool=new pg.Pool({connectionString:url.href});let server,applicationDb;
try{
 const dir=(await pool.query('show data_directory')).rows[0].data_directory.replaceAll('\\','/');assert.match(dir,/\/fyf-delivery-test-[^/]+\/data$/);
 console.log('Engine:',(await pool.query('select version() v')).rows[0].v);
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));assert.equal(journal.entries.at(-1).tag,'0041_attribute_measurements');
 const previous=path.join(path.dirname(dir),'pre0040');await mkdir(path.join(previous,'meta'),{recursive:true});await writeFile(path.join(previous,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.filter(e=>e.idx<40)}));
 for(const e of journal.entries.filter(e=>e.idx<40))await copyFile(`drizzle/${e.tag}.sql`,path.join(previous,`${e.tag}.sql`));
 await migrate(drizzle(pool),{migrationsFolder:previous});
 const users={};const password=await bcrypt.hash('DemoLocal123!',4);
 for(const [i,key]of ['ADMIN','MANAGER','WAREHOUSE','CASHIER',...Array.from({length:22},(_,i)=>'CLIENT'+i)].entries()){
  const role=key.startsWith('CLIENT')?'CLIENT':key;await pool.query('insert into roles(name) values($1) on conflict do nothing',[role]);
  users[key]=(await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values((select id from roles where name=$1),$2,$3,'Local aislado',$4,$5,'ACTIVE',now()) returning id",[role,`${30000000+i}-0`,key,key.toLowerCase()+'@local.example.test',password])).rows[0].id;
 }
 const category=(await pool.query("insert into categories(name) values('DEMO LOCAL AISLADO') returning id")).rows[0].id;
 const product=async(price=45000,stock=100)=>(await pool.query("insert into products(category_id,name,brand,price,unit_measure,current_stock) values($1,$2,'Marca de prueba',$3,'unidad',$4) returning id",[category,'DEMO LOCAL '+randomUUID(),price,stock])).rows[0].id;
 const pid=await product();
 const hashTables=async()=>Object.fromEntries(await Promise.all(['products','online_orders','online_order_items','online_payments','sales','sale_details','inventory_movements','commercial_identity_snapshots','delivery_quote_requests','delivery_quote_items','delivery_quote_revisions','delivery_quote_events','delivery_policy_revisions','delivery_settings'].map(async t=>[t,createHash('sha256').update(JSON.stringify((await pool.query(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows)).digest('hex')])));
 Object.assign(process.env,{DATABASE_URL:url.href,SESSION_SECRET:randomBytes(32).toString('hex'),EMAIL_VERIFICATION_SECRET:randomBytes(32).toString('hex'),LOGISTICS_QR_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test',MAIL_ENABLED:'false',WEBPAY_ENVIRONMENT:'integration',FRONTEND_URL:'http://127.0.0.1:5208'});
 const sdk=(await import('transbank-sdk')).default,transactions=new Map();let result='AUTHORIZED',wrongAmount=false;
 sdk.WebpayPlus.Transaction.prototype.create=async(buy_order,session_id,amount)=>{const token=randomUUID();transactions.set(token,{buy_order,session_id,amount});return{token,url:'http://127.0.0.1:5195/simulated-webpay'};};
 sdk.WebpayPlus.Transaction.prototype.status=async token=>({...transactions.get(token),status:'INITIALIZED',response_code:-2});
 sdk.WebpayPlus.Transaction.prototype.commit=async token=>({...transactions.get(token),amount:transactions.get(token).amount+(wrongAmount?1:0),status:result,response_code:result==='AUTHORIZED'?0:-1,authorization_code:'TEST',payment_type_code:'VD',transaction_date:new Date().toISOString()});
 const {default:app}=await import('../dist/app.js');applicationDb=(await import('../dist/db/index.js')).db;
 // These routes exist only in this in-memory test app, never in application source.
 app.all('/simulated-webpay',(req,res)=>res.send(`<h1>Webpay SIMULADO — sin cobros reales</h1><p>Solo PostgreSQL aislado</p><form action="/simulated-webpay/approve"><input type="hidden" name="token" value="${String(req.body?.token_ws||req.query.token_ws||req.query.token||'')}"><button>Aprobar pago simulado</button></form>`));
 app.get('/simulated-webpay/approve',(req,res)=>{result='AUTHORIZED';res.redirect('/api/online-orders/payments/webpay/return?token_ws='+encodeURIComponent(String(req.query.token)));});
 server=app.listen(process.env.LOCAL_DELIVERY_VISUAL==='1'?5195:0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(method,route,body,key='ADMIN',expected=200)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+jwt.sign({id:users[key]},process.env.SESSION_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${method} ${route}: ${r.status} ${JSON.stringify(data)}`);return data.data;};
 const {saveManualDeliverySettings,createClientDeliveryQuote,actOnDeliveryQuote}=await import('../dist/modules/deliveryQuotes/deliveryQuotes.service.js');
 const manual=await saveManualDeliverySettings(users.ADMIN,{expectedRevisionId:null,deliveryEnabled:true,conditionalFreeEnabled:false});
 const legacyRequest=async(key)=>createClientDeliveryQuote(users[key],{requestKey:randomUUID(),items:[{productId:pid,quantity:1}],recipientName:'Cliente anterior',phone:'123456789',address:'Dirección anterior',commune:'Concepción',reference:'Referencia original',nonUrgent:false});
 const old=await legacyRequest('CLIENT0'),old2=await legacyRequest('CLIENT1');
 const approve=async(q)=>{const proposed=await actOnDeliveryQuote(q.id,{userId:users.ADMIN},'PROPOSE',{commandKey:randomUUID(),expectedVersion:q.version,amount:7200,reason:'PAID_FREIGHT',vehicle:'Vehículo anterior',distanceKm:10,trips:1,routeConfirmed:true,coordinated:false,notes:'Propuesta histórica de prueba',customerNote:'Flete aprobado anteriormente'});return(await actOnDeliveryQuote(q.id,{userId:users.ADMIN},'APPROVE',{commandKey:randomUUID(),expectedVersion:proposed.request.version,proposalRevisionId:proposed.revisionId,reason:'Conservar condiciones anteriores'})).request;};
 const approved=await approve(old.request);
 // Migrate a populated 0039 database, including a started legacy payment and captures.
 const pre40=await legacyRequest('CLIENT12'),pre40Approved=await approve(pre40.request);
 const pre40Summary=await call('GET',`/delivery-quotes/${pre40Approved.id}/summary`,null,'CLIENT12');
 await call('POST',`/delivery-quotes/${pre40Approved.id}/checkout`,{commandKey:randomUUID(),expectedVersion:pre40Approved.version,quoteFingerprint:pre40Summary.quoteFingerprint,commercialSignature:pre40Summary.commercialSignature,accepted:true},'CLIENT12');
 const triggers=async()=>(await pool.query("select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname")).rows;
 const original=await hashTables(),oldTriggers=await triggers();await migrate(drizzle(pool),{migrationsFolder:'drizzle'});await migrate(drizzle(pool),{migrationsFolder:'drizzle'});assert.deepEqual(await hashTables(),original);assert.equal((await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n,journal.entries.length);
 const migratedTriggers=await triggers();for(const trigger of oldTriggers)assert.deepEqual(migratedTriggers.find(t=>t.tgname===trigger.tgname),trigger);
 for(const name of ['local_fixed_order_guard','legacy_delivery_request_scope'])assert.equal(migratedTriggers.find(t=>t.tgname===name)?.tgenabled,'O');
 const setting={pricingMode:'LOCAL_FIXED',expectedRevisionId:manual.id,pickupEnabled:true,deliveryEnabled:true,flatFee:3000,freeShippingFrom:500000,minimumProductsTotal:null,isDemo:false};
 for(const role of ['CLIENT2','WAREHOUSE','CASHIER'])await call('PUT','/delivery-settings',setting,role,403);
 let policy=await call('PUT','/delivery-settings',setting);
 const save=async values=>policy=await call('PUT','/delivery-settings',{...setting,expectedRevisionId:policy.id,...values});
 assert.equal(policy.pricingMode,'LOCAL_FIXED');await assert.rejects(()=>legacyRequest('CLIENT2'));
 await assert.rejects(()=>pool.query("insert into delivery_quote_requests(client_id,request_key,request_hash,recipient_name,phone,address,commune,policy_revision_id,commercial_snapshot,evaluation_expires_at) values($1,$2,$3,'Prueba','123456789','Calle de prueba','Santa Juana',$4,'{}',now()+interval '24 hours')",[users.CLIENT13,randomUUID(),'a'.repeat(64),manual.id]),e=>e.code==='23514');
 await call('POST','/delivery-quotes',{requestKey:randomUUID(),items:[{productId:pid,quantity:1}],recipientName:'Cliente',phone:'123456789',address:'Calle 1',commune:'Santa Juana',nonUrgent:false},'CLIENT2',409);
 await call('PUT','/delivery-quotes/settings',{expectedRevisionId:policy.id,deliveryEnabled:true,conditionalFreeEnabled:false},'ADMIN',409);
 await approve(old2.request); // pending request remains operable under its original manual revision
 const summary=await call('GET',`/delivery-quotes/${approved.id}/summary`,null,'CLIENT0');
 const legacyPayment=await call('POST',`/delivery-quotes/${approved.id}/checkout`,{commandKey:randomUUID(),expectedVersion:approved.version,quoteFingerprint:summary.quoteFingerprint,commercialSignature:summary.commercialSignature,accepted:true},'CLIENT0');
 assert.equal(transactions.get(legacyPayment.token).amount,52200);assert.equal((await pool.query('select delivery_commune from online_orders where id=$1',[legacyPayment.orderId])).rows[0].delivery_commune,'Concepción');
 await save({deliveryEnabled:false});await call('POST','/online-orders/quote',{items:[{productId:pid,quantity:1}],deliveryType:'DELIVERY',deliveryCommune:'Santa Juana'},null,409);
 await fetch(base+'/online-orders/payments/webpay/return?token_ws='+encodeURIComponent(legacyPayment.token),{redirect:'manual'});
 assert.equal((await pool.query('select status from online_orders where id=$1',[legacyPayment.orderId])).rows[0].status,'PAID');await save({deliveryEnabled:true});
 const quote=async(id=pid,type='DELIVERY')=>call('POST','/online-orders/quote',{items:[{productId:id,quantity:1}],deliveryType:type,deliveryCommune:type==='DELIVERY'?'Santa Juana':null},null);
 const makeBody=(id,q,type='DELIVERY')=>({checkoutKey:randomUUID(),items:[{productId:id,quantity:1}],deliveryType:type,quoteFingerprint:q.quoteFingerprint,...(type==='DELIVERY'?{deliveryRecipientName:'Cliente prueba',deliveryPhone:'123456789',deliveryAddress:'Sector de prueba s/n',deliveryReference:'Casa de prueba identificable',deliveryCommune:'Santa Juana'}:{})});
 for(const [price,fee,key]of [[45000,3000,'CLIENT2'],[500000,3000,'CLIENT3'],[500001,0,'CLIENT4']]){
  const id=await product(price),q=await quote(id),body=makeBody(id,q),p=await call('POST','/online-orders/checkout',body,key,201);
  assert.equal(Number(q.deliveryFee),fee);assert.equal(Number(q.total),price+fee);assert.equal(transactions.get(p.token).amount,price+fee);
  assert.equal((await call('POST','/online-orders/checkout',body,key,201)).orderId,p.orderId);
  const persisted=(await pool.query('select * from online_orders where id=$1',[p.orderId])).rows[0];assert.equal(Number(persisted.total),price+fee);assert.equal(Number(persisted.delivery_fee),fee);
 }
 const pickup=await quote(pid,'PICKUP');assert.equal(Number(pickup.deliveryFee),0);
 const guestSession=randomBytes(32).toString('base64url'),guestEmail='guest@local.example.test';
 const challenge=(await pool.query("insert into email_verification_challenges(email,purpose,guest_session_hash,pin_hash,expires_at,last_sent_at,verified_at) values($1,'GUEST_CHECKOUT',$2,$3,now()+interval '1 hour',now(),now()) returning id",[guestEmail,createHash('sha256').update(guestSession).digest('hex'),createHash('sha256').update('unused').digest('hex')])).rows[0].id;
 const guestResponse=await fetch(base+'/online-orders/guest/checkout',{method:'POST',headers:{'Content-Type':'application/json','X-Guest-Session':guestSession},body:JSON.stringify({...makeBody(pid,await quote()),guestName:'Invitado aislado',guestEmail,guestEmailConfirmation:guestEmail,guestPhone:'123456789',emailVerificationChallengeId:challenge})});
 const guestResult=await guestResponse.json();assert.equal(guestResponse.status,201,JSON.stringify(guestResult));assert.equal(transactions.get(guestResult.data.token).amount,48000);assert.ok(guestResult.data.guestAccessToken);
 // Explicitly already active: PostgreSQL microseconds must not race JS millisecond pricing time.
 const discounted=await product(500001);const promo=(await pool.query("insert into promotions(name,type,is_active,percentage,starts_at) values('Descuento aislado','PERCENTAGE_DISCOUNT',true,10,now()-interval '1 hour') returning id")).rows[0].id;await pool.query('insert into promotion_products(promotion_id,product_id) values($1,$2)',[promo,discounted]);
 const discountedQuote=await quote(discounted);assert.ok(Number(discountedQuote.productsNet)<500000);assert.equal(Number(discountedQuote.deliveryFee),3000);
 const safe=await hashTables();for(const commune of ['Concepción','Dirección Santa Juana','Santa Juana, otra comuna']){
  await call('POST','/online-orders/quote',{items:[{productId:pid,quantity:1}],deliveryType:'DELIVERY',deliveryCommune:commune},null,400);
  await call('POST','/online-orders/checkout',{...makeBody(pid,await quote()),deliveryCommune:commune},'CLIENT5',400);
 }
 await call('POST','/online-orders/checkout',{...makeBody(pid,await quote()),deliveryFee:0},'CLIENT5',400);assert.deepEqual(await hashTables(),safe);
 const obsolete=await quote();await save({flatFee:3500});const untouched=await hashTables();await call('POST','/online-orders/checkout',makeBody(pid,obsolete),'CLIENT5',409);assert.deepEqual(await hashTables(),untouched);await save({flatFee:3000});
 const callback=async token=>{await fetch(base+'/online-orders/payments/webpay/return?token_ws='+encodeURIComponent(token),{redirect:'manual'});};
 const pay=async key=>call('POST','/online-orders/checkout',makeBody(pid,await quote()),key,201);
 const p=await pay('CLIENT5');await callback(p.token);assert.equal((await pool.query('select status from online_orders where id=$1',[p.orderId])).rows[0].status,'PAID');const paidState=await hashTables();await callback(p.token);assert.deepEqual(await hashTables(),paidState);
 const captures=(await pool.query('select to_jsonb(s) r from commercial_identity_snapshots s order by id')).rows;
 await save({flatFee:9000,freeShippingFrom:1});assert.deepEqual((await pool.query('select to_jsonb(s) r from commercial_identity_snapshots s order by id')).rows,captures);assert.equal(Number((await pool.query('select total from online_orders where id=$1',[p.orderId])).rows[0].total),48000);
 const detail=await call('GET',`/online-orders/${p.orderId}`,null,'CLIENT5');assert.equal(detail.status,'PAID');assert.equal(detail.deliveryCommune,'Santa Juana');assert.equal(Number(detail.deliveryFee),3000);
 assert.equal(detail.deliveryPricingMode,'LOCAL_FIXED');
 const {buildOrderCommercialModel}=await import('../dist/modules/onlineOrders/orderCommercialModel.js');
 const model=buildOrderCommercialModel({...detail,createdAt:new Date(detail.createdAt),paidAt:new Date(detail.paidAt)});
 const {renderPurchaseConfirmedMail}=await import('../dist/modules/notifications/purchaseConfirmedMail.js');
 const mail=renderPurchaseConfirmedMail(model);assert.match(mail.text,/3\.000/);assert.doesNotMatch(mail.text,/esper.*cotiza|aprobar.*flete/i);
 const {renderOrderReceiptPdf}=await import('../dist/modules/onlineOrders/orderReceiptPdf.js');assert.equal((await renderOrderReceiptPdf(model)).subarray(0,5).toString(),'%PDF-');
 result='FAILED';const rejected=await pay('CLIENT6');await callback(rejected.token);assert.notEqual((await pool.query('select status from online_orders where id=$1',[rejected.orderId])).rows[0].status,'PAID');result='AUTHORIZED';
 const retry=await call('POST',`/online-orders/${rejected.orderId}/retry-payment`,{},'CLIENT6');assert.equal(transactions.get(retry.token).amount,transactions.get(rejected.token).amount);await callback(retry.token);
 const cancelled=await pay('CLIENT10'),cancelData=transactions.get(cancelled.token);
 await fetch(base+'/online-orders/payments/webpay/return',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({TBK_TOKEN:cancelled.token,TBK_ORDEN_COMPRA:cancelData.buy_order,TBK_ID_SESION:cancelData.session_id})});
 assert.notEqual((await pool.query('select status from online_orders where id=$1',[cancelled.orderId])).rows[0].status,'PAID');
 wrongAmount=true;const mismatch=await pay('CLIENT7');await callback(mismatch.token);assert.notEqual((await pool.query('select status from online_orders where id=$1',[mismatch.orderId])).rows[0].status,'PAID');wrongAmount=false;
 const one=await product(10000,1),q1=await quote(one),b1=makeBody(one,q1);const race=await Promise.allSettled(['CLIENT8','CLIENT9'].map(key=>call('POST','/online-orders/checkout',{...b1,checkoutKey:randomUUID()},key,[201,409])));assert.ok(race.every(r=>r.status==='fulfilled'));assert.equal((await pool.query('select count(*)::int n from online_order_items where product_id=$1',[one])).rows[0].n,1);
 await assert.rejects(()=>pool.query('update online_orders set delivery_fee=1 where id=$1',[p.orderId]));await assert.rejects(()=>pool.query('update delivery_policy_revisions set flat_fee=1 where id=$1',[policy.id]));
 await assert.rejects(()=>pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,delivery_recipient_name,delivery_phone,delivery_address,delivery_commune,reservation_expires_at,products_subtotal,products_discount_total,delivery_fee,delivery_policy_revision_id,delivery_fee_reason) values($1,$2,'PENDING_PAYMENT',48000,'DELIVERY','Receptor','123456789','Calle de prueba','Concepción',now()+interval '10 min',45000,0,3000,$3,'FLAT')",[users.CLIENT11,randomUUID(),policy.id]),e=>e.code==='23514');
 await save({flatFee:3000,freeShippingFrom:500000});
 console.log('PASS LOCAL: PG16 migration/replay/no data rewrite; net threshold/discounts/pickup; geographic and money tampering; old requests/approvals/checkout; snapshots/amounts immutable; admin/revision; payment replay/retry/mismatch; concurrent reservation');
 if(process.env.LOCAL_DELIVERY_VISUAL==='1'){console.log('VISUAL READY isolated API :5195; CLIENT20 / ADMIN @local.example.test; test-only password DemoLocal123!');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
}finally{if(server)await new Promise(r=>server.close(r));if(applicationDb)await applicationDb.$client.end();await pool.end();}

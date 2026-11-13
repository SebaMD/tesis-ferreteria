// Disposable native PostgreSQL; real services/locks, synthetic records and a fake SDK only.
// No migrations, seeds, external mail, provider network calls or existing databases.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { snapshotDdl } from './helpers/snapshotDdl.mjs';
import { independentCheckoutScenarios } from './helpers/independentCheckoutScenarios.mjs';

if (process.env.FYF_ALLOW_DISPOSABLE_DB_TESTS !== '1') throw Error('Not authorized: set FYF_ALLOW_DISPOSABLE_DB_TESTS=1 only after approval for disposable PostgreSQL tests.');

const parent = fileURLToPath(new URL('../tmp/', import.meta.url));
mkdirSync(parent,{recursive:true});
const root = mkdtempSync(path.join(parent,'fyf-payment-recovery-'));
const bin = process.env.PG_TEST_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const port = 55466;
const run = (name,args) => execFileSync(path.join(bin,name+(process.platform==='win32'?'.exe':'')),args,{stdio:'inherit',windowsHide:true});
let running=false,pool,db,server;
let statusCalls=0,createCalls=0,commitCalls=0,checks=0;
const provider=new Map();
const queriedTokens=[];
const commitResults=new Map();
try {
  run('initdb',['-D',path.join(root,'data'),'-U','postgres','-A','trust','--encoding=UTF8','--locale=C','--no-sync']);
  run('pg_ctl',['-D',path.join(root,'data'),'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c timezone=UTC`,'-w','start']); running=true;
  const url=`postgresql://postgres@127.0.0.1:${port}/postgres`;
  pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:5000});
  const target=(await pool.query("select current_setting('data_directory') dir,inet_server_port() port")).rows[0];
  assert.equal(realpathSync(target.dir),realpathSync(path.join(root,'data')));assert.equal(target.port,port);
  Object.assign(process.env,{DATABASE_URL:url,NODE_ENV:'test',MAIL_ENABLED:'false',WEBPAY_TIMEOUT_MS:'1000',WEBPAY_ENVIRONMENT:'integration',WEBPAY_COMMERCE_CODE:'',WEBPAY_API_KEY:'',SESSION_SECRET:randomBytes(32).toString('hex')});
  const sdk=(await import('transbank-sdk')).default;
  sdk.WebpayPlus.Transaction.prototype.status=async token=>{statusCalls++;queriedTokens.push(token);const result=provider.get(token);if(!result||result.error)throw Error('Simulated unknown provider result');await new Promise(r=>setTimeout(r,15));return {...result};};
  sdk.WebpayPlus.Transaction.prototype.create=async(buy_order,session_id,amount)=>{createCalls++;const token=`fake-new-${createCalls}`;provider.set(token,{buy_order,session_id,amount,status:'INITIALIZED'});return {token,url:'https://example.test/fake-webpay'};};
  sdk.WebpayPlus.Transaction.prototype.commit=async token=>{commitCalls++;if(!commitResults.has(token))throw Error('Simulated lost commit response');const result=commitResults.get(token);provider.set(token,result);return {...result};};
  const exerciseMigration=process.env.FYF_ALLOW_DISPOSABLE_MIGRATION_TEST === '1';
  const snapshot=JSON.parse(await readFile(new URL(`../drizzle/meta/${exerciseMigration?'0042':'0043'}_snapshot.json`,import.meta.url),'utf8'));
  for(const statement of snapshotDdl(snapshot)) await pool.query(statement);
  if(exerciseMigration) {
    const migration=await readFile(new URL('../drizzle/0043_independent_checkout.sql',import.meta.url),'utf8');
    for(const statement of migration.split('--> statement-breakpoint')) if(statement.trim())await pool.query(statement);
  }
  await pool.query("insert into roles(id,name) values(1,'CLIENT'),(2,'ADMIN')");
  await pool.query("insert into users(id,role_id,rut,names,surnames,correo,password,status,email_verified_at,auth_version) values(1,1,'11111111-1','Test','Client','test@example.test','unused','ACTIVE',now(),1)");
  await pool.query("insert into categories(id,name) values(1,'Test'); insert into products(id,category_id,name,price,unit_measure,current_stock,minimum_stock,status,in_store_only) values(1,1,'Test SKU',1000,'unidad',100,0,true,false)");
  ({db}=await import('../dist/db/index.js'));
  const service=await import('../dist/modules/onlineOrders/onlineOrders.service.js');
  const repo=await import('../dist/modules/onlineOrders/onlineOrders.repository.js');
  const {hashGuestDeviceId,hashGuestSessionId}=await import('../dist/modules/onlineOrders/guestOrderAccess.js');
  const device=randomBytes(32).toString('base64url'),session=randomBytes(32).toString('base64url');
  let seq=0;
  const make=async(guest,status='INITIALIZED',expired=false,clientId=1)=>{
    const n=++seq,token=`fake-stored-${n}`;
    const order=(await pool.query("insert into online_orders(client_id,guest_name,guest_email,guest_phone,guest_session_hash,guest_device_hash,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,$2,$3,$4,$5,$6,$7,'PENDING_PAYMENT',1000,'PICKUP',now()+$8::interval) returning id",[guest?null:clientId,guest?'Test':null,guest?'guest@example.test':null,guest?'123456789':null,guest?hashGuestSessionId(session):null,guest?hashGuestDeviceId(device):null,`fixture-key-${n}`,expired?'-1 minute':'10 minutes'])).rows[0];
    await pool.query('insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,1,1,1000,1000)',[order.id]);
    const payment=(await pool.query("insert into online_payments(order_id,buy_order,session_id,amount,status,token,redirect_url,created_at,updated_at) values($1,$2,$3,1000,'CREATED',$4,'https://example.test/old-webpay',now()-interval '5 minutes',now()-interval '5 minutes') returning id",[order.id,`buy-${n}`,`session-${n}`,token])).rows[0];
    provider.set(token,{status,response_code:status==='AUTHORIZED'?0:-2,amount:1000,buy_order:`buy-${n}`,session_id:`session-${n}`});
    return {id:order.id,paymentId:payment.id,token,guest};
  };
  const ready=async f=>pool.query("update online_payments set next_reconciliation_at=now()-interval '1 second' where order_id=$1 and next_reconciliation_at is not null",[f.id]);
  const read=async f=>(f.guest?await service.getGuestDeviceOrdersService(device):await service.getClientOrdersService(1)).find(o=>o.id===f.id);
  const pending=async f=>db.transaction(tx=>f.guest?repo.findPendingOrderForGuestSession(tx,hashGuestSessionId(session)):repo.findPendingOrderForClient(tx,1));
  const noPending=async f=>{assert.equal(await pending(f),null);checks++;};
  for(const guest of [false,true]) {
    const initialLaunches=createCalls,initialCommits=commitCalls;
    const live=await make(guest);
    assert.ok((await repo.findPaymentsNeedingReconciliation(new Date(Date.now()-60000),guest?{guestSessionHash:hashGuestSessionId(session)}:{clientId:1})).length,JSON.stringify((await pool.query('select now(),created_at,updated_at,status from online_payments')).rows));
    const before=statusCalls,order=await read(live);
    assert.ok(statusCalls>before);assert.equal(order.status,'PENDING_PAYMENT');assert.equal(order.canContinuePayment,false);assert.ok(order.paymentRecoveryMessage);assert.ok(await pending(live));checks++;
    await assert.rejects(guest?service.continueGuestOnlineOrderPaymentService(session):service.continueOnlineOrderPaymentService(1,live.id),e=>e.statusCode===409&&/no se reenviará/.test(e.message));checks++;
    assert.equal(createCalls,initialLaunches);assert.equal(commitCalls,initialCommits);
    await pool.query("update online_orders set reservation_expires_at=now()-interval '1 minute' where id=$1",[live.id]);
    assert.equal((await read(live)).status,'PENDING_PAYMENT');assert.ok(await pending(live));checks++;
    const timeoutIdentity=provider.get(live.token);
    await service.cancelWebpayPaymentService({buyOrder:timeoutIdentity.buy_order,sessionId:timeoutIdentity.session_id,outcome:'expired'});
    assert.equal((await read(live)).status,'EXPIRED');await noPending(live);
    const failed=await make(guest,'FAILED');
    assert.equal((await read(failed)).status,'PAYMENT_FAILED');await noPending(failed);
    const retry=()=>guest?service.retryGuestDeviceOnlineOrderPaymentService(device,failed.id):service.retryOnlineOrderPaymentService(1,failed.id);
    const launchesBefore=createCalls;
    const attempts=await Promise.allSettled([retry(),retry()]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(createCalls,launchesBefore+1);checks++;
    const launch=attempts.find(r=>r.status==='fulfilled').value;
    assert.notEqual(launch.token,failed.token);assert.equal(launch.total,1000);
    // Lost response: repeating retry cannot create another launch, even in the same browser.
    await assert.rejects(retry(),e=>e.statusCode===409);assert.equal(createCalls,launchesBefore+1);checks++;
    provider.set(launch.token,{...provider.get(launch.token),status:'FAILED',response_code:-2});
    await pool.query("update online_payments set updated_at=now()-interval '5 minutes' where token=$1",[launch.token]);await read(failed);await noPending(failed);
    const approved=await make(guest,'AUTHORIZED');
    const stock=(await pool.query('select current_stock from products where id=1')).rows[0].current_stock;
    // Refresh owns a query lease, not a barrier for other readers. A concurrent
    // reader may legitimately observe the pre-confirmation snapshot.
    const approvedLaunches=createCalls, approvedQueries=statusCalls;
    let deadline;
    const rows=await Promise.race([
      Promise.all([read(approved),read(approved)]),
      new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Concurrent refresh did not settle within 10 seconds')),10000);}),
    ]).finally(()=>clearTimeout(deadline));
    for(const row of rows) {
      assert.ok(['PENDING_PAYMENT','PAID'].includes(row.status));
      if(row.status==='PAID')assert.equal(row.payment.status,'AUTHORIZED');
      else {assert.equal(row.canContinuePayment,false);assert.equal(row.canRetryPayment,false);}
    }
    assert.deepEqual((await pool.query('select o.status,p.status payment_status from online_orders o join online_payments p on p.id=$2 and p.order_id=o.id where o.id=$1',[approved.id,approved.paymentId])).rows[0],{status:'PAID',payment_status:'AUTHORIZED'});
    assert.equal(statusCalls,approvedQueries+1,'Only one reader owns the provider-query lease');
    assert.equal((await read(approved)).status,'PAID');
    assert.equal(statusCalls,approvedQueries+1,'A settled payment requires no further reconciliation');
    assert.equal(createCalls,approvedLaunches,'Refresh must never launch another payment');
    assert.equal((await pool.query('select current_stock from products where id=1')).rows[0].current_stock,stock-1);
    assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[approved.id])).rows[0].n),1);checks++;
    const lostCommit=await make(guest);
    await pool.query("update online_payments set status='PROCESSING',updated_at=date_trunc('milliseconds',now()-interval '5 minutes') where id=$1",[lostCommit.paymentId]);
    const commitsBefore=commitCalls;
    const uncertainReads=await Promise.all([read(lostCommit),read(lostCommit)]);
    assert.ok(uncertainReads.every(o=>o.status==='PENDING_PAYMENT'));assert.equal(commitCalls,commitsBefore+1,'The reconciliation lease permits only one fake commit');assert.ok(await pending(lostCommit));checks++;
    provider.set(lostCommit.token,{...provider.get(lostCommit.token),status:'AUTHORIZED',response_code:0});
    await ready(lostCommit);
    await pool.query("update online_payments set updated_at=date_trunc('milliseconds',now()-interval '5 minutes') where id=$1",[lostCommit.paymentId]);
    assert.equal((await read(lostCommit)).status,'PAID');assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[lostCommit.id])).rows[0].n),1);checks++;
    const uncertain=await make(guest,'INITIALIZED',true),uncertainResult=provider.get(uncertain.token);provider.set(uncertain.token,{error:true});
    assert.equal((await read(uncertain)).status,'PENDING_PAYMENT');assert.ok(await pending(uncertain));checks++;
    provider.set(uncertain.token,{...uncertainResult,status:'FAILED',response_code:-2});await ready(uncertain);assert.equal((await read(uncertain)).status,'PAYMENT_FAILED');await noPending(uncertain);
    const review=await make(guest,'INITIALIZED',true),original=provider.get(review.token);
    provider.set(review.token,{error:true});await pool.query("update online_payments set created_at=now()-interval '2 hours' where id=$1",[review.paymentId]);
    const unknown=await read(review);assert.equal(unknown.status,'PAYMENT_REVIEW');assert.equal(unknown.blocksNewPayment,false);assert.equal(unknown.requiresPaymentAttention,true);assert.ok(await pending(review));checks++;
    await assert.rejects(guest?service.retryGuestDeviceOnlineOrderPaymentService(device,review.id):service.retryOnlineOrderPaymentService(1,review.id),e=>e.statusCode===409);checks++;
    provider.set(review.token,{...original,status:'FAILED',response_code:-2});
    await ready(review);
    assert.equal((await read(review)).status,'PAYMENT_FAILED');await noPending(review);
    const outOfStock=await make(guest,'FAILED');await read(outOfStock);
    await pool.query('update products set current_stock=0 where id=1');const beforeStockRetry=createCalls;
    await assert.rejects(guest?service.retryGuestDeviceOnlineOrderPaymentService(device,outOfStock.id):service.retryOnlineOrderPaymentService(1,outOfStock.id),e=>e.statusCode===409&&/stock/.test(e.message));
    assert.equal(createCalls,beforeStockRetry);await pool.query('update products set current_stock=100 where id=1');checks++;
    const ambiguousTerminal=await make(guest);
    await pool.query("update online_orders set status='EXPIRED' where id=$1",[ambiguousTerminal.id]);
    await pool.query("update online_payments set status='PROCESSING' where id=$1",[ambiguousTerminal.paymentId]);
    const beforeAmbiguousRetry=createCalls;
    await assert.rejects(guest?service.retryGuestDeviceOnlineOrderPaymentService(device,ambiguousTerminal.id):service.retryOnlineOrderPaymentService(1,ambiguousTerminal.id),e=>e.statusCode===409&&/conciliación/.test(e.message));
    assert.equal(createCalls,beforeAmbiguousRetry);checks++;
    await pool.query("update online_payments set status='EXPIRED' where id=$1",[ambiguousTerminal.paymentId]);
  }
  const isolated=await make(true,'AUTHORIZED');
  const statusBefore=statusCalls;
  assert.deepEqual(await service.getGuestDeviceOrdersService(randomBytes(32).toString('base64url')),[]);
  assert.equal(statusCalls,statusBefore);assert.equal((await read(isolated)).status,'PAID');checks++;
  await assert.rejects(service.retryGuestDeviceOnlineOrderPaymentService(randomBytes(32).toString('base64url'),isolated.id),e=>e.statusCode===404);checks++;
  await assert.rejects(service.continueOnlineOrderPaymentService(999,isolated.id),e=>e.statusCode===403);checks++;
  const {default:router}=await import('../dist/modules/onlineOrders/onlineOrders.routes.js');
  const app=express();app.use(express.urlencoded({extended:false}));app.use(express.json());app.use('/api/online-orders',router);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  let httpChecks=0;
  const initialHttpLaunches=createCalls;
  const callback=async(method,parameters,query={})=>{
    const base=`http://127.0.0.1:${server.address().port}/api/online-orders/payments/webpay/return`;
    const url=base+'?'+new URLSearchParams(method==='GET'?parameters:query);
    const response=await fetch(url,{method,redirect:'manual',...(method==='POST'?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(parameters)}:{})});
    assert.equal(response.status,303);httpChecks++;return response.headers.get('location');
  };
  const state=async f=>(await pool.query('select o.status,p.status payment_status from online_orders o join online_payments p on p.order_id=o.id where o.id=$1 order by p.id desc limit 1',[f.id])).rows[0];
  const identifiers=f=>({TBK_TOKEN:f.token,TBK_ORDEN_COMPRA:provider.get(f.token).buy_order,TBK_ID_SESION:provider.get(f.token).session_id});
  for(const guest of [false,true])for(const method of ['GET','POST']) {
    for(const status of ['AUTHORIZED','FAILED']) {
      const f=await make(guest,status);commitResults.set(f.token,provider.get(f.token));
      await callback(method,{token_ws:f.token});assert.equal((await state(f)).status,status==='AUTHORIZED'?'PAID':'PAYMENT_FAILED');checks++;
      await callback(method,{token_ws:f.token});assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[f.id])).rows[0].n),status==='AUTHORIZED'?1:0);checks++;
    }
    const cancelled=await make(guest),abort=identifiers(cancelled);
    await callback(method,abort);assert.equal((await state(cancelled)).status,'CANCELLED');checks++;
    const timeout=await make(guest),{TBK_TOKEN:unused,...timeoutIds}=identifiers(timeout);
    await callback(method,timeoutIds);assert.equal((await state(timeout)).status,'EXPIRED');checks++;
    for(const status of ['INITIALIZED','FAILED','AUTHORIZED']) {
      const f=await make(guest,status),before=commitCalls;
      await callback(method,{...identifiers(f),token_ws:f.token});
      assert.equal((await state(f)).status,status==='INITIALIZED'?'PENDING_PAYMENT':status==='FAILED'?'PAYMENT_FAILED':'PAID');assert.equal(commitCalls,before,'Error returns only inspect the result');checks++;
    }
    const unknown=await make(guest),unknownIds=identifiers(unknown);provider.set(unknown.token,{error:true});
    await callback(method,unknownIds);assert.equal((await state(unknown)).status,'PENDING_PAYMENT');checks++;
    const f=await make(guest),ids=identifiers(f),before=JSON.stringify(await state(f));
    for(const parameters of [{},{token_ws:f.token,extra:'unexpected'},{TBK_TOKEN:f.token},{TBK_ID_SESION:ids.TBK_ID_SESION},{...ids,token_ws:'different-token'},{token_ws:f.token,TBK_ORDEN_COMPRA:ids.TBK_ORDEN_COMPRA}]) {
      const observed=[statusCalls,commitCalls,createCalls];
      assert.ok((await callback(method,parameters)).includes('INVALID_RETURN'));assert.deepEqual([statusCalls,commitCalls,createCalls],observed);assert.equal(JSON.stringify(await state(f)),before);checks++;
    }
    await callback(method,{...ids,TBK_ORDEN_COMPRA:'wrong-order'});assert.equal(JSON.stringify(await state(f)),before);checks++;
    if(method==='POST') {
      assert.ok((await callback(method,{token_ws:f.token},{token_ws:'conflicting-token'})).includes('INVALID_RETURN'));assert.equal(JSON.stringify(await state(f)),before);checks++;
    }
  }
  for(const guest of [false,true]) {
    const f=await make(guest,'INITIALIZED',true),original=provider.get(f.token);
    provider.set(f.token,{error:true});await pool.query("update online_payments set created_at=now()-interval '2 hours' where id=$1",[f.paymentId]);
    assert.equal((await read(f)).status,'PAYMENT_REVIEW');provider.set(f.token,original);
    const snapshot=await state(f),lease=(await pool.query('select reservation_expires_at::text lease from online_orders where id=$1',[f.id])).rows[0].lease,amountBefore=(await pool.query('select current_stock from products where id=1')).rows[0].current_stock;
    await ready(f);assert.equal((await read(f)).requiresPaymentAttention,true);await read(f);
    assert.equal((await pool.query('select reservation_expires_at::text lease from online_orders where id=$1',[f.id])).rows[0].lease,lease);
    assert.deepEqual(await state(f),snapshot);assert.ok(await pending(f));assert.equal((await pool.query('select current_stock from products where id=1')).rows[0].current_stock,amountBefore);checks++;
    provider.set(f.token,{...original,status:'FAILED',response_code:-2});await ready(f);await read(f);assert.equal((await state(f)).status,'PAYMENT_FAILED');checks++;
    const approved=await make(guest,'AUTHORIZED',true);
    await pool.query("update online_orders set status='PAYMENT_REVIEW' where id=$1",[approved.id]);
    await read(approved);assert.equal((await state(approved)).payment_status,'AUTHORIZED');assert.equal((await state(approved)).status,'PAYMENT_REVIEW');checks++;
    const processing=await make(guest,'INITIALIZED',true);
    await pool.query("update online_orders set status='PAYMENT_REVIEW' where id=$1",[processing.id]);
    await pool.query("update online_payments set status='PROCESSING',created_at=now()-interval '2 hours',updated_at=date_trunc('milliseconds',now()-interval '5 minutes') where id=$1",[processing.paymentId]);
    assert.equal((await read(processing)).requiresPaymentAttention,true);assert.equal((await state(processing)).payment_status,'PROCESSING');checks++;
    const raced=await make(guest,'AUTHORIZED',true);commitResults.set(raced.token,provider.get(raced.token));
    await Promise.all([callback('POST',{token_ws:raced.token}),service.reconcileDueOnlinePaymentsService({orderId:raced.id}),callback('GET',{token_ws:raced.token})]);
    assert.equal((await state(raced)).status,'PAID');assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[raced.id])).rows[0].n),1);checks++;
    const late=await make(guest,'INITIALIZED',true),beforeStatus=statusCalls;
    const reconciliation=service.reconcileDueOnlinePaymentsService({orderId:late.id});
    while(statusCalls===beforeStatus)await new Promise(resolve=>setTimeout(resolve,1));
    commitResults.set(late.token,{...provider.get(late.token),status:'AUTHORIZED',response_code:0});
    await Promise.all([reconciliation,callback('POST',{token_ws:late.token})]);
    assert.equal((await state(late)).status,'PAID');assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[late.id])).rows[0].n),1);checks++;
  }
  const mismatch=await make(false,'FAILED'),mismatchResult=provider.get(mismatch.token);
  provider.set(mismatch.token,{...mismatchResult,amount:99999});
  await callback('GET',{...identifiers(mismatch),token_ws:mismatch.token});assert.equal((await state(mismatch)).status,'PENDING_PAYMENT');checks++;
  const api=`http://127.0.0.1:${server.address().port}/api/online-orders`;
  assert.equal((await fetch(api)).status,401);checks++;
  const clientRead=await fetch(api,{headers:{Authorization:`Bearer ${jwt.sign({id:1,authVersion:1},process.env.SESSION_SECRET)}`}});
  assert.equal(clientRead.status,200);const clientOrders=(await clientRead.json()).data;
  const clientIds=(await pool.query('select id from online_orders where client_id=1')).rows.map(r=>r.id).sort((a,b)=>a-b);
  assert.deepEqual(clientOrders.map(o=>o.id).sort((a,b)=>a-b),clientIds);checks++;
  const guestRead=await fetch(api+'/guest/device-orders',{headers:{Cookie:`fyf_guest_device=${device}`}});
  assert.equal(guestRead.status,200);const guestOrders=(await guestRead.json()).data;
  const guestIds=(await pool.query('select id from online_orders where guest_device_hash=$1',[hashGuestDeviceId(device)])).rows.map(r=>r.id).sort((a,b)=>a-b);
  assert.deepEqual(guestOrders.map(o=>o.id).sort((a,b)=>a-b),guestIds);checks++;
  const other=await fetch(api+'/guest/device-orders',{headers:{Cookie:`fyf_guest_device=${randomBytes(32).toString('base64url')}`}});
  assert.equal(other.status,200);assert.deepEqual((await other.json()).data,[]);checks++;
  assert.equal((await fetch(api+'/guest/order',{headers:{'X-Guest-Order-Token':randomBytes(32).toString('base64url')}})).status,404);checks++;
  assert.equal(createCalls,initialHttpLaunches,'Callbacks and authorized refresh reads must not create any Webpay transaction');
  await independentCheckoutScenarios({pool,service,provider,commitResults,launches:()=>createCalls});
  // Actual middleware/JWT and full PostgreSQL constraints, not mocked authorization.
  await pool.query("insert into users(id,role_id,rut,names,surnames,correo,password,status,email_verified_at,auth_version) values(9,1,'99999999-9','Isolated','Buyer','isolated@example.test','unused','ACTIVE',now(),1)");
  const ownerA=await make(false),ownerB=await make(false,'INITIALIZED',false,9);
  const auth=id=>({Authorization:`Bearer ${jwt.sign({id,authVersion:1},process.env.SESSION_SECRET)}`});
  let isolationChecks=0;
  const ownershipBefore=(await pool.query('select id,client_id,checkout_key from online_orders where id in ($1,$2) order by id',[ownerA.id,ownerB.id])).rows;
  for(const [clientId,own,foreign] of [[1,ownerA,ownerB],[9,ownerB,ownerA]]) {
    const first=queriedTokens.length,launches=createCalls;
    for(const [method,path] of [['GET',`/${foreign.id}`],['POST',`/${foreign.id}/retry-payment`],['POST',`/${foreign.id}/continue-payment`],['PATCH',`/${foreign.id}/archive`]]) {
      const denied=await fetch(api+path,{method,headers:auth(clientId)});
      assert.equal(denied.status,404);assert.ok(!(await denied.text()).includes(foreign.token));isolationChecks++;
    }
    assert.ok(!queriedTokens.slice(first).includes(foreign.token),'Unauthorized reads/actions cannot reconcile the foreign payment');
    assert.equal(createCalls,launches);
    const ownRead=await fetch(api+`/${own.id}`,{headers:auth(clientId)});assert.equal(ownRead.status,200);assert.equal((await ownRead.json()).data.id,own.id);isolationChecks++;
    const list=await fetch(api,{headers:auth(clientId)});assert.equal(list.status,200);const rows=(await list.json()).data;
    assert.ok(rows.some(o=>o.id===own.id));assert.ok(rows.every(o=>o.id!==foreign.id));isolationChecks++;
  }
  assert.deepEqual((await pool.query('select id,client_id,checkout_key from online_orders where id in ($1,$2) order by id',[ownerA.id,ownerB.id])).rows,ownershipBefore);
  const key=randomBytes(16).toString('hex'),request={checkoutKey:key,deliveryType:'PICKUP',items:[{productId:2,quantity:1}]};
  request.quoteFingerprint=(await service.quoteOnlineOrderService(request)).quoteFingerprint;
  const launchesBeforeSpoof=createCalls;
  const spoof=await fetch(api+'/checkout',{method:'POST',headers:{...auth(9),'Content-Type':'application/json'},body:JSON.stringify({...request,clientId:1})});assert.equal(spoof.status,400);assert.equal(createCalls,launchesBeforeSpoof);isolationChecks++;
  const created=[];
  for(const clientId of [1,9]) {
    const response=await fetch(api+'/checkout',{method:'POST',headers:{...auth(clientId),'Content-Type':'application/json'},body:JSON.stringify(request)});
    assert.equal(response.status,201);const data=(await response.json()).data;created.push(data.orderId);
    assert.equal((await pool.query('select client_id from online_orders where id=$1',[data.orderId])).rows[0].client_id,clientId);isolationChecks++;
  }
  assert.notEqual(created[0],created[1],'The same checkout key in two owner namespaces cannot return the other owner order');
  console.log(`PASS ${isolationChecks} two-client HTTP isolation checks: own lists/details, forbidden cross-owner refresh/retry/continue/archive, spoofed owner and owner-scoped checkout keys.`);
  // Fair scheduling: the first unresolved batch must not monopolize subsequent batches.
  const queue=[];for(let i=0;i<60;i++)queue.push(await make(false));
  const queryStart=queriedTokens.length;
  await service.reconcileDueOnlinePaymentsService({clientId:1});
  await service.reconcileDueOnlinePaymentsService({clientId:1});
  const visited=new Set(queriedTokens.slice(queryStart));for(const f of queue)assert.ok(visited.has(f.token));checks++;
  const concurrent=await make(false),concurrentStart=queriedTokens.length;
  await Promise.all([service.reconcileDueOnlinePaymentsService({orderId:concurrent.id}),service.reconcileDueOnlinePaymentsService({orderId:concurrent.id})]);
  assert.equal(queriedTokens.slice(concurrentStart).filter(token=>token===concurrent.token).length,1);checks++;
  const persisted=await make(false,'AUTHORIZED');
  const restartedService=await import('../dist/modules/onlineOrders/onlineOrders.service.js?fresh-instance');
  await restartedService.reconcileDueOnlinePaymentsService({orderId:persisted.id});
  assert.equal((await state(persisted)).status,'PAID');checks++;
  const beyondWindow=await make(false),windowStart=statusCalls;
  await pool.query("update online_payments set created_at=now()-interval '8 days' where id=$1",[beyondWindow.paymentId]);
  await service.reconcileDueOnlinePaymentsService({orderId:beyondWindow.id});
  assert.equal(statusCalls,windowStart);assert.equal((await state(beyondWindow)).status,'PAYMENT_REVIEW');
  assert.equal((await pool.query('select next_reconciliation_at from online_payments where id=$1',[beyondWindow.paymentId])).rows[0].next_reconciliation_at,null);
  assert.equal((await state(beyondWindow)).payment_status,'CREATED');checks++;
  console.log('PASS 5 HTTP authorization/read requests: client session, guest device isolation, invalid secure link and no new transaction.');
  console.log(`PASS ${httpChecks} real HTTP callbacks with fake provider: GET/POST, authorization/rejection/abort/timeout/error, invalid/conflicting parameters and reconciliation races; REVIEW+CREATED+INITIALIZED remains blocked.`);
  // Allow best-effort notification tasks to finish before disposing the private pool.
  await new Promise(resolve=>setTimeout(resolve,150));
  console.log(`PASS payment recovery: ${checks} state/concurrency checks; ${statusCalls} fake status calls, ${createCalls} fake launches, ${commitCalls} commits; real isolated row locks and stock writes.`);
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  await db?.$client.end();await pool?.end();
  if(running)run('pg_ctl',['-D',path.join(root,'data'),'-m','fast','-w','stop']);
  assert.equal(path.dirname(realpathSync(root)),realpathSync(parent));assert.ok(path.basename(root).startsWith('fyf-payment-recovery-'));
  rmSync(root,{recursive:true,force:true});
}

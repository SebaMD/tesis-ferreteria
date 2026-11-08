import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Called only by the explicitly opted-in disposable PostgreSQL harness.
export async function independentCheckoutScenarios({ pool, service, provider, commitResults, launches }) {
  await pool.query("insert into users(id,role_id,rut,names,surnames,correo,password,status,email_verified_at) values(3,1,'33333333-3','Independent','Client','independent@example.test','unused','ACTIVE',now()),(2,2,'22222222-2','Test','Admin','admin@example.test','unused','ACTIVE',now())");
  await pool.query("insert into delivery_policy_revisions(id,version,pickup_enabled,delivery_enabled,flat_fee,is_demo,pricing_mode,created_by) values(1,1,true,true,0,false,'LOCAL_FIXED',2); insert into delivery_settings(id,current_revision_id) values(1,1)");
  await pool.query("insert into products(id,category_id,name,price,unit_measure,current_stock) values(2,1,'Independent drill',1000,'unidad',10),(3,1,'Independent hammer',1000,'unidad',10),(4,1,'Last unit',1000,'unidad',1)");
  let cases = 0;
  for (const guest of [false, true]) {
    const { hashGuestSessionId } = await import('../../dist/modules/onlineOrders/guestOrderAccess.js');
    const session=randomBytes(32).toString('base64url'), device=randomBytes(32).toString('base64url');
    const body = async (id, key=randomBytes(16).toString('hex')) => {
      const data={checkoutKey:key,items:[{productId:id,quantity:1}],deliveryType:'PICKUP',deliveryRecipientName:null,deliveryPhone:null,deliveryAddress:null,deliveryCommune:null,deliveryReference:null,deliveryLatitude:null,deliveryLongitude:null,saveDeliveryAddress:false};
      data.quoteFingerprint=(await service.quoteOnlineOrderService(data)).quoteFingerprint;
      if(guest) {
        await pool.query("update email_verification_challenges set consumed_at=now() where guest_session_hash=$1 and consumed_at is null",[hashGuestSessionId(session)]);
        const challenge=(await pool.query("insert into email_verification_challenges(email,purpose,guest_session_hash,pin_hash,expires_at,last_sent_at,verified_at) values('guest@example.test','GUEST_CHECKOUT',$1,repeat('a',64),now()+interval '10 minutes',now(),now()) returning id",[hashGuestSessionId(session)])).rows[0];
        Object.assign(data,{guestName:'Test Guest',guestEmail:'guest@example.test',guestPhone:'123456789',emailVerificationChallengeId:challenge.id});
      }
      return data;
    };
    const create=data=>guest?service.createGuestCheckoutService(session,device,data):service.createCheckoutService(3,data);
    const state=async id=>(await pool.query('select status,total from online_orders where id=$1',[id])).rows[0];
    const approve=async payment=>{commitResults.set(payment.token,{...provider.get(payment.token),status:'AUTHORIZED',response_code:0});return service.confirmWebpayPaymentService(payment.token);};
    const a=await create(await body(2)), beforeA=await state(a.orderId);
    const b=await create(await body(3)); assert.notEqual(a.orderId,b.orderId);assert.notEqual(a.token,b.token);cases++;
    await approve(b);assert.equal((await state(b.orderId)).status,'PAID');assert.deepEqual(await state(a.orderId),beforeA);cases++;
    await assert.rejects(guest?service.retryGuestOnlineOrderPaymentService(a.guestAccessToken):service.retryOnlineOrderPaymentService(3,a.orderId),e=>e.statusCode===409);cases++;
    const c=await create(await body(3));provider.set(c.token,{...provider.get(c.token),status:'FAILED',response_code:-2});
    await service.inspectWebpayReturnService({token:c.token});
    const retry=guest?await service.retryGuestOnlineOrderPaymentService(c.guestAccessToken):await service.retryOnlineOrderPaymentService(3,c.orderId);
    assert.equal(retry.orderId,c.orderId);assert.notEqual(retry.token,c.token);cases++;
    const same=await body(3), before=launches();
    const duplicate=await Promise.allSettled([create(same),create(same)]);
    assert.equal(duplicate.filter(r=>r.status==='fulfilled').length,1);assert.equal(launches(),before+1);
    await assert.rejects(create({...same,items:[{productId:2,quantity:1}]}),e=>e.statusCode===409&&/otra selección/.test(e.message));cases++;
    const distinct=[await create(await body(2)),await create(await body(3))];assert.notEqual(distinct[0].orderId,distinct[1].orderId);cases++;
    // Concurrent distinct guest checkouts require two independently verified session proofs.
    if(!guest) { const requests=[await body(2),await body(3)];const parallel=await Promise.all(requests.map(create));assert.notEqual(parallel[0].orderId,parallel[1].orderId);distinct.push(...parallel);cases++; }
    await pool.query('update products set current_stock=1 where id=4');
    const last=await create(await body(4)), count=launches();
    await assert.rejects(body(4),/stock/);assert.equal(launches(),count);cases++;
    // A late approval cannot steal B's sold unit; preserve evidence and move A to review.
    await pool.query('update products set current_stock=0 where id=2');
    await approve(a);assert.equal((await state(a.orderId)).status,'PAYMENT_REVIEW');assert.equal((await state(b.orderId)).status,'PAID');
    assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[a.orderId])).rows[0].n),0);cases++;
    await Promise.all([approve(b),approve(b)]);
    assert.equal(Number((await pool.query('select count(*) n from inventory_movements where online_order_id=$1',[b.orderId])).rows[0].n),1);cases++;
    // Resolve only synthetic fixtures so the next owner can exercise the last unit.
    for(const payment of [retry,last,...distinct,duplicate.find(r=>r.status==='fulfilled').value]) {
      provider.set(payment.token,{...provider.get(payment.token),status:'FAILED',response_code:-2});
      await service.inspectWebpayReturnService({token:payment.token});
    }
    await pool.query('update products set current_stock=10 where id in (2,3)');
  }
  console.log(`PASS ${cases} independent purchase scenarios against full snapshot constraints (fake Webpay).`);
}

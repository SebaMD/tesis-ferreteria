import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCartCheckout, rememberOrderCart, consumePaidCartSnapshot, consumeCreatedCartSnapshot } from '../src/helpers/cartCheckoutSnapshot.js';
import { paymentResultAccessMessage } from '../src/helpers/paymentResultContext.js';
import { groupBuyerOrders } from '../src/helpers/buyerOrderGroups.js';
import { getOnlineOrderStatus } from '../src/helpers/onlineOrders.js';
import { createCheckoutIntent } from '../src/helpers/checkoutIntent.js';

function fixture(key='fyf_client_cart_client_1') {
  const data=new Map(), storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const items=[{product:{id:1},quantity:1},{product:{id:2},quantity:2}];
  storage.setItem(key,JSON.stringify(items));storage.setItem(`${key}:revision`,'v1');
  const snapshot=captureCartCheckout(storage,key,items,[items[0]]);
  rememberOrderCart(storage,key,10,snapshot);
  return {key,items,storage,snapshot,order:{id:10,status:'PAID',items:[{productId:1,quantity:1}]}};
}
test('legacy undetached checkout snapshot cleans only after payment and only once',()=>{
  const f=fixture(),raw=f.storage.getItem(f.key);
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,{...f.order,status:'PENDING_PAYMENT'}),null);
  assert.equal(f.storage.getItem(f.key),raw);
  assert.deepEqual(consumePaidCartSnapshot(f.storage,f.key,f.order),[f.items[1]]);
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
});
test('late A cannot affect a modified B cart, even if SKU quantities happen to match later',()=>{
  const f=fixture();f.storage.setItem(`${f.key}:revision`,'v2');
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
  f.storage.setItem(`${f.key}:revision`,'v1');
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
});
test('new checkout generation invalidates A even with exactly the same selection',()=>{
  const f=fixture();f.storage.setItem(`${f.key}:revision`,'intent-B');
  const b=captureCartCheckout(f.storage,f.key,f.items,[f.items[0]]);rememberOrderCart(f.storage,f.key,11,b);
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
  assert.deepEqual(consumePaidCartSnapshot(f.storage,f.key,{...f.order,id:11}),[f.items[1]]);
});
test('B payment cannot clear later additions, other device/owner or a direct purchase without snapshot',()=>{
  const f=fixture();f.storage.setItem(f.key,JSON.stringify([...f.items,{product:{id:3},quantity:1}]));
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
  assert.equal(consumePaidCartSnapshot(f.storage,'other-owner',f.order),null);
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,{...f.order,id:999}),null);
});
test('guest session changed, mismatched historical quantities, or storage failure preserve cart',()=>{
  const f=fixture('fyf_client_cart_guest');f.storage.setItem('fyf_guest_checkout_session','new-session');
  assert.equal(consumePaidCartSnapshot(f.storage,f.key,f.order),null);
  const g=fixture();assert.equal(consumePaidCartSnapshot(g.storage,g.key,{...g.order,items:[{productId:1,quantity:2}]}),null);
  assert.equal(consumePaidCartSnapshot({getItem(){throw Error('blocked');}},g.key,g.order),null);
});
test('authorized review is not unpaid; real active purchases precede terminal attempts in separate groups',()=>{
  const orders=[{id:1,status:'PAYMENT_REVIEW',payment:{status:'CREATED'},createdAt:'2026-01-01'},
    {id:2,status:'PAYMENT_REVIEW',payment:{status:'AUTHORIZED'},createdAt:'2026-01-02'},
    {id:3,status:'PREPARING',createdAt:'2026-01-03'},{id:4,status:'DELIVERED',createdAt:'2026-01-04'},
    {id:5,status:'FAILED'},{id:6,status:'PAID',createdAt:'2026-01-06'}];
  const groups=groupBuyerOrders(orders);
  assert.deepEqual(groups.active.map(o=>o.id),[6,3]);assert.deepEqual(groups.review.map(o=>o.id),[2]);
  assert.deepEqual(groups.payments.map(o=>o.id),[1]);assert.deepEqual(groups.delivered.map(o=>o.id),[4]);
});
test('financial messaging never infers authorization from review or no charge from terminal status',()=>{
  assert.match(getOnlineOrderStatus('PAYMENT_REVIEW','AUTHORIZED').description,/fue autorizado/);
  assert.doesNotMatch(getOnlineOrderStatus('PAYMENT_REVIEW','CREATED').description,/fue autorizado/);
  for(const status of ['PAYMENT_FAILED','CANCELLED','EXPIRED'])assert.doesNotMatch(getOnlineOrderStatus(status).description,/ningún cargo|no se realizó/i);
  assert.match(getOnlineOrderStatus('EXPIRED','PROCESSING').label,/Verificando/);
  const mixed=groupBuyerOrders([{id:20,status:'EXPIRED',payment:{status:'PROCESSING'}}]);
  assert.equal(mixed.incomplete.length,0);assert.equal(mixed.payments.length,1);
});
test('two explicit purchase intentions have different keys; no financial state is carried over',()=>{
  const a=createCheckoutIntent('GUEST_CART',[{product:{id:1},quantity:1}]);
  const b=createCheckoutIntent('GUEST_CART',[{product:{id:1},quantity:1}]);
  assert.notEqual(a.checkoutKey,b.checkoutKey);assert.deepEqual(a.items,b.items);assert.equal('token' in b,false);
});

test('persisted checkout detaches only its snapshot; later payment never detaches twice',()=>{
  for(const key of ['fyf_client_cart_client_1','fyf_client_cart_guest']){
    const f=fixture(key),payment={orderId:10,token:'new-launch'};
    const remaining=consumeCreatedCartSnapshot(f.storage,key,payment,f.snapshot);
    assert.deepEqual(remaining,[f.items[1]]);
    f.storage.setItem(key,JSON.stringify(remaining));
    assert.equal(consumeCreatedCartSnapshot(f.storage,key,payment,f.snapshot),null);
    assert.equal(consumePaidCartSnapshot(f.storage,key,f.order),null);
    assert.deepEqual(JSON.parse(f.storage.getItem(`${key}:paid-snapshot:10`)).selected,[{productId:1,quantity:1}]);
  }
});

test('failed/unknown creation, direct purchase, changed cart or guest identity never detach',()=>{
  for(const payment of [null,{}, {orderId:10},{orderId:-1,token:'x'}]){
    const f=fixture(),raw=f.storage.getItem(f.key);
    assert.equal(consumeCreatedCartSnapshot(f.storage,f.key,payment,f.snapshot),null);
    assert.equal(f.storage.getItem(f.key),raw);
  }
  const f=fixture();f.storage.setItem(`${f.key}:revision`,'added-after-request');
  assert.equal(consumeCreatedCartSnapshot(f.storage,f.key,{orderId:10,token:'new'},f.snapshot),null);
  assert.equal(consumeCreatedCartSnapshot(f.storage,f.key,{orderId:11,token:'direct'},null),null);
  const g=fixture('fyf_client_cart_guest');g.storage.setItem('fyf_guest_checkout_session','other');
  assert.equal(consumeCreatedCartSnapshot(g.storage,g.key,{orderId:10,token:'new'},g.snapshot),null);
});

test('inaccessible and missing result context does not disclose existence or imply rejection',()=>{
  for(const status of [401,403,404]){
    const text=paymentResultAccessMessage(status);
    assert.match(text,/Mis pedidos/);assert.doesNotMatch(text,/Pedido no encontrado|rechazado|autorizado|ningún cargo/);
  }
  assert.equal(paymentResultAccessMessage(503),null);
});

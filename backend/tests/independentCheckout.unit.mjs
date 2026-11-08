import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkoutRequestHash, providerQueryWindowEnded, PROVIDER_QUERY_WINDOW_MS } from '../dist/modules/onlineOrders/checkoutIdentity.js';
import { snapshotDdl } from './helpers/snapshotDdl.mjs';
import { onlinePaymentsTable, onlineOrdersTable } from '../dist/db/schema/index.js';
const data={items:[{productId:2,quantity:1},{productId:1,quantity:2}],deliveryType:'PICKUP',quoteFingerprint:'q',saveDeliveryAddress:false};
test('request identity is order-independent but binds items, quote, delivery and guest identity',()=>{
  assert.equal(checkoutRequestHash(data),checkoutRequestHash({...data,items:[...data.items].reverse()}));
  for(const change of [{items:[{productId:1,quantity:1}]},{quoteFingerprint:'new'},{deliveryType:'DELIVERY'},{deliveryAddress:'other'},{saveDeliveryAddress:true}])assert.notEqual(checkoutRequestHash(data),checkoutRequestHash({...data,...change}));
  assert.notEqual(checkoutRequestHash(data,{guestName:'Guest',guestEmail:'a@example.test',guestPhone:'123456789'}),checkoutRequestHash(data,{guestName:'Guest',guestEmail:'b@example.test',guestPhone:'123456789'}));
});
test('query window exhaustion is distinct from financial failure',()=>{
  const time=Date.UTC(2026,10,7);
  assert.equal(providerQueryWindowEnded(new Date(time-PROVIDER_QUERY_WINDOW_MS+1),time),false);
  assert.equal(providerQueryWindowEnded(new Date(time-PROVIDER_QUERY_WINDOW_MS),time),true);
});
test('prepared snapshot retains full constraints and removes only the global pending uniqueness',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../drizzle/meta/0043_snapshot.json',import.meta.url),'utf8'));
  const ddl=snapshotDdl(snapshot).join(';\n');
  assert.equal(onlinePaymentsTable.nextReconciliationAt.getSQLType(),snapshot.tables['public.online_payments'].columns.next_reconciliation_at.type);
  assert.equal(onlineOrdersTable.checkoutRequestHash.getSQLType(),snapshot.tables['public.online_orders'].columns.checkout_request_hash.type);
  for(const name of ['online_orders_client_checkout_key_unique','online_orders_guest_checkout_key_unique','online_payments_token_unique','online_payments_buy_order_unique','inventory_movements_online_order_product_exit_unique'])assert.ok(ddl.includes(name));
  assert.doesNotMatch(ddl,/online_orders_pending_client_unique|online_orders_pending_guest_session_unique/);
  assert.match(ddl,/not null/);assert.match(ddl,/foreign key/);assert.match(ddl,/check \(/);
  const migration=await readFile(new URL('../drizzle/0043_independent_checkout.sql',import.meta.url),'utf8');
  assert.equal((migration.match(/DROP INDEX/g)||[]).length,2);assert.doesNotMatch(migration,/DELETE FROM|UPDATE "|DROP TABLE/i);
});

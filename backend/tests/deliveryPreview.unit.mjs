import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const { previewDeliveryAnnouncement, validateDeliverySettings } = await import('../dist/modules/deliverySettings/deliverySettings.service.js');
const { deliveryAnnouncement, calculateDelivery } = await import('../dist/modules/deliverySettings/deliveryPricing.js');
const base = { pricingMode: 'LOCAL_FIXED', pickupEnabled: true, deliveryEnabled: true, flatFee: 3000, freeShippingFrom: 500000, minimumProductsTotal: null, isDemo: false, expectedRevisionId: 1 };
for (const patch of [{}, { deliveryEnabled: false }, { flatFee: 4500 }, { freeShippingFrom: null }, { freeShippingFrom: 25000 }, { flatFee: 0 }]) {
  test(`preview matches published generator exactly: ${JSON.stringify(patch)}`, () => {
    const body = { ...base, ...patch }, original = structuredClone(body);
    const { expectedRevisionId: _, ...values } = validateDeliverySettings(body);
    const persisted = { ...values, id: 2, version: 2 };
    assert.deepEqual(previewDeliveryAnnouncement(body), deliveryAnnouncement(persisted));
    assert.deepEqual(body, original);
    assert.doesNotMatch(previewDeliveryAnnouncement(body).message, /pedidos existentes|revisión/);
  });
}
test('strict free-shipping boundary and input validation remain unchanged', () => {
  const { expectedRevisionId: _, ...values } = validateDeliverySettings(base);
  const policy = { ...values, id: 2, version: 2 };
  assert.equal(calculateDelivery(policy, 'DELIVERY', 500000).fee, 3000);
  assert.equal(calculateDelivery(policy, 'DELIVERY', 500001).fee, 0);
  for (const patch of [{ flatFee: -1 }, { freeShippingFrom: 0 }, { title: 'manual' }, { message: 'manual' }]) assert.throws(() => previewDeliveryAnnouncement({ ...base, ...patch }));
});

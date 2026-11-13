// Real controllers/services, with repository and transaction mocks: never load the DB pool.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { validatePromotion, promotionPeriodError } from '../dist/modules/promotions/promotions.validation.js';
const now = new Date('2026-11-13T02:30:45Z');
const payload = { name: 'Ensayo', type: 'PERCENTAGE_DISCOUNT', percentage: 10, isActive: false, startsAt: '2026-11-13T02:31:00Z', endsAt: null, productIds: [1], categoryIds: [] };
let current, writes = 0;
mock.module(new URL('../dist/db/index.js', import.meta.url).href, { namedExports: { db: { transaction: callback => callback({}) } } });
mock.module(new URL('../dist/modules/promotions/promotions.repository.js', import.meta.url).href, { namedExports: {
  acquirePromotionPricingLock: async () => {}, findPromotionForUpdateTx: async () => current, findPromotionById: async () => current,
  findPromotions: async () => [], findPromotionTargets: async () => ({}), findPromotionScopesTx: async () => ({ products: [], promotions: [], productTargets: [], categoryTargets: [] }),
  validateTargetRecordsTx: async () => ({ products: [{ id: 1, categoryId: 1, name: 'Ensayo', status: true }], categories: [] }),
  insertPromotionTx: async (_tx, input) => { writes++; current = { id: 1, ...input }; return current; },
  updatePromotionTx: async (_tx, id, input) => { writes++; current = { id, ...input }; return current; },
  setPromotionStatusTx: async () => {}, deletePromotionTx: async () => {},
} });
const { createPromotionController, updatePromotionController, listPromotionsController } = await import('../dist/modules/promotions/promotions.controller.js');

test('date parsing rejects malformed calendars and missing zones without depending on server TZ', () => {
  for (const startsAt of ['invalid', '2026-02-30T12:00:00Z', '2026-11-13T25:00:00Z', '2026-11-13T02:31']) assert.equal(validatePromotion({ ...payload, startsAt }).success, false);
  for (const startsAt of ['2026-11-13T02:31:00Z', '2026-11-12T23:31:00-03:00']) assert.equal(validatePromotion({ ...payload, startsAt }).value.startsAt.getTime(), Date.parse(payload.startsAt));
});
test('minute precision, strict end ordering, and exact historical start exemption', () => {
  const start = new Date('2026-11-13T02:30:00Z');
  assert.equal(promotionPeriodError({ startsAt: start, endsAt: null }, null, now), null);
  assert.ok(promotionPeriodError({ startsAt: new Date(start - 60_000), endsAt: null }, null, now));
  assert.ok(promotionPeriodError({ startsAt: start, endsAt: start }, null, now));
  const old = new Date('2026-10-01T12:00:20.123Z');
  assert.equal(promotionPeriodError({ startsAt: old, endsAt: new Date(old.getTime() + 1) }, old, now), null);
  assert.ok(promotionPeriodError({ startsAt: new Date(old.getTime() + 1), endsAt: null }, old, now));
});
test('direct HTTP create/update requests enforce the server clock and keep history', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: now.getTime() });
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: 1 }; next(); });
  app.post('/promotions', createPromotionController); app.patch('/promotions/:id', updatePromotionController);
  app.get('/promotions', listPromotionsController);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/promotions`;
  const send = async (body, edit = false) => { const response = await fetch(url + (edit ? '/1' : ''), { method: edit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  try {
    const listing = await fetch(url); assert.match(listing.headers.get('access-control-expose-headers'), /Date/); assert.ok(Number.isFinite(Date.parse(listing.headers.get('date'))));
    const before = writes;
    assert.equal((await send({ ...payload, startsAt: '2026-11-13T02:29:59Z' })).status, 400); assert.equal(writes, before);
    for (const endsAt of [payload.startsAt, '2026-11-13T02:30:00Z']) assert.equal((await send({ ...payload, endsAt })).status, 400);
    assert.equal((await send(payload)).status, 201);
    assert.equal((await send({ ...payload, endsAt: '2026-11-13T02:32:00Z' })).status, 201);
    assert.equal((await send({ ...payload, startsAt: '2026-11-12T23:30:00-03:00' })).status, 201);
    current = { id: 1, ...validatePromotion({ ...payload, startsAt: '2026-10-01T12:00:20.123Z', endsAt: '2026-10-01T12:00:40.456Z' }).value };
    const historical = { ...payload, startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString(), name: 'Nuevo nombre' };
    assert.equal((await send(historical, true)).status, 200); assert.equal(current.startsAt.toISOString(), historical.startsAt);
    const saved = writes; const rejected = await send({ ...historical, startsAt: '2026-09-01T12:00:00Z' }, true);
    assert.equal(rejected.status, 400); assert.equal(rejected.body.status, 'error'); assert.match(rejected.body.message, /fecha de inicio/); assert.equal(writes, saved);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

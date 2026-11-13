// Real manual-notice controllers/services, in-memory repositories: no database pool.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { validateCustomerNotice, customerNoticePeriodError } from '../dist/modules/customerNotice/customerNotice.validation.js';
const now = new Date('2026-11-13T02:30:45Z');
const payload = { title: 'Aviso ficticio', message: 'Contenido de ensayo', isActive: false, displaySeconds: 7, startsAt: null, endsAt: null };
let current, writes = 0;
const saved = input => { writes++; current = { id: 1, imagePath: null, ...input }; return current; };
mock.module(new URL('../dist/db/index.js', import.meta.url).href, { namedExports: { db: { transaction: callback => callback({}) } } });
mock.module(new URL('../dist/modules/deliverySettings/deliverySettings.service.js', import.meta.url).href, { namedExports: { currentDeliveryPolicy: async () => ({ mode: 'LOCAL_FIXED' }) } });
mock.module(new URL('../dist/modules/deliverySettings/deliveryPricing.js', import.meta.url).href, { namedExports: { deliveryAnnouncement: () => ({ kind: 'LOCAL_FIXED', title: 'Automático de ensayo' }), publicDeliveryInformation: () => ({ mode: 'LOCAL_FIXED' }) } });
mock.module(new URL('../dist/modules/customerNotice/customerNotice.repository.js', import.meta.url).href, { namedExports: {
  createCustomerNotice: async input => saved(input), updateCustomerNoticeById: async (_id, input) => saved(input), findCustomerNoticeById: async () => current,
  findCatalogPresentation: async () => null, findCustomerNotices: async () => current ? [current] : [], findPublicCustomerNotices: async () => [],
  deleteCustomerNoticeById: async () => null, reorderCustomerNotices: async () => [], setCatalogPresentationImagePath: async () => null,
  setCustomerNoticeImagePath: async () => null, updateCatalogPresentation: async () => null,
} });
const controller = await import('../dist/modules/customerNotice/customerNotice.controller.js');

test('ISO instants reject invalid calendars, missing zones and malformed input', () => {
  for (const startsAt of ['invalid', '2026-02-30T12:00:00Z', '2026-11-13T25:00:00Z', '2026-11-13T02:31', 123]) assert.equal(validateCustomerNotice({ ...payload, startsAt }).success, false);
  assert.equal(validateCustomerNotice(payload).success, true);
  const zoned = validateCustomerNotice({ ...payload, startsAt: '2026-11-12T23:31:00-03:00' });
  assert.equal(zoned.value.startsAt.toISOString(), '2026-11-13T02:31:00.000Z');
});
test('minute precision, strict end ordering, immediate start and exact historical exceptions', () => {
  const start = new Date('2026-11-13T02:30:00Z');
  assert.equal(customerNoticePeriodError({ startsAt: start, endsAt: null }, null, now), null);
  assert.ok(customerNoticePeriodError({ startsAt: new Date(start - 1), endsAt: null }, null, now));
  for (const end of [start, new Date(start - 1)]) assert.ok(customerNoticePeriodError({ startsAt: start, endsAt: end }, null, now));
  assert.equal(customerNoticePeriodError({ startsAt: null, endsAt: new Date(now.getTime() + 1) }, null, now), null);
  assert.ok(customerNoticePeriodError({ startsAt: null, endsAt: now }, null, now));
  const historical = { startsAt: null, endsAt: new Date('2026-10-01T12:00:40.456Z') };
  assert.equal(customerNoticePeriodError(historical, historical, now), null);
  assert.ok(customerNoticePeriodError({ ...historical, endsAt: new Date(historical.endsAt - 1) }, historical, now));
});
test('direct HTTP requests enforce server time, preserve history and leave automatic notices independent', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: now.getTime() });
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { id: 1 }; next(); });
  app.post('/notices', controller.createCustomerNoticeController); app.put('/notices/:id', controller.updateCustomerNoticeController);
  app.get('/notices', controller.getCustomerNoticeConfiguration); app.get('/public', controller.getPublicCustomerNotice);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (body, edit = false) => { const res = await fetch(base + '/notices' + (edit ? '/1' : ''), { method: edit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  try {
    assert.match((await fetch(base + '/notices')).headers.get('access-control-expose-headers'), /Date/);
    const before = writes;
    for (const body of [
      { ...payload, startsAt: '2026-11-13T02:29:59Z' },
      { ...payload, startsAt: '2026-11-13T02:31:00Z', endsAt: '2026-11-13T02:31:00Z' },
      { ...payload, startsAt: '2026-11-13T02:31:00Z', endsAt: '2026-11-13T02:30:00Z' },
      { ...payload, endsAt: now.toISOString() },
    ]) assert.equal((await send(body)).status, 400);
    assert.equal(writes, before);
    for (const body of [payload, { ...payload, startsAt: '2026-11-12T23:30:00-03:00' }, { ...payload, startsAt: '2026-11-13T02:31:00Z', endsAt: '2026-11-13T02:32:00Z' }, { ...payload, endsAt: '2026-11-13T02:31:00Z' }]) {
      const response = await send(body); assert.equal(response.status, 201); assert.equal(response.body.data.isActive, false);
    }
    for (const startsAt of ['2026-10-01T12:00:20.123Z', null]) {
      const historical = { ...payload, startsAt, endsAt: '2026-10-01T12:00:40.456Z' };
      current = { id: 1, ...validateCustomerNotice(historical).value };
      const response = await send({ ...historical, title: 'Título editado' }, true);
      assert.equal(response.status, 200); assert.equal(response.body.data.startsAt, startsAt); assert.equal(response.body.data.endsAt, historical.endsAt);
      assert.equal((await send({ ...historical, startsAt: '2026-09-01T12:00:00Z' }, true)).status, 400);
      if (!startsAt) assert.equal((await send({ ...historical, endsAt: '2026-09-01T12:00:00Z' }, true)).status, 400);
    }
    const publicData = (await (await fetch(base + '/public')).json()).data;
    assert.deepEqual(publicData.deliveryAnnouncement, { kind: 'LOCAL_FIXED', title: 'Automático de ensayo', imageUrl: null });
    assert.deepEqual(publicData.notices, []);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

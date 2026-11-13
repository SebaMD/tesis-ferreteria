// Real backend controller/service with database and repository mocked, never a DB connection.
// Run with: node --experimental-test-module-mocks --test tests/promotion-deletion.test.mjs
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let current, deleted, locked;
mock.module(new URL('../../backend/dist/db/index.js', import.meta.url).href, { namedExports: { db: { transaction: callback => callback({}) } } });
mock.module(new URL('../../backend/dist/modules/promotions/promotions.repository.js', import.meta.url).href, { namedExports: {
  acquirePromotionPricingLock: async () => { locked++; },
  findPromotionForUpdateTx: async () => current,
  deletePromotionTx: async (_tx, id) => { deleted.push(id); },
  findPromotionById: async () => current,
  findPromotions: async () => [], findPromotionTargets: async () => ({}),
  findPromotionScopesTx: async () => ({}), validateTargetRecordsTx: async () => ({}),
  insertPromotionTx: async () => {}, updatePromotionTx: async () => {}, setPromotionStatusTx: async () => {},
} });
const { deletePromotionController } = await import('../../backend/dist/modules/promotions/promotions.controller.js');

test('real deletion controller/service: unused succeeds, history and missing IDs never delete', async () => {
  deleted = []; locked = 0;
  const request = async id => {
    const response = { code: null, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await deletePromotionController({ params: { id: String(id) } }, response);
    return response;
  };
  current = { id: 1, usageCount: 0 };
  const success = await request(1);
  assert.equal(success.code, 200); assert.deepEqual(success.body.data, { deleted: true }); assert.deepEqual(deleted, [1]);
  current = { id: 2, usageCount: 1 };
  const conflict = await request(2);
  assert.equal(conflict.code, 409); assert.match(conflict.body.message, /trazabilidad/); assert.deepEqual(deleted, [1]);
  current = null;
  assert.equal((await request(3)).code, 404); assert.equal((await request('invalid')).code, 400);
  assert.deepEqual(deleted, [1]); assert.equal(locked, 3);
});

test('shared modal, current role restrictions and backend DELETE endpoint are preserved', async () => {
  const page = await readFile(new URL('../src/pages/PromotionsPage.jsx', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../../backend/src/modules/promotions/promotions.routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /window\.confirm/);
  assert.match(page, /title="Eliminar promoción"/);
  assert.match(page, /disabled=\{promotion\.usageCount > 0 \|\| deleting\}/);
  assert.match(page, /deleteInFlight\.current = true/);
  assert.match(routes, /verifyRoles\(\["ADMIN", "MANAGER"\]\)/);
  assert.match(routes, /router\.delete\("\/:id", deletePromotionController\)/);
});

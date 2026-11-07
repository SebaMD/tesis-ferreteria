import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditEmptyFilters, auditFilterValidationMessage, auditQueryFromSearch, auditQueryToSearch } from '../src/helpers/auditNavigation.js';

test('audit IDs remain independent, combine without coercion and omit empty fields', () => {
  const filters = { ...auditEmptyFilters, productId: '22', familyId: '22' };
  const search = new URLSearchParams(auditQueryToSearch(filters));
  assert.equal(search.get('productId'), '22');
  assert.equal(search.get('familyId'), '22');
  assert.deepEqual(auditQueryFromSearch(auditQueryToSearch(filters)), { ...filters, page: '1' });
  assert.equal(new URLSearchParams(auditQueryToSearch(auditEmptyFilters)).has('productId'), false);
  assert.equal(new URLSearchParams(auditQueryToSearch(auditEmptyFilters)).has('familyId'), false);
  for (const key of ['productId', 'familyId']) for (const value of ['0', '-1', '022', '1.5', '1e2', '2147483648']) {
    assert.ok(auditFilterValidationMessage({ ...auditEmptyFilters, [key]: value }));
  }
});

test('numbered audit pages are direct, bounded and independent of cursor history', () => {
  const filters={...auditEmptyFilters,page:'21'};
  assert.deepEqual(auditQueryFromSearch(auditQueryToSearch(filters)),filters);
  assert.equal(auditFilterValidationMessage(filters),'');
  for(const page of ['0','-1','1.5','01','1e2','1000001']) assert.ok(auditFilterValidationMessage({...filters,page}));
  assert.equal(auditQueryFromSearch('?cursor=legacy').page,'1');
});

test('audit date labels preserve UTC day boundaries and Chilean event display', async () => {
  const backend = await readFile(new URL('../../backend/src/modules/productAudits/productAudits.service.ts', import.meta.url), 'utf8');
  assert.match(backend, /q\.familyId\}::integer is null or e\.family_id=\$\{q\.familyId\}/);
  assert.match(backend, /q\.productId\}::integer is null or e\.product_id=\$\{q\.productId\}/);
  assert.match(backend, /e\.created_at >= \$\{q\.from\}::date::timestamp at time zone 'UTC'/);
  assert.match(backend, /e\.created_at < \(\$\{q\.to\}::date \+ 1\)::timestamp at time zone 'UTC'/);
  assert.ok(auditFilterValidationMessage({ ...auditEmptyFilters, from: '0000-11-04' }));
  assert.match(auditFilterValidationMessage({ ...auditEmptyFilters, from: '2026-11-04', to: '2026-11-04' }), /estrictamente anterior/);
  const presentation = await readFile(new URL('../src/helpers/auditPresentation.js', import.meta.url), 'utf8');
  assert.match(presentation, /timeZone: "America\/Santiago"/);
});

test('table centering and shared pagination remain opt-in, including descriptive columns', async () => {
  const read = file => readFile(new URL('../src/' + file, import.meta.url), 'utf8');
  const [inventory, history, audit, pagination] = await Promise.all(['components/GroupedInventoryTable.jsx', 'pages/ProductsPage.jsx', 'components/ProductAuditHistory.jsx', 'components/Pagination.jsx'].map(read));
  for (const label of ['Precio', 'Stock', 'Mínimo', 'Acciones']) assert.ok(inventory.includes(`<th>${label}</th>`));
  assert.match(inventory, /table-row-actions inventory-row-actions/);
  assert.match(history, /<th className="text-center">Cantidad<\/th>/);
  assert.match(history, /numericCellClass\} text-center`\}>\{movement.quantity\}/);
  assert.match(audit, /<AppSelect[^>]*searchable/);
  assert.match(audit, /<Pagination page=\{page\}/);
  assert.match(pagination, /disabled=\{disabled \|\| page === totalPages\}/);
  assert.match(audit, /totalItems=\{response\?\.totalItems\} totalPages=\{totalPages\}/);
});

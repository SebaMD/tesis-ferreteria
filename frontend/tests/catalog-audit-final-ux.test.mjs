import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EMPTY_CATALOG_FILTERS, mergeAdditionalCatalogFilters, validatePriceRange } from '../src/helpers/catalogFilters.js';
import { auditEmptyFilters, auditFilterValidationMessage } from '../src/helpers/auditNavigation.js';

test('additional catalog drafts merge atomically without overwriting the applied category', () => {
  const applied = { ...EMPTY_CATALOG_FILTERS, categoryId: '3' };
  const draft = { ...applied, categoryId: 'old', minPrice: '20000', maxPrice: '30000', brand: 'Prueba', availability: 'in-stock', buy2Pay1: true };
  const before = structuredClone(applied);
  const next = mergeAdditionalCatalogFilters(applied, draft);
  assert.deepEqual(applied, before);
  assert.equal(next.categoryId, '3');
  for (const key of ['minPrice', 'maxPrice', 'brand', 'availability', 'buy2Pay1']) assert.equal(next[key], draft[key]);
  assert.equal(validatePriceRange('-1', '').valid, false);
  assert.equal(validatePriceRange('30000', '20000').valid, false);
  assert.deepEqual(validatePriceRange('', ''), { valid: true, min: null, max: null });
});

test('automatic audit filters reject partial/invalid IDs and dates without inventing constraints on optional dates', () => {
  const validate = fields => auditFilterValidationMessage({ ...auditEmptyFilters, ...fields });
  for (const productId of ['-1', '0', '1.5', '1e2', '2147483648']) assert.ok(validate({ productId }));
  for (const from of ['2026', '2026-11', '2026-02-30', '2025-02-29', '2026-13-01']) assert.ok(validate({ from }));
  assert.ok(validate({ from: '2026-11-05', to: '2026-11-04' }));
  assert.equal(validate({ from: '2024-02-29' }), '');
  assert.equal(validate({ to: '2026-11-04', productId: '2147483647' }), '');
  assert.ok(auditFilterValidationMessage(auditEmptyFilters, { from: true }));
  assert.ok(auditFilterValidationMessage(auditEmptyFilters, { productId: true }));
});

test('catalog submits drafts explicitly; audit stays mounted and uses automatic debounced URL filters', async () => {
  const read = file => readFile(new URL('../src/' + file, import.meta.url), 'utf8');
  const [catalog, filters, audit, detail, cart, css] = await Promise.all(['pages/CatalogPage.jsx', 'components/CatalogFilters.jsx', 'components/ProductAuditHistory.jsx', 'pages/ProductDetailPage.jsx', 'pages/ClientCartPage.jsx', 'styles/styles.css'].map(read));
  assert.match(catalog, /filters: draftFilters, onChange: setDraftFilters/);
  assert.match(filters, /<form[\s\S]*?onSubmit=/);
  assert.match(filters, /type="submit"[^>]*>Aplicar filtros/);
  assert.doesNotMatch(audit, /key=\{`\$\{location.key\}/);
  assert.match(audit, /setTimeout\(\(\) => apply\(draft, draftState.incomplete\), 450\)/);
  assert.match(audit, /controller.abort\(\)/);
  assert.doesNotMatch(audit, />Filtrar<\/button>/);
  assert.ok(detail.indexOf('<ProductPromotionPrice') < detail.indexOf('family-options-link'));
  assert.match(cart, /aria-label="Limpiar carrito" title="Limpiar carrito"/);
  assert.match(css, /\.public-page-header > \.compact-back-link \{ grid-column: 1; grid-row: 1;/);
});

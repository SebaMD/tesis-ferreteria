import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { rememberCatalogEntry, readCatalogEntry, readCatalogRestoration, resolveProductDetailReturn } from '../src/helpers/catalogNavigation.js';
import { explorationDestination, explorationOwner, rememberExploration, resetClientExploration } from '../src/helpers/explorationNavigation.js';
import { bundleDraft, conversionDraft } from '../src/helpers/productBundleForm.js';
import { reviewAfterEntry } from '../src/helpers/createdProductsStock.js';
import { routeScrollAction } from '../src/helpers/routeScroll.js';
const read = file => readFile(new URL('../src/' + file, import.meta.url), 'utf8');

test('new explicit variant creation has two independent blank rows; saved editing/conversion unchanged', () => {
  const draft = bundleDraft(null, { name: 'Prueba', price: 1000, initialStock: 6 }, true);
  assert.equal(draft.rows.length, 2);
  assert.notEqual(draft.rows[0].key, draft.rows[1].key);
  assert.equal(draft.rows[1].price, '');
  assert.equal(draft.rows[1].initialStock, '');
  assert.equal(bundleDraft(null, {}).rows.length, 1);
  assert.equal(conversionDraft({ product: { id: 1 }, revision: 'r' }).rows.length, 1);
});

test('entry success changes only server-confirmed SKU stock, never initial quantities or siblings', () => {
  const review = { familyId: 20, items: [{ product: { id: 1, currentStock: 5 }, initialStock: 5 }, { product: { id: 2, currentStock: 0 }, initialStock: 0 }] };
  const after = reviewAfterEntry(review, 1, { quantity: 2, stock: { currentStock: 7 } });
  assert.equal(after.familyId, 20);
  assert.equal(after.items[0].product.currentStock, 7);
  assert.equal(after.items[0].initialStock, 5);
  assert.equal(after.items[1], review.items[1]);
  assert.equal(review.items[0].product.currentStock, 5);
  assert.match(after.confirmation, /correctamente/);
  const second = reviewAfterEntry(after, 2, { quantity: 3, stock: { currentStock: 3 } });
  assert.deepEqual(second.items.map(i => i.product.currentStock), [7, 3]);
});

test('exploration remembers filters, page, search and exact family variant, never checkout/token data', () => {
  resetClientExploration();
  const storage = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  const owner = explorationOwner({ role: 'CLIENT', id: 4 });
  rememberCatalogEntry('listing', { snapshot: { filters: { brand: 'Marca' }, order: 'price-desc', page: 3, pageSize: 20 } });
  rememberExploration({ pathname: '/catalog', search: '?search=brocha&token=secret', key: 'listing', state: { checkoutDraft: { email: 'private' } } }, owner, 850, storage);
  const listing = explorationDestination(owner, '/orders', storage);
  assert.equal(listing.to.search, '?search=brocha');
  assert.equal(listing.state.restoreCatalog.snapshot.page, 3);
  assert.equal(listing.state.restoreCatalog.snapshot.filters.brand, 'Marca');
  rememberExploration({ pathname: '/catalog/families/18', search: '?variant=100&token=secret', key: 'family' }, owner, 400, storage);
  const detail = explorationDestination(owner, '/favorites', storage);
  assert.equal(detail.to.search, '?variant=100');
  assert.equal(detail.state.restoreClientScrollKey, 'family');
  const back = resolveProductDetailReturn(detail.state);
  assert.equal(back.state.restoreCatalog.snapshot.page, 3);
  assert.equal(back.state.restoreCatalog.scrollY, 850);
  assert.doesNotMatch(storage.value, /secret|private|checkoutDraft/);
  assert.equal(explorationDestination('CLIENT:5', '/orders', storage).to, '/catalog');
  assert.equal(explorationDestination(owner, '/catalog/families/18', storage).to, '/catalog');
});

test('unknown/external paths are never used as catalog navigation destinations', () => {
  resetClientExploration();
  const storage = { getItem: () => JSON.stringify({ owner: 'GUEST', entry: { pathname: '//evil.example', search: '?token=x' } }) };
  assert.equal(explorationDestination('GUEST', '/cart', storage).to, '/catalog');
  rememberExploration({ pathname: '/checkout', state: { email: 'private' } }, 'GUEST', 0, storage);
  assert.equal(explorationDestination('GUEST', '/cart', storage).to, '/catalog');
});
test('history snapshots and cached pages from another account cannot restore filters', () => {
  rememberCatalogEntry('account-entry', { owner: 'CLIENT:1', snapshot: { page: 4 } });
  assert.equal(readCatalogEntry('account-entry', 'CLIENT:2'), null);
  assert.equal(readCatalogRestoration({ restoreCatalog: { owner: 'CLIENT:1', snapshot: { page: 4 } } }, 'CLIENT:2'), null);
  assert.equal(readCatalogRestoration({ restoreCatalog: { snapshot: { page: 4 } } }, 'CLIENT:2'), null);
  assert.deepEqual(routeScrollAction(null, { pathname: '/catalog', key: 'old', state: { restoreCatalog: { owner: 'CLIENT:1', scrollY: 900 } } }, 'POP', null, 'CLIENT:2'), { x: 0, y: 0 });
});

test('movement guard, uncertain-result review and native suggestion cleanup remain explicit', async () => {
  const products = await read('pages/ProductsPage.jsx');
  assert.match(await read('pages/CatalogPage.jsx'), /<CatalogContents key=\{owner\} owner=\{owner\}/);
  assert.match(products, /if \(movementGuard.current \|\| submittingMovement\) return/);
  assert.match(products, /reviewAfterEntry\(entryReviewRef.current/);
  assert.match(products, /uncertainProductId/);
  assert.match(products, /returnToReview: true/);
  const editor = await read('components/ProductBundleEditor.jsx');
  assert.match(editor, /input\[list\]/);
  assert.match(editor, /removeEventListener\('scroll', dismissSuggestions, true\)/);
});

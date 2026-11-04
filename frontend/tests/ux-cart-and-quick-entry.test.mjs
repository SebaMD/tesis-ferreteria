import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { cartExplorationReturn, rememberExploration, resetClientExploration } from '../src/helpers/explorationNavigation.js';
import { informationNavigationState } from '../src/helpers/informationNavigation.js';
import { rememberCatalogEntry } from '../src/helpers/catalogNavigation.js';

test('cart ignores purchases as a return target and recovers catalog exploration for the same account', () => {
  resetClientExploration();
  const owner = 'CLIENT:7';
  rememberCatalogEntry('list', { owner, snapshot: { filters: { categoryId: '3' }, order: 'price-desc', page: 2 } });
  rememberExploration({ pathname: '/catalog', search: '?search=brocha', key: 'list' }, owner, 640);
  const state = { ...informationNavigationState({ pathname: '/orders', key: 'orders' }, '/cart'), cartOwner: owner };
  const back = cartExplorationReturn(state, owner);
  assert.equal(back.label, 'Volver al catálogo');
  assert.deepEqual(back.to, { pathname: '/catalog', search: '?search=brocha' });
  assert.equal(back.state.restoreCatalog.snapshot.filters.categoryId, '3');
  assert.equal(back.state.restoreCatalog.snapshot.order, 'price-desc');
  assert.equal(back.state.restoreCatalog.snapshot.page, 2);
  assert.equal(back.state.restoreCatalog.scrollY, 640);
  assert.equal(cartExplorationReturn(state, 'CLIENT:8').to, '/catalog');
});

test('cart keeps exact product/variant origin from the toast without returning to an unrelated section', () => {
  resetClientExploration();
  const location = { pathname: '/catalog/families/18', search: '?variant=100', key: 'detail', state: { productDetailOrigin: { source: 'catalog', owner: 'GUEST', scrollY: 700 } } };
  const state = { ...informationNavigationState(location, '/cart'), cartOwner: 'GUEST' };
  const back = cartExplorationReturn(state, 'GUEST');
  assert.equal(back.label, 'Volver al catálogo');
  assert.equal(back.to.pathname, '/catalog/families/18');
  assert.equal(back.to.search, '?variant=100');
  assert.equal(back.state.restoreClientScrollKey, 'detail');
  assert.equal(back.state.productDetailOrigin.scrollY, 700);
  assert.equal(cartExplorationReturn(null, 'GUEST').to, '/catalog');
});

test('empty cart has no redundant header return and quick-entry presentation is explicitly scoped', async () => {
  const read = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
  const cart = await read('pages/ClientCartPage.jsx');
  assert.match(cart, /items.length > 0 && <div[^\n]+<CompactBackLink/);
  assert.match(cart, /Explorar catálogo/);
  const catalog = await read('pages/CatalogPage.jsx');
  assert.doesNotMatch(catalog, /Explorar desde cero/);
  assert.match(catalog, /readCatalogEntry\(location.key, owner\)/);
  const products = await read('pages/ProductsPage.jsx');
  assert.match(products, /linkedRegistration.returnToReview && linkedRegistration.quickFlow/);
  assert.match(products, /quickFlow: Boolean\(creationReview.category\)/);
  assert.match(products, /flowActions=\{quickReviewEntry \? \{ left:/);
  assert.match(products, /type="submit" form=\{movementFormId\}/);
  assert.match(products, /!quickReviewEntry && <div className=\{formActionsClass\}/);
  assert.match(products, /movementGuard.current \|\| submittingMovement/);
});

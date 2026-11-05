import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { cartExplorationReturn, rememberExploration, resetClientExploration } from '../src/helpers/explorationNavigation.js';
import { informationNavigationState } from '../src/helpers/informationNavigation.js';
import { rememberCatalogEntry } from '../src/helpers/catalogNavigation.js';

test('cart returns to the actual orders origin rather than stale catalog exploration', () => {
  resetClientExploration();
  const owner = 'CLIENT:7';
  rememberCatalogEntry('list', { owner, snapshot: { filters: { categoryId: '3' }, order: 'price-desc', page: 2 } });
  rememberExploration({ pathname: '/catalog', search: '?search=brocha', key: 'list' }, owner, 640);
  const state = { ...informationNavigationState({ pathname: '/orders', key: 'orders' }, '/cart'), cartOwner: owner };
  const back = cartExplorationReturn(state, owner);
  assert.equal(back.label, 'Volver a mis pedidos');
  assert.equal(back.to.pathname, '/orders');
  assert.equal(cartExplorationReturn(state, 'CLIENT:8').to.pathname, '/catalog');
  for (const [pathname, label] of [['/account', 'Volver a mi cuenta'], ['/favorites', 'Volver a favoritos']]) {
    const source = { ...informationNavigationState({ pathname, key: pathname }, '/cart'), cartOwner: owner };
    assert.equal(cartExplorationReturn(source, owner).label, label);
    assert.equal(cartExplorationReturn(source, 'GUEST').to.pathname, '/catalog');
    assert.equal(cartExplorationReturn({ ...source, cartOwner: 'GUEST' }, 'GUEST').to.pathname, '/catalog');
  }
  assert.equal(cartExplorationReturn(null, owner).to.pathname, '/catalog');
});

test('cart keeps exact product/variant origin from the toast without returning to an unrelated section', () => {
  resetClientExploration();
  const location = { pathname: '/catalog/families/18', search: '?variant=100', key: 'detail', state: { productDetailOrigin: { source: 'catalog', owner: 'GUEST', scrollY: 700 } } };
  const state = { ...informationNavigationState(location, '/cart'), cartOwner: 'GUEST' };
  const back = cartExplorationReturn(state, 'GUEST');
  assert.equal(back.label, 'Volver al producto');
  assert.equal(back.to.pathname, '/catalog/families/18');
  assert.equal(back.to.search, '?variant=100');
  assert.equal(back.state.restoreClientScrollKey, 'detail');
  assert.equal(back.state.productDetailOrigin.scrollY, 700);
  assert.equal(cartExplorationReturn(null, 'GUEST').to.pathname, '/catalog');
});

test('empty cart has no redundant header return and quick-entry presentation is explicitly scoped', async () => {
  const read = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');
  const cart = await read('pages/ClientCartPage.jsx');
  assert.match(cart, /items.length > 0 && <div[^\n]+<CompactBackLink/);
  assert.match(cart, /Explorar catálogo/);
  assert.match(cart, /onClick=\{clearProducts\} aria-label="Limpiar carrito" title="Limpiar carrito"><Trash2 size=\{18\} aria-hidden="true" \/><span>Limpiar carrito<\/span>/);
  const navbar = await read('components/ClientNavbar.jsx');
  assert.doesNotMatch(navbar, /Mis compras|>Pedidos</);
  assert.match(await read('pages/GuestDeviceOrdersPage.jsx'), /Mis pedidos en este dispositivo/);
  assert.match(await read('pages/ClientOrdersPage.jsx'), />Mis pedidos<\/h1>/);
  const catalog = await read('pages/CatalogPage.jsx');
  assert.doesNotMatch(catalog, /Explorar desde cero/);
  assert.match(catalog, /readCatalogEntry\(location.key, owner\)/);
  const products = await read('pages/ProductsPage.jsx');
  assert.match(products, /linkedRegistration.returnToReview && linkedRegistration.origin === "CATEGORY_QUICK"/);
  assert.match(products, /origin: creationReview.origin/);
  assert.match(products, /if \(registration.origin !== "CATEGORY_QUICK"\)/);
  assert.match(products, /if \(linkedRegistration.origin !== "CATEGORY_QUICK"\)/);
  assert.match(products, /flowActions=\{quickReviewEntry \? \{ left:/);
  assert.match(products, /type="submit" form=\{movementFormId\}/);
  assert.match(products, /!reviewEntry && <div className=\{formActionsClass\}/);
  assert.match(products, /movementGuard.current \|\| submittingMovement/);
});

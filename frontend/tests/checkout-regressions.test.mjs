import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiveCheckoutQuote, acceptCheckoutQuote, createLatestCheckoutRequest, checkoutQuoteFailure } from '../src/helpers/checkoutQuote.js';
import { EMPTY_CHECKOUT_DESTINATION, mergeSavedCheckoutDestination, savedCheckoutDestination } from '../src/helpers/checkoutDestination.js';
import { createCheckoutDraftStore } from '../src/helpers/checkoutDraft.js';
import { informationNavigationState, informationReturn } from '../src/helpers/informationNavigation.js';
const read = p => readFile(new URL('../src/' + p, import.meta.url), 'utf8');
const quote = signature => ({ commercialSignature: signature, quoteFingerprint: `fingerprint-${signature}`, total: signature === 'pickup' ? '5990.00' : '8990.00' });

test('initial pickup/local selection, including returning to pickup, is not a previous acceptance', () => {
  let state = receiveCheckoutQuote({}, 'pickup', quote('pickup'), 'PICKUP');
  assert.equal(state.acceptedSignature, undefined);
  assert.equal(state.needsAcceptance, false);
  for (const mode of ['local', 'pickup', 'local']) {
    state = receiveCheckoutQuote(state, mode, quote(mode), mode === 'local' ? 'DELIVERY' : 'PICKUP');
    assert.equal(state.needsAcceptance, false);
  }
});

test('only explicit acceptance authorizes the current signature; material changes must be reviewed', () => {
  let state = receiveCheckoutQuote({}, 'local', quote('local'), 'DELIVERY');
  state = acceptCheckoutQuote(state, 'local', 'local');
  assert.equal(state.acceptedSignature, 'local');
  assert.equal(receiveCheckoutQuote(state, 'technical-revision', { ...quote('local'), quoteFingerprint: 'new revision' }, 'DELIVERY').needsAcceptance, false);
  state = receiveCheckoutQuote(state, 'changed', { ...quote('new-conditions'), total: '8990.00' }, 'DELIVERY');
  assert.equal(state.needsAcceptance, true); // equal totals do not imply equal conditions
  assert.equal(acceptCheckoutQuote(state, 'obsolete', 'new-conditions'), state);
  assert.equal(acceptCheckoutQuote(state, 'changed', 'local'), state);
  state = acceptCheckoutQuote(state, 'changed', 'new-conditions');
  assert.equal(state.needsAcceptance, false);
  assert.equal(receiveCheckoutQuote(state, 'pickup', quote('pickup'), 'PICKUP').needsAcceptance, true);
});

test('missing contracts, server conflicts and failures never authorize a stale quote', () => {
  assert.equal(receiveCheckoutQuote({}, 'missing', {}).needsAcceptance, true);
  const accepted = acceptCheckoutQuote(receiveCheckoutQuote({}, 'q', quote('local')), 'q', 'local');
  const conflict = { ...accepted, requireAcceptance: true };
  assert.equal(receiveCheckoutQuote(conflict, 'retry', quote('price-changed')).needsAcceptance, true);
  assert.equal(receiveCheckoutQuote(conflict, 'technical-only', quote('local')).needsAcceptance, false);
  const failed = { ...accepted, ...checkoutQuoteFailure({}, { connection: true }) };
  assert.equal(failed.data, accepted.data); // retained for display, not payment
  assert.equal(acceptCheckoutQuote(failed, 'q', 'local'), failed);
});

test('out-of-order quote responses, old errors and unmounted requests cannot replace the newest result', async () => {
  const requests = createLatestCheckoutRequest();
  let releaseOld, releaseNew, current;
  const old = new Promise(resolve => { releaseOld = resolve; });
  const next = new Promise(resolve => { releaseNew = resolve; });
  const oldCurrent = requests.begin();
  const oldWork = old.then(data => { if (oldCurrent()) current = data; });
  const newCurrent = requests.begin();
  const newWork = next.then(data => { if (newCurrent()) current = data; });
  releaseNew(quote('newest')); await newWork;
  releaseOld(quote('obsolete')); await oldWork;
  assert.equal(current.commercialSignature, 'newest');
  assert.equal(oldCurrent(), false);
  requests.invalidate();
  assert.equal(newCurrent(), false);
});

const saved = { recipientName: 'Comprador de prueba', phone: '+56912345678', commune: '  santa  juana ', address: 'Sector de prueba sin número', reference: 'Portón de prueba' };
test('saved structured local address maps only existing delivery fields, independently of SKU/cart data', () => {
  const destination = mergeSavedCheckoutDestination(EMPTY_CHECKOUT_DESTINATION, {}, saved);
  assert.deepEqual(destination, { deliveryRecipientName: saved.recipientName, deliveryPhone: saved.phone, deliveryAddress: saved.address, deliveryReference: saved.reference });
  assert.equal(savedCheckoutDestination(saved).note, '');
  assert.equal(savedCheckoutDestination(null).note, '');
});
test('incomplete and out-of-coverage saved addresses are not silently treated as Santa Juana', () => {
  for (const commune of ['Concepción', '', null, 'Dirección Santa Juana']) {
    const result = savedCheckoutDestination({ ...saved, commune });
    assert.match(result.note, /No se utilizó como destino/);
    assert.equal(result.values.deliveryAddress, undefined);
    assert.equal(result.values.deliveryReference, undefined);
  }
  assert.match(savedCheckoutDestination({ ...saved, address: '' }).note, /incompleta/);
});
test('manual fields, including deliberately emptied fields, win over a late saved-address response', () => {
  const current = { ...EMPTY_CHECKOUT_DESTINATION, deliveryRecipientName: 'Nombre escrito manualmente', deliveryReference: 'Nueva referencia' };
  const result = mergeSavedCheckoutDestination(current, { deliveryAddress: true, deliveryPhone: true }, saved);
  assert.equal(result.deliveryRecipientName, current.deliveryRecipientName);
  assert.equal(result.deliveryReference, current.deliveryReference);
  assert.equal(result.deliveryAddress, ''); assert.equal(result.deliveryPhone, '');
});
test('checkout resume is memory-only, selection-scoped, expires and never leaks between authentication owners', () => {
  const client = createCheckoutDraftStore('CLIENT:1'), other = createCheckoutDraftStore('CLIENT:2'), guest = createCheckoutDraftStore('GUEST');
  const draft = { deliveryType: 'DELIVERY', destination: saved, guestData: {}, checkoutKey: 'same-operation' };
  client.write('[[1,1]]', draft, 1000);
  assert.deepEqual(client.read('[[1,1]]', 1001), draft);
  assert.equal(client.read('[[2,1]]', 1001), null);
  assert.equal(client.read('[[1,1]]', 1000 + 60 * 60_000 + 1), null);
  assert.equal(other.read('[[1,1]]'), null); assert.equal(guest.read('[[1,1]]'), null);
  const copy = client.read('[[1,1]]', 1001); copy.destination.address = 'Changed copy';
  assert.equal(client.read('[[1,1]]', 1001).destination.address, saved.address);
  client.clear(); assert.equal(client.read('[[1,1]]', 1001), null);
});
test('both information pages retain explicit safe origins, query/hash and checkout intent', () => {
  for (const [pathname, label] of [['/catalog', 'Volver al catálogo'], ['/orders', 'Volver a mis pedidos'], ['/checkout', 'Volver a finalizar compra'], ['/guest-orders', 'Volver a mis pedidos'], ['/cart', 'Volver al carrito']]) {
    const state = informationNavigationState({ pathname, search: '?page=2', hash: '#order-12', state: { checkoutIntent: { source: 'DIRECT' } } });
    const back = informationReturn(state);
    assert.equal(back.label, label); assert.deepEqual(back.to, { pathname, search: '?page=2', hash: '#order-12' });
    if (pathname === '/checkout') assert.equal(back.state.resumeCheckout, true);
    for (const infoPage of ['/delivery-conditions', '/changes-and-returns']) {
      assert.deepEqual(informationReturn(informationNavigationState({ pathname: infoPage, state })), back);
    }
  }
});
test('direct visits, reloads, external targets, authentication routes and informational loops use catalog fallback', () => {
  const good = informationNavigationState({ pathname: '/checkout' });
  assert.equal(informationReturn().to.pathname, '/catalog');
  assert.equal(informationReturn({ informationReturn: { ...good.informationReturn, session: 'previous-page-runtime' } }).to.pathname, '/catalog');
  for (const pathname of ['https://external.test', '//external.test', '/\\external.test', '/login', '/payment-result', '/delivery-conditions', '/changes-and-returns']) {
    assert.equal(informationReturn({ informationReturn: { ...good.informationReturn, pathname } }).to.pathname, '/catalog');
  }
  assert.equal(informationNavigationState({ pathname: '/unrecognized-screen' }), undefined);
});
test('checkout retains the last quote only as provisional, keeps payment guards and fetches saved address once per owner', async () => {
  const page = await read('pages/CheckoutPage.jsx');
  assert.match(page, /const displayQuote = quoteState.data/);
  assert.match(page, /provisional=\{!quote\}/);
  assert.match(page, /const quote = quoteState.key === quoteKey && !quoteState.error/);
  assert.match(page, /&& Boolean\(quote.quoteFingerprint && quote.commercialSignature\)/);
  assert.match(page, /if \(!canStartPayment \|\| submittingRef.current\) return/);
  assert.match(page, /quoteFingerprint: quote.quoteFingerprint/);
  assert.match(page, /getClientDeliveryAddressRequest\(\{ signal: controller.signal \}\)/);
  assert.match(page, /\[isClient, user\?\.id\]/);
  assert.match(page, /min-h-24[^\n]+border-slate-300[^\n]+p-3[^\n]+maxLength=\{500\}/);
  assert.doesNotMatch(page, /data: null, needsAcceptance: true/);
});
test('counters share theme-aware contrast without modifying count helpers; conditions omit only their own redundant link', async () => {
  const count = await read('components/TableRecordCount.jsx'), css = await read('styles/styles.css');
  assert.match(count, /className="table-result-count"/);
  assert.match(count, /formatTableRecordCount\(\{ visibleCount, totalCount, filteredCount, hasFilters \}\)/);
  assert.match(css, /\.table-result-count \{ color: var\(--color-ink-700\)/);
  assert.match(css, /\.dark \.table-result-count[^}]+color: #e3e7eb/);
  assert.match(await read('pages/DeliveryConditionsPage.jsx'), /<DeliveryConditions showLink=\{false\}/);
  assert.match(await read('components/DeliveryConditions.jsx'), /showLink &&/);
  assert.match(await read('components/ClientLayout.jsx'), /InformationLink[^\n]+to="\/delivery-conditions"/);
});

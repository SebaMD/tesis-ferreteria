// Runtime marker intentionally expires on reload. A direct/external visit uses
// the catalog instead of reconstructing an origin from document.referrer.
import { createId } from './createId.js';
const session = typeof globalThis.crypto?.getRandomValues === 'function' ? createId() : null;
const informationPages = new Set(['/delivery-conditions', '/changes-and-returns']);
const names = {
  '/catalog': 'al catálogo', '/orders': 'a mis pedidos', '/guest-orders': 'a mis compras',
  '/checkout': 'a finalizar compra', '/cart': 'al carrito', '/account': 'a mi cuenta',
  '/favorites': 'a favoritos', '/checkout-options': 'a las opciones de compra',
  '/order-tracking': 'al seguimiento del pedido',
};
function destination(pathname) {
  return names[pathname] || (/^\/catalog\/(products|families)\/[1-9]\d*$/.test(pathname || '') ? 'al producto' : null);
}
const fallback = () => ({ to: { pathname: '/catalog' }, state: undefined, label: 'Volver al catálogo' });
export function informationReturn(state) {
  const origin = state?.informationReturn;
  const name = destination(origin?.pathname);
  if (!session || origin?.session !== session || !name || informationPages.has(origin.pathname)) return fallback();
  return {
    to: { pathname: origin.pathname, search: typeof origin.search === 'string' && origin.search.startsWith('?') ? origin.search : '', hash: typeof origin.hash === 'string' && origin.hash.startsWith('#') ? origin.hash : '' },
    state: origin.state, label: `Volver ${name}`,
  };
}
export function informationNavigationState(location) {
  if (!session) return undefined;
  if (informationPages.has(location.pathname)) {
    const back = informationReturn(location.state);
    return { informationReturn: { ...back.to, session, state: back.state } };
  }
  if (!destination(location.pathname)) return undefined;
  const { informationReturn: ignored, ...originState } = location.state || {};
  void ignored;
  return { informationReturn: { session, pathname: location.pathname, search: location.search, hash: location.hash,
    state: { ...originState, ...(location.pathname === '/checkout' ? { resumeCheckout: true } : {}) } } };
}

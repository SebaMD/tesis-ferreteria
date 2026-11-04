import { clearCatalogEntries, createProductDetailNavigationState, normalizeCatalogSnapshot, readCatalogEntry } from './catalogNavigation.js';
import { informationReturn } from './informationNavigation.js';

const key = 'fyf-exploration-v1';
let memory = null;
export function resetClientExploration() {
  memory = null;
  clearCatalogEntries();
  try { sessionStorage.removeItem(key); sessionStorage.removeItem('fyf-client-scroll-v1'); } catch { /* Memory fallback. */ }
}
export const explorationOwner = user => user ? `${user.role}:${user.id}` : 'GUEST';
const catalogPath = pathname => pathname === '/catalog' || /^\/catalog\/(products|families)\/[1-9]\d*$/.test(pathname || '');
const position = n => Math.max(0, Math.min(10_000_000, Number(n) || 0));
function read(storage) {
  try { const target = storage === undefined ? globalThis.sessionStorage : storage; return memory || JSON.parse(target?.getItem(key) || 'null'); } catch { return memory; }
}
function safeEntry(entry) {
  if (!catalogPath(entry?.pathname)) return null;
  const query = new URLSearchParams(entry.search || '');
  const search = new URLSearchParams();
  if (entry.pathname === '/catalog' && query.get('search')) search.set('search', query.get('search').slice(0, 256));
  if (entry.pathname.includes('/families/') && /^[1-9]\d*$/.test(query.get('variant') || '')) search.set('variant', query.get('variant'));
  const snapshot = normalizeCatalogSnapshot(entry.snapshot);
  const origin = entry.productDetailOrigin?.source === 'catalog' ? createProductDetailNavigationState(entry.productDetailOrigin, entry.productDetailOrigin.scrollY) : null;
  return { pathname: entry.pathname, search: search.size ? `?${search}` : '', key: typeof entry.key === 'string' ? entry.key : undefined,
    scrollY: position(entry.scrollY), snapshot, ...(origin || {}) };
}
export function rememberExploration(location, owner, scrollY = 0, storage) {
  if (!catalogPath(location.pathname)) return;
  const previous = read(storage);
  const last = previous?.owner === owner ? safeEntry(previous.entry) : null;
  const origin = location.state?.productDetailOrigin?.source === 'catalog' ? location.state.productDetailOrigin
    : last?.pathname === '/catalog' ? { source: 'catalog', owner, search: last.search, snapshot: last.snapshot, scrollY: last.scrollY }
    : last?.productDetailOrigin;
  const entry = safeEntry({ ...location, ...readCatalogEntry(location.key), scrollY,
    productDetailOrigin: origin });
  memory = { owner, entry };
  try { (storage || globalThis.sessionStorage)?.setItem(key, JSON.stringify(memory)); } catch { /* Memory fallback, no personal data. */ }
}
export function explorationDestination(owner, currentPath = '', storage) {
  const saved = read(storage), entry = saved?.owner === owner ? safeEntry(saved.entry) : null;
  // Catálogo while browsing is the explicit fresh-list action; elsewhere resume.
  if (!entry || currentPath.startsWith('/catalog')) return { to: '/catalog', state: undefined };
  return { to: { pathname: entry.pathname, search: entry.search }, state: {
    ...(entry.productDetailOrigin ? { productDetailOrigin: entry.productDetailOrigin } : {}),
    restoreClientScrollKey: entry.key,
    ...(entry.pathname === '/catalog' ? { restoreCatalog: { owner, snapshot: entry.snapshot, scrollY: entry.scrollY } } : {}),
  } };
}

export function cartExplorationReturn(state, owner) {
  const origin = informationReturn(state?.cartOwner === owner ? state : null, '/cart');
  const path = origin.to.pathname;
  const clientOnly = ['/account', '/favorites', '/orders'].includes(path);
  if ((clientOnly && !owner.startsWith('CLIENT:')) || (path === '/guest-orders' && owner !== 'GUEST')) {
    return informationReturn(null, '/cart');
  }
  return origin;
}

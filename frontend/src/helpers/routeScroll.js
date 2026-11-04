export const isClientScrollPath = pathname => /^\/(catalog(?:\/.*)?|orders|guest-orders|favorites|account|cart|checkout|checkout-options|changes-and-returns|delivery-conditions|order-tracking|payment-result)$/.test(pathname);

export function routeScrollAction(previous, current, navigationType, saved, owner) {
  if (!isClientScrollPath(current.pathname)) return null;
  if (previous?.key === current.key) return null;
  if (previous?.pathname === current.pathname && navigationType === "REPLACE") return null;
  if (previous?.pathname === current.pathname && previous.search !== current.search && navigationType !== "POP") return null;
  if (navigationType === "POP" && saved?.pathname === current.pathname) return saved.position;
  if (current.state?.restoreClientScrollKey && saved?.pathname === current.pathname) return saved.position;
  if (current.pathname === "/catalog" && current.state?.restoreCatalog
    && (owner === undefined || current.state.restoreCatalog.owner === owner)) {
    const y = Number(current.state.restoreCatalog.scrollY);
    return { x: 0, y: Number.isFinite(y) ? Math.min(10_000_000, Math.max(0, y)) : 0 };
  }
  return { x: 0, y: 0 };
}

// Only coordinates/pathnames: never URLs with tokens, checkout data or personal data.
const storageKey = "fyf-client-scroll-v1";
export function readRouteScrollEntries(storage) {
  try {
    const target = storage === undefined ? globalThis.sessionStorage : storage;
    const entries = JSON.parse(target?.getItem(storageKey) || "[]");
    return new Map(entries.filter(([key, value]) => typeof key === "string" && isClientScrollPath(value?.pathname)
      && [value.position?.x, value.position?.y].every(number => Number.isFinite(number) && number >= 0 && number <= 10_000_000)).slice(-60));
  } catch { return new Map(); }
}
export function persistRouteScrollEntries(entries, storage) {
  try { const target = storage === undefined ? globalThis.sessionStorage : storage; target?.setItem(storageKey, JSON.stringify([...entries].slice(-60))); } catch { /* Restoration remains available in memory. */ }
}

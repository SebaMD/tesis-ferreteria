// Local UX bookkeeping only: never an authorization or a financial source of truth.
const selection = items => (items || []).map(item => ({ productId: Number(item.productId ?? item.product?.id), quantity: Number(item.quantity) })).sort((a, b) => a.productId - b.productId);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyFor = (cartKey, orderId) => `${cartKey}:paid-snapshot:${Number(orderId)}`;

export function captureCartCheckout(storage, cartKey, items, selected) {
  try {
    const raw = storage.getItem(cartKey);
    const current = selection(items), chosen = selection(selected);
    if (!chosen.length || !same(current, selection(JSON.parse(raw || '[]')))
      || chosen.some(row => !Number.isInteger(row.quantity) || row.quantity < 1 || !current.some(c => c.productId === row.productId && c.quantity >= row.quantity))) return null;
    return { revision: storage.getItem(`${cartKey}:revision`), intent: storage.getItem(`${cartKey}:intent`), raw, selected: chosen,
      guestSession: cartKey.endsWith('_guest') ? storage.getItem('fyf_guest_checkout_session') : undefined };
  } catch { return null; }
}

export function rememberOrderCart(storage, cartKey, orderId, snapshot) {
  if (!snapshot || !Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) return;
  try {
    const key = keyFor(cartKey, orderId);
    if (storage.getItem(key) === null) storage.setItem(key, JSON.stringify(snapshot));
  } catch { /* Preserve the cart if bookkeeping is unavailable. */ }
}

export function consumePaidCartSnapshot(storage, cartKey, order) {
  if (!['PAID', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order?.status)) return null;
  return consumeMatchingSnapshot(storage, cartKey, order.id, order.items);
}

function consumeMatchingSnapshot(storage, cartKey, orderId, items) {
  try {
    const recordKey = keyFor(cartKey, orderId);
    const snapshot = JSON.parse(storage.getItem(recordKey) || 'null');
    if (!snapshot || snapshot.consumed) return null;
    // Consume even a stale snapshot: changing back later must never apply an old cleanup.
    storage.setItem(recordKey, JSON.stringify({ ...snapshot, consumed: true }));
    if (snapshot.raw !== storage.getItem(cartKey) || snapshot.revision !== storage.getItem(`${cartKey}:revision`)
      || snapshot.intent !== storage.getItem(`${cartKey}:intent`)
      || cartKey.endsWith('_guest') && snapshot.guestSession !== storage.getItem('fyf_guest_checkout_session')
      || !same(snapshot.selected, selection(items))) return null;
    return JSON.parse(snapshot.raw || '[]').flatMap(item => {
      const paid = snapshot.selected.find(row => row.productId === Number(item.product.id))?.quantity || 0;
      return item.quantity > paid ? [{ ...item, quantity: item.quantity - paid }] : [];
    });
  } catch { return null; }
}

// Called only after the server returned a persisted order and a valid launch.
// Unknown/failed checkout responses never reach this operation. Keep the original
// snapshot as recovery evidence; cancellation must not restore it automatically.
export function consumeCreatedCartSnapshot(storage, cartKey, payment, snapshot) {
  if (!Number.isSafeInteger(payment?.orderId) || payment.orderId < 1
    || typeof payment.token !== 'string' || !payment.token || !snapshot) return null;
  rememberOrderCart(storage, cartKey, payment.orderId, snapshot);
  return consumeMatchingSnapshot(storage, cartKey, payment.orderId, snapshot.selected);
}

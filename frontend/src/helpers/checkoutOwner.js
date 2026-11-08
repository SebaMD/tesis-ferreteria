// Tab-local history entries cannot silently transfer an existing checkout to
// another account. This is a UI boundary; the API still authorizes every order.
export function claimCheckoutOwner(storage, historyKey, owner) {
  try {
    const key = `fyf-checkout-owner:${historyKey}`;
    const previous = storage.getItem(key);
    if (previous !== null) return previous === owner;
    storage.setItem(key, owner);
    return true;
  } catch { return false; }
}

// Memory only: no personal data, payment authorizations or quotes go into storage.
// Each authentication owner receives a new store from the provider.
export function createCheckoutDraftStore(owner) {
  let current = null;
  return {
    owner,
    read(scope, now = Date.now()) {
      if (!current || current.scope !== scope || now - current.at > 60 * 60_000) return null;
      return structuredClone(current.draft);
    },
    write(scope, draft, now = Date.now()) {
      current = { scope, at: now, draft: structuredClone(draft) };
    },
    clear() { current = null; },
  };
}

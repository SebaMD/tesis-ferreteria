import { useMemo } from 'react';
import useAuth from '../hooks/useAuth.js';
import { createCheckoutDraftStore } from '../helpers/checkoutDraft.js';
import CheckoutDraftContext from './CheckoutDraftContext.js';

export default function CheckoutDraftProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const owner = isAuthenticated ? `${user?.role}:${user?.id}` : 'GUEST';
  const store = useMemo(() => createCheckoutDraftStore(owner), [owner]);
  return <CheckoutDraftContext.Provider value={store}>{children}</CheckoutDraftContext.Provider>;
}

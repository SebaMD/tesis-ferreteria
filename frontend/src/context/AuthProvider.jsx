import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  clearSessionNotice,
  clearStoredAuth,
  readStoredAuth,
  storeAuthSession,
  readAuthSnapshot, AUTH_CHANGED_EVENT, AUTH_SESSION_KEY,
} from "../helpers/session.js";
import { setApiAuthSnapshot, assertStoredAuthToken } from '../api/httpClient.js';
import { loginRequest, logoutRequest, registerClientRequest } from "../services/auth.service.js";
import AuthContext from "./AuthContext.js";
import { shouldMergeGuestCartOnAuthentication } from "../helpers/checkoutIntent.js";
import { resetClientExploration } from '../helpers/explorationNavigation.js';

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredAuth);
  const { token, user, mergeGuestCart = false } = session;

  useLayoutEffect(() => { setApiAuthSnapshot({ token, user }); }, [token, user]);
  useEffect(() => {
    const sync = () => {
      const next = readAuthSnapshot();
      setSession(current => current.token === next.token && JSON.stringify(current.user) === JSON.stringify(next.user)
        ? current : { ...next, mergeGuestCart: false });
    };
    const storage = event => { if (event.key === null || ['token','user',AUTH_SESSION_KEY].includes(event.key)) sync(); };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', storage);window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);window.removeEventListener(AUTH_CHANGED_EVENT, sync);
    };
  }, []);

  const replaceSession = useCallback((sessionData, { mergeGuestCart = false } = {}) => {
    assertStoredAuthToken(token);
    resetClientExploration();
    storeAuthSession(sessionData.token, sessionData.user);
    clearSessionNotice();
    setSession({ token: sessionData.token, user: sessionData.user, mergeGuestCart });
    return sessionData.user;
  }, [token]);

  const login = useCallback(async (credentials, checkoutState) => {
    const data = await loginRequest(credentials);
    replaceSession(data, { mergeGuestCart: shouldMergeGuestCartOnAuthentication(checkoutState) });
    return data;
  }, [replaceSession]);

  const logout = useCallback(async () => {
    const startedToken = token;
    try {
      if (startedToken) await logoutRequest(startedToken);
    } finally {
      if (readAuthSnapshot().token === startedToken) {
        clearStoredAuth();
        resetClientExploration();
        clearSessionNotice();
        setSession({ token: null, user: null });
      }
    }
  }, [token]);

  const clearSession = useCallback(() => {
    if (readAuthSnapshot().token !== token) return;
    resetClientExploration();
    clearStoredAuth();
    clearSessionNotice();
    setSession({ token: null, user: null });
  }, [token]);

  const registerClient = useCallback(async (data, checkoutState) => {
    const sessionData = await registerClientRequest(data);
    replaceSession(sessionData, { mergeGuestCart: shouldMergeGuestCartOnAuthentication(checkoutState) });
    return sessionData;
  }, [replaceSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      mergeGuestCart,
      login,
      registerClient,
      replaceSession,
      logout,
      clearSession,
    }),
    [clearSession, login, logout, mergeGuestCart, registerClient, replaceSession, token, user],
  );

  // A new owner gets new cart, drafts, order lists, modals and result effects.
  return <AuthContext.Provider value={value}><Fragment key={`${user?.role || 'GUEST'}:${user?.id || 'guest'}`}>{children}</Fragment></AuthContext.Provider>;
}

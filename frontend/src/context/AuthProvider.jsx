import { useCallback, useMemo, useState } from "react";
import {
  clearSessionNotice,
  clearStoredAuth,
  readStoredAuth,
  storeAuthSession,
} from "../helpers/session.js";
import { loginRequest, logoutRequest, registerClientRequest } from "../services/auth.service.js";
import AuthContext from "./AuthContext.js";
import { shouldMergeGuestCartOnAuthentication } from "../helpers/checkoutIntent.js";

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredAuth);
  const { token, user, mergeGuestCart = false } = session;

  const replaceSession = useCallback((sessionData, { mergeGuestCart = false } = {}) => {
    storeAuthSession(sessionData.token, sessionData.user);
    clearSessionNotice();
    setSession({ token: sessionData.token, user: sessionData.user, mergeGuestCart });
    return sessionData.user;
  }, []);

  const login = useCallback(async (credentials, checkoutState) => {
    const data = await loginRequest(credentials);
    replaceSession(data, { mergeGuestCart: shouldMergeGuestCartOnAuthentication(checkoutState) });
    return data;
  }, [replaceSession]);

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem("token")) await logoutRequest();
    } finally {
      clearStoredAuth();
      clearSessionNotice();
      setSession({ token: null, user: null });
    }
  }, []);

  const clearSession = useCallback(() => {
    clearStoredAuth();
    clearSessionNotice();
    setSession({ token: null, user: null });
  }, []);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

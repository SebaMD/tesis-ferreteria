import { useCallback, useMemo, useState } from "react";
import {
  clearSessionNotice,
  clearStoredAuth,
  readStoredAuth,
  storeAuthSession,
} from "../helpers/session.js";
import { loginRequest, logoutRequest, registerClientRequest } from "../services/auth.service.js";
import AuthContext from "./AuthContext.js";

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredAuth);
  const { token, user } = session;

  const replaceSession = useCallback((sessionData) => {
    storeAuthSession(sessionData.token, sessionData.user);
    clearSessionNotice();
    setSession({ token: sessionData.token, user: sessionData.user });
    return sessionData.user;
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await loginRequest(credentials);
    return replaceSession(data);
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

  const registerClient = useCallback(async (data) => {
    const sessionData = await registerClientRequest(data);
    replaceSession(sessionData);
    return sessionData;
  }, [replaceSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      registerClient,
      replaceSession,
      logout,
    }),
    [login, logout, registerClient, replaceSession, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

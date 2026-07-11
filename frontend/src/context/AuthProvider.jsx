import { useMemo, useState } from "react";
import {
  clearSessionNotice,
  clearStoredAuth,
  readStoredAuth,
  storeAuthSession,
} from "../helpers/session.js";
import { loginRequest, logoutRequest } from "../services/auth.service.js";
import AuthContext from "./AuthContext.js";

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredAuth);
  const { token, user } = session;

  const login = async (credentials) => {
    const data = await loginRequest(credentials);
    storeAuthSession(data.token, data.user);
    clearSessionNotice();
    setSession({ token: data.token, user: data.user });
    return data.user;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem("token")) await logoutRequest();
    } finally {
      clearStoredAuth();
      clearSessionNotice();
      setSession({ token: null, user: null });
    }
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

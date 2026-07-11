export const SESSION_EXPIRED_MESSAGE = "La sesión expiró, inicia sesión nuevamente.";

const TOKEN_KEY = "token";
const USER_KEY = "user";
const SESSION_NOTICE_KEY = "sessionNotice";

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalizedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "=",
    );

    return JSON.parse(window.atob(paddedPayload));
  } catch {
    return null;
  }
}

function isStoredTokenValid(token) {
  const payload = decodeJwtPayload(token);
  return Boolean(payload && typeof payload.exp === "number" && payload.exp * 1000 > Date.now());
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function storeAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function markSessionExpired() {
  clearStoredAuth();
  sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
}

export function readSessionNotice() {
  return sessionStorage.getItem(SESSION_NOTICE_KEY) || "";
}

export function clearSessionNotice() {
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
}

export function readStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);

  if (!token && !rawUser) return { token: null, user: null };

  if (!token || !rawUser || !isStoredTokenValid(token)) {
    markSessionExpired();
    return { token: null, user: null };
  }

  try {
    const user = JSON.parse(rawUser);
    if (!user || typeof user !== "object") throw new Error("Usuario almacenado inválido");
    return { token, user };
  } catch {
    markSessionExpired();
    return { token: null, user: null };
  }
}

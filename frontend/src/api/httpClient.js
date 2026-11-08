import axios from "axios";
import { markSessionExpired, readAuthSnapshot, notifyAuthChanged } from "../helpers/session.js";

let observedSession = readAuthSnapshot();
export function setApiAuthSnapshot(snapshot) { observedSession = snapshot; }
export function assertStoredAuthToken(token) { if (token !== readAuthSnapshot().token) throw sessionChanged(); }
function sessionChanged() {
  notifyAuthChanged();
  const error = new Error('La sesión cambió. Revisa la cuenta activa y vuelve a abrir la compra desde su carrito.');
  error.code = 'AUTH_CONTEXT_CHANGED';
  return error;
}
function authStorageStamp() { return JSON.stringify([localStorage.getItem('token'),localStorage.getItem('user'),localStorage.getItem('fyf-auth-session')]); }
function sameSession(snapshot) {
  const stored = readAuthSnapshot();
  return snapshot?.token === stored.token
    && (stored.token || (!localStorage.getItem('token') && !localStorage.getItem('user')));
}
function responseBelongsToCurrentSession(config) {
  return config?.fyfAuthStamp === authStorageStamp()
    && (config.fyfCredentialRequest || sameSession(config.fyfAuthSnapshot));
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const credentialRequest = /\/auth\/(login|register)$/.test(config.url || '');
  if (!sameSession(observedSession) && !(credentialRequest && !observedSession.token && !readAuthSnapshot().token)) throw sessionChanged();
  const token = observedSession.token;
  if (Object.hasOwn(config, 'expectedAuthToken') && token !== config.expectedAuthToken) throw sessionChanged();
  if (token && config.expectedClientId !== undefined && Number(observedSession.user?.id) !== config.expectedClientId) throw sessionChanged();
  if (token && config.expectedGuest) throw sessionChanged();
  config.fyfAuthSnapshot = observedSession;
  config.fyfAuthStamp = authStorageStamp();
  config.fyfCredentialRequest = credentialRequest;

  config.headers.delete('Authorization');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => {
    if (!responseBelongsToCurrentSession(response.config)) throw sessionChanged();
    return response;
  },
  (error) => {
    if (error.code === 'AUTH_CONTEXT_CHANGED') return Promise.reject(error);
    if (error.config?.fyfAuthSnapshot && !responseBelongsToCurrentSession(error.config)) return Promise.reject(sessionChanged());
    const status = error?.response?.status;
    const code = String(error?.response?.data?.code || "");
    const message = String(error?.response?.data?.message || error?.response?.data?.details || "");
    const requestUrl = String(error?.config?.url || "");
    const hasStoredToken = Boolean(localStorage.getItem("token"));
    const isLoginRequest = requestUrl.includes("/auth/login");
    const isInvalidTokenResponse =
      status === 401 ||
      (status === 403 && /token|jwt|expirad/i.test(message));

    if (hasStoredToken && status === 403 && code === "EMAIL_VERIFICATION_REQUIRED" && window.location.pathname !== "/verify-work-email") {
      window.location.replace("/verify-work-email");
      return Promise.reject(error);
    }

    if (hasStoredToken && !isLoginRequest && isInvalidTokenResponse && !redirectingToLogin) {
      redirectingToLogin = true;
      markSessionExpired();

      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      } else {
        redirectingToLogin = false;
      }
    }

    return Promise.reject(error);
  },
);

export function getApiError(error, fallback = "Error al conectar con el servidor") {
  if (error?.code === 'AUTH_CONTEXT_CHANGED') return error.message;
  const details = error?.response?.data?.details;
  if (typeof details === "string" && details.trim()) return details;

  if (isApiConnectionError(error)) {
    return "No se pudo conectar con el servidor. Revisa que el backend esté disponible e intenta nuevamente.";
  }

  return error?.response?.data?.message || fallback;
}

export function isApiConnectionError(error) {
  if (error?.request && !error?.response) return true;

  // En desarrollo, el proxy de Vite responde 500 sin cuerpo cuando el
  // backend todavia no esta escuchando. Los errores 500 reales de la API
  // siempre conservan su respuesta JSON y no deben confundirse con red.
  const response = error?.response;
  const contentType = String(response?.headers?.["content-type"] || "");
  return [500, 502, 503, 504].includes(response?.status)
    && (response.data === "" || response.data == null)
    && !contentType.includes("application/json");
}

export default api;

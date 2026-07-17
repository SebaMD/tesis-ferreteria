import axios from "axios";
import { markSessionExpired } from "../helpers/session.js";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = String(error?.response?.data?.message || error?.response?.data?.details || "");
    const requestUrl = String(error?.config?.url || "");
    const hasStoredToken = Boolean(localStorage.getItem("token"));
    const isLoginRequest = requestUrl.includes("/auth/login");
    const isInvalidTokenResponse =
      status === 401 ||
      (status === 403 && /token|jwt|expirad/i.test(message));

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
  const details = error?.response?.data?.details;
  if (typeof details === "string" && details.trim()) return details;

  return error?.response?.data?.message || fallback;
}

export default api;

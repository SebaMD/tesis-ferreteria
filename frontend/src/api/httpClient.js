import axios from "axios";
import { markSessionExpired } from "../helpers/session.js";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
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
  return error?.response?.data?.message || error?.response?.data?.details || fallback;
}

export default api;

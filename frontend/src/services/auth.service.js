import api from "../api/httpClient.js";

export async function loginRequest(credentials) {
  const response = await api.post("/auth/login", credentials);
  return response.data.data;
}

export async function logoutRequest() {
  const response = await api.post("/auth/logout");
  return response.data;
}

export async function registerClientRequest(data) {
  const response = await api.post("/auth/register", data);
  return response.data.data;
}

export async function requestPasswordResetRequest(email) {
  const response = await api.post("/auth/password-reset/request", { email });
  return response.data;
}

export async function confirmPasswordResetRequest(data) {
  const response = await api.post("/auth/password-reset/confirm", data);
  return response.data;
}

export async function requestClientReactivationRequest(credentials) {
  const response = await api.post("/auth/client-reactivation/request", credentials);
  return response.data.data;
}

export async function confirmClientReactivationRequest(data) {
  const response = await api.post("/auth/client-reactivation/confirm", data);
  return response.data;
}

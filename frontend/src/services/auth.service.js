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

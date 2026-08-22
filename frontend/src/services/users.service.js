import api from "../api/httpClient.js";

export async function getUserRolesRequest() {
  const response = await api.get("/users/roles");
  return response.data.data || [];
}

export async function getUsersRequest() {
  const response = await api.get("/users");
  return response.data.data || [];
}

export async function createUserRequest(data) {
  const response = await api.post("/users", data);
  return response.data.data;
}

export async function updateUserRequest(id, data) {
  const response = await api.patch(`/users/${id}`, data);
  return response.data.data;
}

export async function deleteUserRequest(id) {
  const response = await api.delete(`/users/${id}`);
  return response.data.data;
}

export async function updateCashierScheduleRequest(id, data) {
  const response = await api.patch(`/users/${id}/work-schedule`, data);
  return response.data.data;
}

import api from "../api/httpClient.js";

export async function getSalesRequest() {
  const response = await api.get("/sales");
  return response.data.data || [];
}

export async function getSaleByIdRequest(id) {
  const response = await api.get(`/sales/${id}`);
  return response.data.data;
}

export async function createSaleRequest(data) {
  const response = await api.post("/sales", data);
  return response.data.data;
}

export async function createDirectReturnRequest(id, data) {
  const response = await api.post(`/sales/${id}/returns`, data);
  return response.data.data;
}

export async function undoCancellationRequest(id) {
  const response = await api.patch(`/sales/cancellation-requests/${id}/undo`);
  return response.data.data;
}

export async function getCancellationRequestsRequest() {
  const response = await api.get("/sales/cancellation-requests");
  return response.data.data || [];
}

export async function createCancellationRequest(id, data) {
  const response = await api.post(`/sales/${id}/cancellation-requests`, data);
  return response.data.data;
}

export async function approveCancellationRequest(id, data = {}) {
  const response = await api.patch(`/sales/cancellation-requests/${id}/approve`, data);
  return response.data.data;
}

export async function rejectCancellationRequest(id, data) {
  const response = await api.patch(`/sales/cancellation-requests/${id}/reject`, data);
  return response.data.data;
}

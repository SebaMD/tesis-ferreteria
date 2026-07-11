import api from "../api/httpClient.js";

export async function getSalesRequest() {
  const response = await api.get("/sales");
  return response.data.data || [];
}

export async function createSaleRequest(data) {
  const response = await api.post("/sales", data);
  return response.data.data;
}

export async function cancelSaleRequest(id) {
  const response = await api.delete(`/sales/${id}`);
  return response.data.data;
}

export async function undoCancelSaleRequest(id) {
  const response = await api.patch(`/sales/${id}/undo-cancel`);
  return response.data.data;
}

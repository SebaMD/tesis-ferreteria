import api from "./api.js";

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

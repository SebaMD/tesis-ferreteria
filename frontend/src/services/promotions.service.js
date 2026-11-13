import api from "../api/httpClient.js";

export async function getPromotionsRequest({ onServerTime } = {}) {
  const requestedAt = Date.now();
  const { data, headers } = await api.get("/promotions");
  const serverTime = Date.parse(headers?.date);
  if (Number.isFinite(serverTime)) onServerTime?.(serverTime - (requestedAt + Date.now()) / 2);
  return data.data || [];
}

export async function getPromotionTargetsRequest() {
  const { data } = await api.get("/promotions/targets");
  return data.data || { products: [], categories: [] };
}

export async function createPromotionRequest(payload) {
  const { data } = await api.post("/promotions", payload);
  return data.data;
}

export async function updatePromotionRequest(id, payload) {
  const { data } = await api.patch(`/promotions/${id}`, payload);
  return data.data;
}

export async function setPromotionStatusRequest(id, isActive) {
  const { data } = await api.patch(`/promotions/${id}/status`, { isActive });
  return data.data;
}

export async function deletePromotionRequest(id) {
  const { data } = await api.delete(`/promotions/${id}`);
  return data.data;
}

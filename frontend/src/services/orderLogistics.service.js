import api from "../api/httpClient.js";

export async function getOperationalOrdersRequest(filters = {}) {
  const response = await api.get("/order-logistics", { params: filters });
  return response.data.data || [];
}

export async function getOperationalOrderByIdRequest(orderId) {
  const response = await api.get(`/order-logistics/${orderId}`);
  return response.data.data;
}

export async function startOrderPreparationRequest(orderId) {
  const response = await api.post(`/order-logistics/${orderId}/start-preparation`);
  return response.data.data;
}

export async function finishOrderPreparationRequest(orderId) {
  const response = await api.post(`/order-logistics/${orderId}/finish-preparation`);
  return response.data.data;
}

export async function startOrderDeliveryRequest(orderId) {
  const response = await api.post(`/order-logistics/${orderId}/start-delivery`);
  return response.data.data;
}

export async function completeOrderDeliveryRequest(orderId) {
  const response = await api.post(`/order-logistics/${orderId}/complete-delivery`);
  return response.data.data;
}

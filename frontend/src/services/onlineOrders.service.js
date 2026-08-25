import api from "../api/httpClient.js";

export async function createOnlineOrderCheckoutRequest(data) {
  const response = await api.post("/online-orders/checkout", data);
  return response.data.data;
}

export async function retryOnlineOrderPaymentRequest(orderId) {
  const response = await api.post(`/online-orders/${orderId}/retry-payment`);
  return response.data.data;
}

export async function continueOnlineOrderPaymentRequest(orderId) {
  const response = await api.post(`/online-orders/${orderId}/continue-payment`);
  return response.data.data;
}

export async function archiveOnlineOrderRequest(orderId) {
  const response = await api.patch(`/online-orders/${orderId}/archive`);
  return response.data.data;
}

export async function getMyOnlineOrdersRequest() {
  const response = await api.get("/online-orders");
  return response.data.data || [];
}

export async function getMyOnlineOrderByIdRequest(orderId) {
  const response = await api.get(`/online-orders/${orderId}`);
  return response.data.data;
}

export const createCheckoutRequest = createOnlineOrderCheckoutRequest;
export const retryPaymentRequest = retryOnlineOrderPaymentRequest;
export const continuePaymentRequest = continueOnlineOrderPaymentRequest;
export const getMyOrdersRequest = getMyOnlineOrdersRequest;
export const getMyOrderRequest = getMyOnlineOrderByIdRequest;

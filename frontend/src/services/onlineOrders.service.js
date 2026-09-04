import api from "../api/httpClient.js";
import { getOrCreateGuestSessionId } from "../helpers/guestCheckout.js";

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

export async function getClientDeliveryAddressRequest() {
  const response = await api.get("/online-orders/delivery-address");
  return response.data.data || null;
}

export async function getMyOnlineOrderByIdRequest(orderId) {
  const response = await api.get(`/online-orders/${orderId}`);
  return response.data.data;
}

export function getMyOnlineOrderReceiptRequest(orderId) {
  return api.get(`/online-orders/${orderId}/receipt`, { responseType: "blob" });
}

function guestSessionHeaders() {
  return { "X-Guest-Session": getOrCreateGuestSessionId() };
}

function guestOrderHeaders(accessToken) {
  return { "X-Guest-Order-Token": accessToken };
}

export async function createGuestOnlineOrderCheckoutRequest(data) {
  const response = await api.post("/online-orders/guest/checkout", data, {
    headers: guestSessionHeaders(),
  });
  return response.data.data;
}

export async function getGuestPendingOrderRequest() {
  const response = await api.get("/online-orders/guest/pending", {
    headers: guestSessionHeaders(),
  });
  return response.data.data || null;
}

export async function continueGuestOnlineOrderPaymentRequest() {
  const response = await api.post("/online-orders/guest/continue-payment", null, {
    headers: guestSessionHeaders(),
  });
  return response.data.data;
}

export async function getGuestOnlineOrderRequest(accessToken) {
  const response = await api.get("/online-orders/guest/order", {
    headers: guestOrderHeaders(accessToken),
  });
  return response.data.data;
}

export function getGuestOnlineOrderReceiptRequest(accessToken) {
  return api.get("/online-orders/guest/order/receipt", {
    headers: guestOrderHeaders(accessToken),
    responseType: "blob",
  });
}

export async function retryGuestOnlineOrderPaymentRequest(accessToken) {
  const response = await api.post("/online-orders/guest/retry-payment", null, {
    headers: guestOrderHeaders(accessToken),
  });
  return response.data.data;
}

export async function getGuestDeviceOrdersRequest() {
  const response = await api.get("/online-orders/guest/device-orders");
  return response.data.data || [];
}

export function getGuestDeviceOrderReceiptRequest(orderId) {
  return api.get(`/online-orders/guest/device-orders/${orderId}/receipt`, {
    responseType: "blob",
  });
}

export const createCheckoutRequest = createOnlineOrderCheckoutRequest;
export const retryPaymentRequest = retryOnlineOrderPaymentRequest;
export const continuePaymentRequest = continueOnlineOrderPaymentRequest;
export const getMyOrdersRequest = getMyOnlineOrdersRequest;
export const getMyOrderRequest = getMyOnlineOrderByIdRequest;

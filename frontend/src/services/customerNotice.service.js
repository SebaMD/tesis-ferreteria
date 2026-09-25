import api from "../api/httpClient.js";

export async function getPublicCustomerNoticeRequest() {
  const response = await api.get("/customer-notice");
  return Array.isArray(response.data.data) ? response.data.data : [];
}

export async function getCustomerNoticeConfigurationRequest() {
  const response = await api.get("/customer-notice/configuration");
  return Array.isArray(response.data.data) ? response.data.data : [];
}

export async function createCustomerNoticeRequest(data) {
  const response = await api.post("/customer-notice/configuration", data);
  return response.data.data;
}

export async function updateCustomerNoticeRequest(id, data) {
  const response = await api.put(`/customer-notice/configuration/${id}`, data);
  return response.data.data;
}

export async function deleteCustomerNoticeRequest(id) {
  await api.delete(`/customer-notice/configuration/${id}`);
}

import api from "../api/httpClient.js";

export async function getPublicCustomerNoticeRequest() {
  const response = await api.get("/customer-notice");
  return response.data.data || null;
}

export async function getCustomerNoticeConfigurationRequest() {
  const response = await api.get("/customer-notice/configuration");
  return response.data.data;
}

export async function updateCustomerNoticeConfigurationRequest(data) {
  const response = await api.put("/customer-notice/configuration", data);
  return response.data.data;
}

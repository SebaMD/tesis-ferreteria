import api from "../api/httpClient.js";

function noticeConfiguration(data) {
  return {
    presentation: data?.presentation ?? null,
    notices: Array.isArray(data?.notices) ? data.notices : [],
  };
}

export async function getPublicCustomerNoticeRequest() {
  const response = await api.get("/customer-notice");
  return noticeConfiguration(response.data.data);
}

export async function getCustomerNoticeConfigurationRequest() {
  const response = await api.get("/customer-notice/configuration");
  return noticeConfiguration(response.data.data);
}

export async function createCustomerNoticeRequest(data) {
  const response = await api.post("/customer-notice/configuration", data);
  return response.data.data;
}

export async function updateCustomerNoticeRequest(id, data) {
  const response = await api.put(`/customer-notice/configuration/${id}`, data);
  return response.data.data;
}

export async function reorderCustomerNoticesRequest(noticeIds) {
  const response = await api.patch("/customer-notice/configuration/order", { noticeIds });
  return response.data.data;
}

export async function updateCatalogPresentationRequest(data) {
  const response = await api.put("/customer-notice/configuration/presentation", data);
  return response.data.data;
}

async function uploadImage(url, file) {
  const response = await api.post(url, file, {
    headers: { "Content-Type": file.type },
  });
  return response.data.data;
}

export function uploadCustomerNoticeImageRequest(id, file) {
  return uploadImage(`/customer-notice/configuration/${id}/image`, file);
}

export function uploadCatalogPresentationImageRequest(file) {
  return uploadImage("/customer-notice/configuration/presentation/image", file);
}

export async function removeCustomerNoticeImageRequest(id) {
  const response = await api.delete(`/customer-notice/configuration/${id}/image`);
  return response.data.data;
}

export async function removeCatalogPresentationImageRequest() {
  const response = await api.delete("/customer-notice/configuration/presentation/image");
  return response.data.data;
}

export async function deleteCustomerNoticeRequest(id) {
  await api.delete(`/customer-notice/configuration/${id}`);
}

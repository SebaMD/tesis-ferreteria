import api from "../api/httpClient.js";

export async function getProductFamiliesRequest() {
  return (await api.get("/product-families")).data.data;
}
export async function saveProductFamilyRequest(body, id) {
  const response = id ? await api.patch(`/product-families/${id}`, body) : await api.post("/product-families", body);
  window.dispatchEvent(new Event("product-families-updated"));
  return response.data.data;
}

export async function setProductFamilyArchivedRequest(family, archived) {
  const response = await api.post(`/product-families/${family.id}/${archived ? "archive" : "reactivate"}`, { confirmed: true, expectedUpdatedAt: family.updatedAt });
  window.dispatchEvent(new Event("product-families-updated"));
  return response.data.data;
}

export async function detachProductFamilyRequest(id, body) {
  const response = await api.post(`/product-families/variants/${id}/detach`, body);
  window.dispatchEvent(new Event("product-families-updated"));
  return response.data.data;
}

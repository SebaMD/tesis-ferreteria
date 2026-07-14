import api from "../api/httpClient.js";

export async function getProductsRequest() {
  const response = await api.get("/products");
  return response.data.data || [];
}

export async function createProductRequest(data) {
  const response = await api.post("/products", data);
  return response.data.data;
}

export async function updateProductRequest(id, data) {
  const response = await api.patch(`/products/${id}`, data);
  return response.data.data;
}

export async function deactivateProductRequest(id) {
  const response = await api.delete(`/products/${id}`);
  return response.data.data;
}

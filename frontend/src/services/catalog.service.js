import api from "../api/httpClient.js";

export async function getCatalogProductsRequest() {
  const response = await api.get("/catalog/products");
  return response.data.data || [];
}

export async function getCatalogProductByIdRequest(id) {
  const response = await api.get(`/catalog/products/${id}`);
  return response.data.data;
}

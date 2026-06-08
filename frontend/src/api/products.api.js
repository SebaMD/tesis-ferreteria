import api from "./api.js";

export async function getProductsRequest() {
  const response = await api.get("/products");
  return response.data.data || [];
}

export async function createProductRequest(data) {
  const response = await api.post("/products", data);
  return response.data.data;
}

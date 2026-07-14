import api from "../api/httpClient.js";

export async function getCategoriesRequest() {
  const response = await api.get("/categories");
  return response.data.data || [];
}

export async function createCategoryRequest(data) {
  const response = await api.post("/categories", data);
  return response.data.data;
}

export async function updateCategoryRequest(id, data) {
  const response = await api.patch(`/categories/${id}`, data);
  return response.data.data;
}

export async function deleteCategoryRequest(id) {
  const response = await api.delete(`/categories/${id}`);
  return response.data.data;
}

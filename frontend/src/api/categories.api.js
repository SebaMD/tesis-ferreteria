import api from "./api.js";

export async function getCategoriesRequest() {
  const response = await api.get("/categories");
  return response.data.data || [];
}

export async function createCategoryRequest(data) {
  const response = await api.post("/categories", data);
  return response.data.data;
}

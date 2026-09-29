import api from "../api/httpClient.js";

export async function getCatalogProductsRequest(params = {}) {
  const response = await api.get("/catalog/products", { params });
  return response.data.data;
}

export async function getCatalogProductByIdRequest(id) {
  const response = await api.get(`/catalog/products/${id}`);
  return response.data.data;
}

export async function getCatalogProductsByIdsRequest(ids = []) {
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const products = await Promise.all(uniqueIds.map(async (id) => {
    try {
      return await getCatalogProductByIdRequest(id);
    } catch (error) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  }));
  return products.filter(Boolean);
}

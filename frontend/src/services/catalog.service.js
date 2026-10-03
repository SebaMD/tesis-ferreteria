import api from "../api/httpClient.js";
import { resolveProductAssets, resolveProductListAssets } from "../helpers/productAssets.js";

export async function getCatalogProductsRequest(params = {}) {
  const response = await api.get("/catalog/products", { params });
  const data = response.data.data;
  return { ...data, items: resolveProductListAssets(data?.items) };
}

export async function getCatalogProductByIdRequest(id) {
  const response = await api.get(`/catalog/products/${id}`);
  return resolveProductAssets(response.data.data);
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

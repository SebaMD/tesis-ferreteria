import api from "../api/httpClient.js";
import { resolveProductListAssets } from "../helpers/productAssets.js";

export async function getFavoritesRequest(signal) {
  const { data } = await api.get("/favorites", { signal });
  return resolveProductListAssets(data.data);
}
export const addFavoriteRequest = (productId) => api.put(`/favorites/${productId}`);
export const removeFavoriteRequest = (productId) => api.delete(`/favorites/${productId}`);

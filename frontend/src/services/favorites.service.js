import api from "../api/httpClient.js";

export async function getFavoritesRequest(signal) {
  const { data } = await api.get("/favorites", { signal });
  return data.data || [];
}
export const addFavoriteRequest = (productId) => api.put(`/favorites/${productId}`);
export const removeFavoriteRequest = (productId) => api.delete(`/favorites/${productId}`);

import api from "../api/httpClient.js";
import { resolveProductListAssets } from "../helpers/productAssets.js";

export async function getProductConversionRequest(id) {
  const data = (await api.get(`/product-families/conversion/${id}`)).data.data;
  return { ...data, product: resolveProductListAssets([data.product], api.defaults.baseURL)[0] };
}

export async function getProductBundleRequest(id) {
  const data = (await api.get(`/product-families/${id}/bundle`)).data.data;
  return { ...data, variants: resolveProductListAssets(data.variants, api.defaults.baseURL) };
}
export async function saveProductBundleRequest(body) {
  const response = await api.post("/product-families/bundle", JSON.stringify(body), {
    headers: { "Content-Type": "application/vnd.fyf.product-bundle+json" },
  });
  return response.data.data;
}
export async function getProductBundleOperationRequest(key) {
  return (await api.get(`/product-families/operations/${key}`)).data.data;
}

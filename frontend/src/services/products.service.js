import api from "../api/httpClient.js";

export async function getProductsRequest() {
  const response = await api.get("/products");
  return response.data.data || [];
}

export async function getProductByBarcodeRequest(barcode) {
  const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
  return response.data.data;
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

export async function uploadProductImageRequest(productId, file) {
  const response = await api.post(`/products/${productId}/images`, file, {
    headers: { "Content-Type": file.type },
  });
  return response.data.data;
}

export async function setPrimaryProductImageRequest(productId, imageId) {
  const response = await api.patch(`/products/${productId}/images/${imageId}/primary`);
  return response.data.data;
}

export async function deleteProductImageRequest(productId, imageId) {
  const response = await api.delete(`/products/${productId}/images/${imageId}`);
  return response.data.data;
}

export async function reorderProductImagesRequest(productId, imageIds) {
  const response = await api.patch(`/products/${productId}/images/order`, { imageIds });
  return response.data.data || [];
}

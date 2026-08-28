import api from "../api/httpClient.js";

function logisticsPath(origin, id) {
  return `/order-logistics/${encodeURIComponent(String(origin).toLowerCase())}/${id}`;
}

export async function getOperationalOrdersRequest(filters = {}) {
  const response = await api.get("/order-logistics", { params: filters });
  return response.data.data || [];
}

export async function getOperationalOrderByIdRequest(origin, orderId) {
  const response = await api.get(logisticsPath(origin, orderId));
  return response.data.data;
}

export async function startOrderPreparationRequest(origin, orderId) {
  const response = await api.post(`${logisticsPath(origin, orderId)}/start-preparation`);
  return response.data.data;
}

export async function finishOrderPreparationRequest(origin, orderId) {
  const response = await api.post(`${logisticsPath(origin, orderId)}/finish-preparation`);
  return response.data.data;
}

export async function startOrderDeliveryRequest(origin, orderId) {
  const response = await api.post(`${logisticsPath(origin, orderId)}/start-delivery`);
  return response.data.data;
}

export async function completeOrderDeliveryRequest(origin, orderId, evidence) {
  const formData = new FormData();
  formData.set("receiverName", evidence.receiverName.trim());
  formData.set("receiverRut", evidence.receiverRut.trim());
  if (evidence.proofImage) formData.set("proofImage", evidence.proofImage);

  const response = await api.post(
    `${logisticsPath(origin, orderId)}/complete-delivery`,
    formData,
  );
  return response.data.data;
}

export async function getDeliveryProofRequest(origin, orderId) {
  const response = await api.get(
    `${logisticsPath(origin, orderId)}/delivery-proof`,
    { responseType: "blob" },
  );
  return response.data;
}

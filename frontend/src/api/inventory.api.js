import api from "./api.js";

export async function getInventoryMovementsRequest() {
  const response = await api.get("/inventory");
  return response.data.data || [];
}

export async function createInventoryMovementRequest(data) {
  const response = await api.post("/inventory", data);
  return response.data.data;
}

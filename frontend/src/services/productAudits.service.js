import api from "../api/httpClient.js";

export async function getProductAuditsRequest(filters, signal) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined));
  return (await api.get("/product-audits", { params, signal })).data.data;
}

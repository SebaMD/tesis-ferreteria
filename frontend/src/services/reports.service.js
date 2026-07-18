import api from "../api/httpClient.js";

function cleanParams(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

export async function getSalesReportRequest(filters) {
  const response = await api.get("/reports/sales", { params: cleanParams(filters) });
  return response.data.data;
}

import api from "../api/httpClient.js";

function cleanParams(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

export async function getDailySalesReportRequest(date) {
  const response = await api.get("/reports/sales/daily", { params: { date } });
  return response.data.data;
}

export async function getSalesReportRequest(filters) {
  const response = await api.get("/reports/sales", { params: cleanParams(filters) });
  return response.data.data;
}

export async function getSalesByCashierReportRequest(filters) {
  const response = await api.get("/reports/sales/by-cashier", { params: cleanParams(filters) });
  return response.data.data;
}

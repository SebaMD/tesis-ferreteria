import { createSale, deleteSaleById, findSaleById, findSales, updateSaleStatusById } from "./sales.repository.js";
import type { SaleBody } from "./sales.validation.js";

export async function getSalesService() {
  return findSales();
}

export async function getSaleByIdService(id: number) {
  const sale = await findSaleById(id);
  if (!sale) throw new Error("Venta no encontrada");
  return sale;
}

export async function createSaleService(data: SaleBody) {
  return createSale(data);
}

export async function editSaleStatusService(id: number, status: string) {
  const sale = await updateSaleStatusById(id, status);
  if (!sale) throw new Error("Venta no encontrada");
  return sale;
}

export async function deleteSaleService(id: number) {
  return Boolean(await deleteSaleById(id));
}

import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  getDailySalesReportService,
  getSalesByCashierReportService,
  getSalesReportService,
} from "./reports.service.js";
import { validateDailyReportQuery, validateSalesReportQuery } from "./reports.validation.js";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function getDailySalesReport(req: Request, res: Response) {
  try {
    const validation = validateDailyReportQuery(req.query);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);

    const report = await getDailySalesReportService(validation.value);
    return handleSuccess(res, 200, "Reporte diario obtenido exitosamente", report);
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener el reporte diario", message(error));
  }
}

export async function getSalesReport(req: Request, res: Response) {
  try {
    const validation = validateSalesReportQuery(req.query);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);

    const report = await getSalesReportService(validation.value);
    return handleSuccess(res, 200, "Reporte de ventas obtenido exitosamente", report);
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener el reporte de ventas", message(error));
  }
}

export async function getSalesByCashierReport(req: Request, res: Response) {
  try {
    const validation = validateSalesReportQuery(req.query);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);

    const report = await getSalesByCashierReportService(validation.value);
    return handleSuccess(res, 200, "Reporte por cajero obtenido exitosamente", report);
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener el reporte por cajero", message(error));
  }
}

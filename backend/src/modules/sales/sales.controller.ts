import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createSaleService,
  deleteSaleService,
  editSaleStatusService,
  getSaleByIdService,
  getSalesService,
} from "./sales.service.js";
import { validateCreateSaleBody } from "./sales.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function msg(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function fkError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}

export async function getSales(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Ventas obtenidas exitosamente", await getSalesService());
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener ventas", msg(error));
  }
}

export async function getSaleById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    return handleSuccess(res, 200, "Venta encontrada", await getSaleByIdService(id));
  } catch (error) {
    const message = msg(error);
    if (message === "Venta no encontrada") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al obtener venta", message);
  }
}

export async function createSaleController(req: Request, res: Response) {
  try {
    const validation = validateCreateSaleBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 201, "Venta creada exitosamente", await createSaleService(validation.value));
  } catch (error) {
    if (fkError(error)) return handleErrorClient(res, 409, "Usuario o producto no existe");
    return handleErrorServer(res, 500, "Error al crear venta", msg(error));
  }
}

export async function editSaleStatus(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    const { status } = req.body as { status?: unknown };
    if (status !== "ACTIVE" && status !== "CANCELLED") {
      return handleErrorClient(res, 400, "El estado debe ser: ACTIVE o CANCELLED");
    }
    return handleSuccess(res, 200, "Venta actualizada exitosamente", await editSaleStatusService(id, status));
  } catch (error) {
    const message = msg(error);
    if (message === "Venta no encontrada") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al actualizar venta", message);
  }
}

export async function deleteSale(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    if (!(await deleteSaleService(id))) return handleErrorClient(res, 404, "Venta no encontrada");
    return handleSuccess(res, 200, "Venta cancelada exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error al eliminar venta", msg(error));
  }
}

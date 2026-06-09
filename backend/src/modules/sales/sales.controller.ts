import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { InventoryMovementError } from "../inventory/inventory.service.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  cancelSaleService,
  createSaleService,
  getSaleByIdService,
  getSalesService,
  SaleError,
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

export async function createSaleController(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const validation = validateCreateSaleBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);

    const sale = await createSaleService({
      ...validation.value,
      userId: req.user.id,
    });

    return handleSuccess(res, 201, "Venta creada exitosamente", sale);
  } catch (error) {
    if (error instanceof SaleError || error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al crear venta", msg(error));
  }
}

export async function cancelSaleController(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");

    const sale = await cancelSaleService(id, req.user.id);
    return handleSuccess(res, 200, "Venta cancelada exitosamente", sale);
  } catch (error) {
    if (error instanceof SaleError || error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al cancelar venta", msg(error));
  }
}

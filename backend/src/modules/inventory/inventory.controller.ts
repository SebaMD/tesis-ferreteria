import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createInventoryMovementService,
  getInventoryMovementByIdService,
  getInventoryMovementsService,
  InventoryMovementError,
} from "./inventory.service.js";
import { validateCreateInventoryMovementBody } from "./inventory.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function msg(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function getInventoryMovements(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Movimientos obtenidos exitosamente", await getInventoryMovementsService());
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener movimientos", msg(error));
  }
}

export async function getInventoryMovementById(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    return handleSuccess(res, 200, "Movimiento encontrado", await getInventoryMovementByIdService(id));
  } catch (error) {
    const message = msg(error);
    if (message === "Movimiento de inventario no encontrado") return handleErrorClient(res, 404, message);
    return handleErrorServer(res, 500, "Error al obtener movimiento", message);
  }
}

export async function createInventoryMovementController(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const validation = validateCreateInventoryMovementBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);

    const movement = await createInventoryMovementService({
      ...validation.value,
      userId: req.user.id,
    });

    return handleSuccess(res, 201, "Movimiento creado exitosamente", movement);
  } catch (error) {
    if (error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al crear movimiento", msg(error));
  }
}

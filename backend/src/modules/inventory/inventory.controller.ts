import type { Request, Response } from "express";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createInventoryMovementService,
  deleteInventoryMovementService,
  getInventoryMovementByIdService,
  getInventoryMovementsService,
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

function dbConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
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

export async function createInventoryMovementController(req: Request, res: Response) {
  try {
    const validation = validateCreateInventoryMovementBody(req.body);
    if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    return handleSuccess(res, 201, "Movimiento creado exitosamente", await createInventoryMovementService(validation.value));
  } catch (error) {
    if (dbConflict(error)) return handleErrorClient(res, 409, "Producto o usuario no existe");
    return handleErrorServer(res, 500, "Error al crear movimiento", msg(error));
  }
}

export async function deleteInventoryMovement(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) return handleErrorClient(res, 400, "El id debe ser valido");
    if (!(await deleteInventoryMovementService(id))) return handleErrorClient(res, 404, "Movimiento no encontrado");
    return handleSuccess(res, 200, "Movimiento eliminado exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error al eliminar movimiento", msg(error));
  }
}

import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createPromotionService,
  deletePromotionService,
  getPromotionService,
  getPromotionTargetsService,
  listPromotionsService,
  PromotionError,
  setPromotionStatusService,
  updatePromotionService,
} from "./promotions.service.js";
import { validatePromotion, validatePromotionStatus } from "./promotions.validation.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handlePromotionError(res: Response, error: unknown, fallback: string) {
  if (error instanceof PromotionError) {
    return handleErrorClient(res, error.statusCode, error.message);
  }
  return handleErrorServer(res, 500, fallback, error);
}

export async function listPromotionsController(_req: AuthenticatedRequest, res: Response) {
  try {
    return handleSuccess(res, 200, "Promociones obtenidas", await listPromotionsService());
  } catch (error) {
    return handlePromotionError(res, error, "No se pudieron obtener las promociones");
  }
}

export async function getPromotionController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id de la promocion debe ser valido");
  try {
    return handleSuccess(res, 200, "Promocion obtenida", await getPromotionService(id));
  } catch (error) {
    return handlePromotionError(res, error, "No se pudo obtener la promocion");
  }
}

export async function getPromotionTargetsController(_req: AuthenticatedRequest, res: Response) {
  try {
    return handleSuccess(res, 200, "Objetivos obtenidos", await getPromotionTargetsService());
  } catch (error) {
    return handlePromotionError(res, error, "No se pudieron obtener los objetivos");
  }
}

export async function createPromotionController(req: AuthenticatedRequest, res: Response) {
  const validation = validatePromotion(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 201, "Promocion creada", await createPromotionService(req.user.id, validation.value));
  } catch (error) {
    return handlePromotionError(res, error, "No se pudo crear la promocion");
  }
}

export async function updatePromotionController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id de la promocion debe ser valido");
  const validation = validatePromotion(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Promocion actualizada", await updatePromotionService(req.user.id, id, validation.value));
  } catch (error) {
    return handlePromotionError(res, error, "No se pudo actualizar la promocion");
  }
}

export async function setPromotionStatusController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id de la promocion debe ser valido");
  const validation = validatePromotionStatus(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Estado actualizado", await setPromotionStatusService(req.user.id, id, validation.value));
  } catch (error) {
    return handlePromotionError(res, error, "No se pudo actualizar el estado");
  }
}

export async function deletePromotionController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id de la promocion debe ser valido");
  try {
    return handleSuccess(res, 200, "Promocion eliminada", await deletePromotionService(id));
  } catch (error) {
    return handlePromotionError(res, error, "No se pudo eliminar la promocion");
  }
}

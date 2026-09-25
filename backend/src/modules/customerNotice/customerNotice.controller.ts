import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  createCustomerNoticeService,
  CustomerNoticeError,
  deleteCustomerNoticeService,
  getCustomerNoticeConfigurationService,
  getPublicCustomerNoticeService,
  updateCustomerNoticeService,
} from "./customerNotice.service.js";
import { validateCustomerNotice } from "./customerNotice.validation.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleNoticeError(res: Response, error: unknown, fallback: string) {
  if (error instanceof CustomerNoticeError) {
    return handleErrorClient(res, error.statusCode, error.message);
  }
  return handleErrorServer(res, 500, fallback, error);
}

export async function getPublicCustomerNotice(_req: Request, res: Response) {
  try {
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 200, "Avisos publicos obtenidos", await getPublicCustomerNoticeService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudieron obtener los avisos", error);
  }
}

export async function getCustomerNoticeConfiguration(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Avisos obtenidos", await getCustomerNoticeConfigurationService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo obtener la configuracion", error);
  }
}

export async function createCustomerNoticeController(req: AuthenticatedRequest, res: Response) {
  const validation = validateCustomerNotice(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(
      res,
      201,
      "Aviso creado",
      await createCustomerNoticeService(req.user.id, validation.value),
    );
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo crear el aviso");
  }
}

export async function updateCustomerNoticeController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id del aviso debe ser valido");
  const validation = validateCustomerNotice(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(
      res,
      200,
      "Aviso actualizado",
      await updateCustomerNoticeService(req.user.id, id, validation.value),
    );
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo actualizar el aviso");
  }
}

export async function deleteCustomerNoticeController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id del aviso debe ser valido");
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    await deleteCustomerNoticeService(id);
    return handleSuccess(res, 200, "Aviso eliminado");
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo eliminar el aviso");
  }
}

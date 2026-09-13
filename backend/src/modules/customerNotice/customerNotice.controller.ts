import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  getCustomerNoticeConfigurationService,
  getPublicCustomerNoticeService,
  updateCustomerNoticeService,
} from "./customerNotice.service.js";
import { validateCustomerNotice } from "./customerNotice.validation.js";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Error desconocido";

export async function getPublicCustomerNotice(_req: Request, res: Response) {
  try {
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 200, "Aviso publico obtenido", await getPublicCustomerNoticeService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo obtener el aviso", errorMessage(error));
  }
}

export async function getCustomerNoticeConfiguration(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Configuracion obtenida", await getCustomerNoticeConfigurationService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo obtener la configuracion", errorMessage(error));
  }
}

export async function updateCustomerNotice(req: AuthenticatedRequest, res: Response) {
  const validation = validateCustomerNotice(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(
      res,
      200,
      "Aviso actualizado",
      await updateCustomerNoticeService(req.user.id, validation.value),
    );
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo actualizar el aviso", errorMessage(error));
  }
}

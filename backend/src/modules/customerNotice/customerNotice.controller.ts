import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { ImageFileError } from "../../utils/imageFiles.js";
import {
  createCustomerNoticeService,
  CustomerNoticeError,
  deleteCustomerNoticeService,
  getCustomerNoticeConfigurationService,
  getPublicCustomerNoticeService,
  removeCatalogPresentationImageService,
  removeCustomerNoticeImageService,
  reorderCustomerNoticesService,
  updateCatalogPresentationService,
  updateCustomerNoticeService,
  uploadCatalogPresentationImageService,
  uploadCustomerNoticeImageService,
} from "./customerNotice.service.js";
import {
  validateCatalogPresentation,
  validateCustomerNotice,
  validateCustomerNoticeOrder,
} from "./customerNotice.validation.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleNoticeError(res: Response, error: unknown, fallback: string) {
  if (error instanceof CustomerNoticeError || error instanceof ImageFileError) {
    return handleErrorClient(res, error.statusCode, error.message);
  }
  return handleErrorServer(res, 500, fallback, error);
}

function imageInput(req: Request) {
  if (!Buffer.isBuffer(req.body)) return null;
  return {
    buffer: req.body,
    mimeType: String(req.headers["content-type"] || "").split(";")[0],
  };
}

export async function getPublicCustomerNotice(_req: Request, res: Response) {
  try {
    res.setHeader("Cache-Control", "no-store");
    return handleSuccess(res, 200, "Presentacion y avisos publicos obtenidos", await getPublicCustomerNoticeService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudieron obtener los avisos", error);
  }
}

export async function getCustomerNoticeConfiguration(_req: Request, res: Response) {
  try {
    return handleSuccess(res, 200, "Configuracion de avisos obtenida", await getCustomerNoticeConfigurationService());
  } catch (error) {
    return handleErrorServer(res, 500, "No se pudo obtener la configuracion", error);
  }
}

export async function createCustomerNoticeController(req: AuthenticatedRequest, res: Response) {
  const validation = validateCustomerNotice(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 201, "Aviso creado", await createCustomerNoticeService(req.user.id, validation.value));
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
    return handleSuccess(res, 200, "Aviso actualizado", await updateCustomerNoticeService(req.user.id, id, validation.value));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo actualizar el aviso");
  }
}

export async function reorderCustomerNoticesController(req: AuthenticatedRequest, res: Response) {
  const validation = validateCustomerNoticeOrder(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Orden de avisos actualizado", await reorderCustomerNoticesService(req.user.id, validation.value));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo ordenar los avisos");
  }
}

export async function updateCatalogPresentationController(req: AuthenticatedRequest, res: Response) {
  const validation = validateCatalogPresentation(req.body);
  if (!validation.success) return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Presentacion actualizada", await updateCatalogPresentationService(req.user.id, validation.value));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo actualizar la presentacion");
  }
}

export async function uploadCustomerNoticeImageController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id del aviso debe ser valido");
  const image = imageInput(req);
  if (!image) return handleErrorClient(res, 400, "Debe enviar una imagen valida");
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Imagen del aviso actualizada", await uploadCustomerNoticeImageService(req.user.id, id, image));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo actualizar la imagen del aviso");
  }
}

export async function removeCustomerNoticeImageController(req: AuthenticatedRequest, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return handleErrorClient(res, 400, "El id del aviso debe ser valido");
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Imagen del aviso eliminada", await removeCustomerNoticeImageService(req.user.id, id));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo eliminar la imagen del aviso");
  }
}

export async function uploadCatalogPresentationImageController(req: AuthenticatedRequest, res: Response) {
  const image = imageInput(req);
  if (!image) return handleErrorClient(res, 400, "Debe enviar una imagen valida");
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Imagen de presentacion actualizada", await uploadCatalogPresentationImageService(req.user.id, image));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo actualizar la imagen de presentacion");
  }
}

export async function removeCatalogPresentationImageController(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");
  try {
    return handleSuccess(res, 200, "Imagen de presentacion eliminada", await removeCatalogPresentationImageService(req.user.id));
  } catch (error) {
    return handleNoticeError(res, error, "No se pudo eliminar la imagen de presentacion");
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

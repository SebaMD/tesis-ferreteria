import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { InventoryMovementError } from "../inventory/inventory.service.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  approveCancellationRequestService,
  cancelSaleService,
  createCancellationRequestService,
  createDirectReturnService,
  createSaleService,
  getCancellationRequestsService,
  getSaleByIdService,
  getSalesService,
  rejectCancellationRequestService,
  SaleError,
  undoCancellationRequestService,
} from "./sales.service.js";
import {
  validateCancellationRequestBody,
  validateCancellationReviewBody,
  validateCreateSaleBody,
} from "./sales.validation.js";

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

export async function getCancellationRequestsController(_req: Request, res: Response) {
  try {
    return handleSuccess(
      res,
      200,
      "Solicitudes de devolución obtenidas exitosamente",
      await getCancellationRequestsService(),
    );
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener solicitudes de devolución", msg(error));
  }
}

export async function createCancellationRequestController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const saleId = parseId(req.params.id);
    if (!saleId) return handleErrorClient(res, 400, "El id debe ser valido");

    const validation = validateCancellationRequestBody(req.body);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const request = await createCancellationRequestService(
      saleId,
      req.user.id,
      validation.value,
    );

    return handleSuccess(res, 201, "Solicitud de devolución enviada exitosamente", request);
  } catch (error) {
    if (error instanceof SaleError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al solicitar devolución", msg(error));
  }
}

export async function createDirectReturnController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const saleId = parseId(req.params.id);
    if (!saleId) return handleErrorClient(res, 400, "El id debe ser valido");

    const validation = validateCancellationRequestBody(req.body);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const result = await createDirectReturnService(saleId, req.user.id, validation.value);
    return handleSuccess(res, 200, "Devolución registrada exitosamente", result);
  } catch (error) {
    if (error instanceof SaleError || error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al registrar devolución", msg(error));
  }
}

export async function approveCancellationRequestController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const requestId = parseId(req.params.requestId);
    if (!requestId) return handleErrorClient(res, 400, "El id debe ser valido");

    const validation = validateCancellationReviewBody(req.body, false);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const request = await approveCancellationRequestService(
      requestId,
      req.user.id,
      validation.value,
    );

    return handleSuccess(res, 200, "Solicitud de devolución aprobada exitosamente", request);
  } catch (error) {
    if (error instanceof SaleError || error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al aprobar solicitud de devolución", msg(error));
  }
}

export async function rejectCancellationRequestController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const requestId = parseId(req.params.requestId);
    if (!requestId) return handleErrorClient(res, 400, "El id debe ser valido");

    const validation = validateCancellationReviewBody(req.body, true);
    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const request = await rejectCancellationRequestService(
      requestId,
      req.user.id,
      validation.value,
    );

    return handleSuccess(res, 200, "Solicitud de devolución rechazada", request);
  } catch (error) {
    if (error instanceof SaleError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al rechazar solicitud de devolución", msg(error));
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

export async function undoCancellationRequestController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

    const requestId = parseId(req.params.requestId);
    if (!requestId) return handleErrorClient(res, 400, "El id debe ser valido");

    const result = await undoCancellationRequestService(requestId, req.user.id);
    return handleSuccess(res, 200, "Devolución deshecha exitosamente", result);
  } catch (error) {
    if (error instanceof SaleError || error instanceof InventoryMovementError) {
      return handleErrorClient(res, error.statusCode, error.message);
    }
    return handleErrorServer(res, 500, "Error al deshacer devolución", msg(error));
  }
}

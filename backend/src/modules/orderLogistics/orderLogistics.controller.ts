import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import {
  getLogisticsOrderByIdService,
  getLogisticsOrdersService,
  type LogisticsAction,
  OrderLogisticsError,
  transitionLogisticsOrderService,
} from "./orderLogistics.service.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function queryText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function handleControllerError(res: Response, error: unknown, fallback: string) {
  if (error instanceof OrderLogisticsError) {
    return handleErrorClient(res, error.statusCode, error.message);
  }
  return handleErrorServer(
    res,
    500,
    fallback,
    error instanceof Error ? error.message : "Error desconocido",
  );
}

export async function getLogisticsOrdersController(req: AuthenticatedRequest, res: Response) {
  try {
    const orders = await getLogisticsOrdersService({
      status: queryText(req.query.status),
      search: queryText(req.query.search),
    });
    return handleSuccess(res, 200, "Pedidos operacionales obtenidos exitosamente", orders);
  } catch (error) {
    return handleControllerError(res, error, "No se pudieron obtener los pedidos online");
  }
}

export async function getLogisticsOrderByIdController(req: AuthenticatedRequest, res: Response) {
  try {
    const orderId = parseId(req.params.id);
    if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");
    return handleSuccess(
      res,
      200,
      "Pedido operacional obtenido exitosamente",
      await getLogisticsOrderByIdService(orderId),
    );
  } catch (error) {
    return handleControllerError(res, error, "No se pudo obtener el pedido online");
  }
}

const actionMessages: Record<LogisticsAction, string> = {
  START_PREPARATION: "Preparacion iniciada exitosamente",
  FINISH_PREPARATION: "Pedido marcado como preparado",
  START_DELIVERY: "Reparto iniciado exitosamente",
  COMPLETE_DELIVERY: "Entrega confirmada exitosamente",
};

export function transitionLogisticsOrderController(action: LogisticsAction) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseId(req.params.id);
      if (!orderId) return handleErrorClient(res, 400, "El id del pedido debe ser valido");
      if (!req.user) return handleErrorClient(res, 401, "Token invalido o expirado");

      return handleSuccess(
        res,
        200,
        actionMessages[action],
        await transitionLogisticsOrderService(orderId, req.user.id, action),
      );
    } catch (error) {
      return handleControllerError(res, error, "No se pudo actualizar el estado logistico");
    }
  };
}

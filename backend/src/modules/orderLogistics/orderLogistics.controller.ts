import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { ImageFileError } from "../../utils/imageFiles.js";
import {
  getDispatchLabelService,
  getDeliveryProofFileService,
  getLogisticsOrderByIdService,
  getLogisticsOrdersService,
  getPreparationLabelService,
  parseLogisticsOrigin,
  type LogisticsAction,
  OrderLogisticsError,
  transitionLogisticsOrderService,
} from "./orderLogistics.service.js";
import { renderDispatchLabelPdf } from "./dispatchLabelPdf.js";
import { renderPreparationLabelPdf } from "./preparationLabelPdf.js";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function queryText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function authenticatedUser(req: AuthenticatedRequest) {
  if (!req.user) throw new OrderLogisticsError("Token invalido o expirado", 401);
  return { id: req.user.id, role: req.user.role };
}

function routeTask(req: AuthenticatedRequest) {
  const origin = parseLogisticsOrigin(req.params.origin);
  const taskId = parseId(req.params.id);
  if (!origin) throw new OrderLogisticsError("El origen debe ser ONLINE o POS", 400);
  if (!taskId) throw new OrderLogisticsError("El id de la compra debe ser valido", 400);
  return { origin, taskId };
}

function handleControllerError(res: Response, error: unknown, fallback: string) {
  if (error instanceof OrderLogisticsError || error instanceof ImageFileError) {
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
    const tasks = await getLogisticsOrdersService({
      status: queryText(req.query.status),
      search: queryText(req.query.search),
      scope: queryText(req.query.scope),
    }, authenticatedUser(req));
    return handleSuccess(res, 200, "Pedidos y repartos obtenidos exitosamente", tasks);
  } catch (error) {
    return handleControllerError(res, error, "No se pudieron obtener los pedidos y repartos");
  }
}

export async function getLogisticsOrderByIdController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { origin, taskId } = routeTask(req);
    return handleSuccess(
      res,
      200,
      "Tarea logistica obtenida exitosamente",
      await getLogisticsOrderByIdService(origin, taskId, authenticatedUser(req)),
    );
  } catch (error) {
    return handleControllerError(res, error, "No se pudo obtener la tarea logistica");
  }
}

const actionMessages: Record<LogisticsAction, string> = {
  START_PREPARATION: "Preparacion iniciada exitosamente",
  FINISH_PREPARATION: "Compra marcada como preparada",
  START_DELIVERY: "Reparto iniciado exitosamente",
  COMPLETE_DELIVERY: "Entrega confirmada exitosamente",
};

export function transitionLogisticsOrderController(action: LogisticsAction) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { origin, taskId } = routeTask(req);
      const user = authenticatedUser(req);
      const file = req.file;

      return handleSuccess(
        res,
        200,
        actionMessages[action],
        await transitionLogisticsOrderService(origin, taskId, user.id, action, {
          receiverName: req.body?.receiverName,
          receiverRut: req.body?.receiverRut,
          proofImage: file
            ? { buffer: file.buffer, mimeType: file.mimetype }
            : null,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "No se pudo actualizar el estado logistico");
    }
  };
}

export async function getDeliveryProofController(req: AuthenticatedRequest, res: Response) {
  try {
    const { origin, taskId } = routeTask(req);
    const proof = await getDeliveryProofFileService(origin, taskId, authenticatedUser(req));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(proof.mimeType);
    return res.sendFile(proof.absolutePath);
  } catch (error) {
    return handleControllerError(res, error, "No se pudo obtener el comprobante de entrega");
  }
}

async function sendLabelPdf(res: Response, pdf: Buffer, filename: string) {
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(pdf.length));
  return res.send(pdf);
}

export async function getPreparationLabelController(req: AuthenticatedRequest, res: Response) {
  try {
    const { origin, taskId } = routeTask(req);
    const model = await getPreparationLabelService(origin, taskId, authenticatedUser(req));
    return await sendLabelPdf(
      res,
      await renderPreparationLabelPdf(model),
      `etiqueta-preparacion-${model.folio}.pdf`,
    );
  } catch (error) {
    return handleControllerError(res, error, "No se pudo generar la etiqueta de preparacion");
  }
}

export async function getDispatchLabelController(req: AuthenticatedRequest, res: Response) {
  try {
    const { origin, taskId } = routeTask(req);
    const model = await getDispatchLabelService(origin, taskId, authenticatedUser(req));
    return await sendLabelPdf(
      res,
      await renderDispatchLabelPdf(model),
      `etiqueta-despacho-${model.folio}.pdf`,
    );
  } catch (error) {
    return handleControllerError(res, error, "No se pudo generar la etiqueta de despacho");
  }
}

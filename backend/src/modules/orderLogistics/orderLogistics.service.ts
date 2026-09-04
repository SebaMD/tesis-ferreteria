import { db } from "../../db/index.js";
import { isValidRut, normalizeName, normalizeRut } from "../auth/auth.validation.js";
import {
  notifyClientOrderBestEffort,
  notifyWarehousesBestEffort,
  type ClientOrderMailEvent,
} from "../notifications/notifications.service.js";
import { issueGuestOrderTrackingAccessService } from "../onlineOrders/onlineOrders.service.js";
import {
  removeStoredImageFile,
  saveImageFile,
} from "../../utils/imageFiles.js";
import { resolveDeliveryProofFile } from "./deliveryProofFile.js";
import {
  buildDispatchLabelModel,
  buildPreparationLabelModel,
} from "./logisticsLabelModels.js";
import {
  findDeliveryProofPath,
  findLogisticsTaskById,
  findLogisticsTaskForUpdate,
  findLogisticsTasks,
  OPERATIONAL_ORDER_STATUSES,
  updateLogisticsTask,
  type LogisticsOrigin,
  type LogisticsScope,
  type LogisticsStatus,
  type LogisticsTask,
} from "./orderLogistics.repository.js";

export class OrderLogisticsError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "OrderLogisticsError";
  }
}

export type LogisticsAction =
  | "START_PREPARATION"
  | "FINISH_PREPARATION"
  | "START_DELIVERY"
  | "COMPLETE_DELIVERY";

export type LogisticsDocument = "PREPARATION_LABEL" | "DISPATCH_LABEL";

export type DeliveryEvidenceInput = {
  receiverName?: unknown;
  receiverRut?: unknown;
  proofImage?: {
    buffer: Buffer;
    mimeType: string;
  } | null;
};

export function parseLogisticsOrigin(value: unknown): LogisticsOrigin | null {
  const origin = String(value || "").trim().toUpperCase();
  return origin === "ONLINE" || origin === "POS" ? origin : null;
}

function normalizeSearch(value?: string) {
  const search = String(value || "").trim();
  const folio = /^[PV]-0*(\d+)$/i.exec(search);
  return folio ? folio[1] : search;
}

export function allowedActions(task: LogisticsTask, user: { id: number; role: string }) {
  if (user.role !== "WAREHOUSE") return [] as LogisticsAction[];
  if (task.status === "PAID") return ["START_PREPARATION"] as LogisticsAction[];
  if (task.status === "PREPARING" && task.preparationStartedBy === user.id) {
    return ["FINISH_PREPARATION"] as LogisticsAction[];
  }
  if (task.status === "READY_FOR_DELIVERY") return ["START_DELIVERY"] as LogisticsAction[];
  if (task.status === "READY_FOR_PICKUP") return ["COMPLETE_DELIVERY"] as LogisticsAction[];
  if (task.status === "OUT_FOR_DELIVERY" && task.deliveryStartedBy === user.id) {
    return ["COMPLETE_DELIVERY"] as LogisticsAction[];
  }
  return [] as LogisticsAction[];
}

export function allowedDocuments(task: LogisticsTask, user: { id: number; role: string }) {
  const documents: LogisticsDocument[] = [];
  const administrative = user.role === "ADMIN" || user.role === "MANAGER";

  if (
    administrative
    || task.status === "PAID"
    || (task.status === "PREPARING" && task.preparationStartedBy === user.id)
  ) {
    if (["PAID", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_DELIVERY"].includes(task.status)) {
      documents.push("PREPARATION_LABEL");
    }
  }

  if (task.deliveryType === "DELIVERY") {
    if (
      (administrative && ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(task.status))
      || (task.status === "OUT_FOR_DELIVERY" && task.deliveryStartedBy === user.id)
    ) {
      documents.push("DISPATCH_LABEL");
    }
  }

  return documents;
}

export function presentLogisticsTask(task: LogisticsTask, user: { id: number; role: string }) {
  const {
    preparationStartedBy,
    preparedBy: _preparedBy,
    deliveryStartedBy,
    deliveredBy: _deliveredBy,
    customerType,
    customerName,
    customerRut: _customerRut,
    customerEmail: _customerEmail,
    customerPhone: _customerPhone,
    deliveryRecipientName,
    deliveryRecipientRut: _deliveryRecipientRut,
    deliveryPhone,
    deliveryAddress,
    deliveryCommune,
    deliveryReference,
    deliveryLatitude,
    deliveryLongitude,
    receivedByName: _receivedByName,
    receivedByRut: _receivedByRut,
    proofAvailable,
    paymentMethod,
    cashierName,
    ...operationalTask
  } = task;

  const documents = allowedDocuments(task, user);
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return {
      ...operationalTask,
      customerType,
      customerName,
      customerRut: task.customerRut,
      customerEmail: task.customerEmail,
      customerPhone: task.customerPhone,
      deliveryRecipientName,
      deliveryRecipientRut: task.deliveryRecipientRut,
      deliveryPhone,
      deliveryAddress,
      deliveryCommune,
      deliveryReference,
      deliveryLatitude,
      deliveryLongitude,
      receivedByName: task.receivedByName,
      receivedByRut: task.receivedByRut,
      proofAvailable,
      paymentMethod,
      cashierName,
      allowedActions: allowedActions(task, user),
      availableDocuments: documents,
    };
  }

  const pickupIdentification = task.status === "READY_FOR_PICKUP"
    ? { customerName }
    : {};
  const assignedDelivery = task.deliveryType === "DELIVERY"
    && task.status === "OUT_FOR_DELIVERY"
    && deliveryStartedBy === user.id
    ? {
      deliveryRecipientName,
      deliveryPhone,
      deliveryAddress,
      deliveryCommune,
      deliveryReference,
      deliveryLatitude,
      deliveryLongitude,
    }
    : {};

  return {
    ...operationalTask,
    ...pickupIdentification,
    ...assignedDelivery,
    proofAvailable: false,
    allowedActions: allowedActions(task, user),
    availableDocuments: documents,
  };
}

function taskDate(task: LogisticsTask) {
  return (task.deliveredAt || task.paidAt || task.createdAt).getTime();
}

export async function getLogisticsOrdersService(
  filters: { status?: string; search?: string; scope?: string },
  user: { id: number; role: string },
) {
  const status = filters.status && filters.status !== "ALL"
    ? filters.status as LogisticsStatus
    : undefined;
  if (status && !OPERATIONAL_ORDER_STATUSES.includes(status)) {
    throw new OrderLogisticsError("El estado solicitado no corresponde a trabajo logistico", 400);
  }

  const scope: LogisticsScope = filters.scope === "MINE" ? "MINE" : "ALL";
  if (scope === "MINE" && user.role !== "WAREHOUSE") {
    throw new OrderLogisticsError("La vista Mis tareas es exclusiva de BODEGUERO", 403);
  }

  const search = normalizeSearch(filters.search);
  if (search.length > 100) {
    throw new OrderLogisticsError("La busqueda no puede superar 100 caracteres", 400);
  }

  const tasks = await findLogisticsTasks({
    status,
    search: search || undefined,
    scope,
    userId: scope === "MINE" ? user.id : undefined,
    allowPrivateSearch: user.role === "ADMIN" || user.role === "MANAGER",
  });
  const oldestFirst = scope === "MINE" || Boolean(status && status !== "DELIVERED");
  tasks.sort((left, right) => oldestFirst
    ? taskDate(left) - taskDate(right)
    : taskDate(right) - taskDate(left));
  return tasks.map((task) => presentLogisticsTask(task, user));
}

export async function getLogisticsOrderByIdService(
  origin: LogisticsOrigin,
  taskId: number,
  user: { id: number; role: string },
) {
  const task = await findLogisticsTaskById(origin, taskId);
  if (!task) {
    throw new OrderLogisticsError(
      "Tarea logistica no encontrada. Solo las compras pagadas ingresan a logistica.",
      404,
    );
  }
  return presentLogisticsTask(task, user);
}

function transitionError(action: LogisticsAction, status: string) {
  if (action === "START_PREPARATION" && status === "PREPARING") {
    return "La compra ya esta siendo preparada por otro bodeguero.";
  }
  if (action === "START_DELIVERY" && status === "OUT_FOR_DELIVERY") {
    return "La compra ya se encuentra en reparto.";
  }
  if (action === "COMPLETE_DELIVERY" && status === "DELIVERED") {
    return "La compra ya fue entregada.";
  }
  return {
    START_PREPARATION: "Solo una compra pagada puede comenzar su preparacion.",
    FINISH_PREPARATION: "Solo una compra en preparacion puede marcarse como preparada.",
    START_DELIVERY: "Solo una compra lista para reparto puede iniciar despacho.",
    COMPLETE_DELIVERY: "La compra debe estar lista para retiro o en reparto antes de confirmar su entrega.",
  }[action];
}

function validateEvidence(input: DeliveryEvidenceInput, requirePhoto: boolean) {
  const receiverName = typeof input.receiverName === "string"
    ? normalizeName(input.receiverName)
    : "";
  const receiverRut = typeof input.receiverRut === "string"
    ? normalizeRut(input.receiverRut)
    : "";

  if (receiverName.length < 3 || receiverName.length > 240) {
    throw new OrderLogisticsError(
      "El nombre de quien recibe debe tener entre 3 y 240 caracteres",
      400,
    );
  }
  if (!isValidRut(receiverRut)) {
    throw new OrderLogisticsError("El RUT de quien recibe no es valido", 400);
  }
  if (requirePhoto && !input.proofImage) {
    throw new OrderLogisticsError("La fotografia comprobante es obligatoria para el despacho", 400);
  }

  return { receiverName, receiverRut };
}

function notificationEvent(action: LogisticsAction, nextStatus: LogisticsStatus) {
  if (action === "START_PREPARATION") return "PREPARATION_STARTED";
  if (nextStatus === "READY_FOR_PICKUP") return "READY_FOR_PICKUP";
  if (nextStatus === "READY_FOR_DELIVERY") return "READY_FOR_DELIVERY";
  if (nextStatus === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if (nextStatus === "DELIVERED") return "DELIVERED";
  return null;
}

export async function transitionLogisticsOrderService(
  origin: LogisticsOrigin,
  taskId: number,
  warehouseUserId: number,
  action: LogisticsAction,
  evidence: DeliveryEvidenceInput = {},
) {
  let savedProofPath: string | null = null;
  let transitionCommitted = false;

  try {
    const transitionResult = await db.transaction(async (tx) => {
      const task = await findLogisticsTaskForUpdate(tx, origin, taskId);
      if (!task) throw new OrderLogisticsError("Compra no encontrada", 404);

      const now = new Date();
      let expectedStatus: LogisticsStatus;
      let nextStatus: LogisticsStatus;
      let data: Parameters<typeof updateLogisticsTask>[4];

      if (action === "START_PREPARATION") {
        expectedStatus = "PAID";
        nextStatus = "PREPARING";
        data = {
          status: nextStatus,
          preparationStartedBy: warehouseUserId,
          preparationStartedAt: now,
        };
      } else if (action === "FINISH_PREPARATION") {
        expectedStatus = "PREPARING";
        if (task.preparationStartedBy !== warehouseUserId) {
          throw new OrderLogisticsError(
            "Solo el bodeguero que inicio la preparacion puede marcarla como terminada.",
            403,
          );
        }
        nextStatus = task.deliveryType === "PICKUP"
          ? "READY_FOR_PICKUP"
          : "READY_FOR_DELIVERY";
        data = { status: nextStatus, preparedBy: warehouseUserId, preparedAt: now };
      } else if (action === "START_DELIVERY") {
        expectedStatus = "READY_FOR_DELIVERY";
        if (task.deliveryType !== "DELIVERY") {
          throw new OrderLogisticsError("Las compras de retiro en tienda no inician reparto.", 409);
        }
        nextStatus = "OUT_FOR_DELIVERY";
        data = {
          status: nextStatus,
          deliveryStartedBy: warehouseUserId,
          deliveryStartedAt: now,
        };
      } else {
        expectedStatus = task.deliveryType === "PICKUP"
          ? "READY_FOR_PICKUP"
          : "OUT_FOR_DELIVERY";
        if (
          task.deliveryType === "DELIVERY"
          && task.deliveryStartedBy !== warehouseUserId
        ) {
          throw new OrderLogisticsError(
            "Solo el bodeguero que inicio este reparto puede confirmar la entrega.",
            403,
          );
        }

        const normalizedEvidence = validateEvidence(
          evidence,
          task.deliveryType === "DELIVERY",
        );
        if (task.deliveryType === "DELIVERY" && evidence.proofImage) {
          const saved = await saveImageFile({
            buffer: evidence.proofImage.buffer,
            declaredMimeType: evidence.proofImage.mimeType,
            directorySegments: ["deliveries", origin.toLowerCase(), taskId],
          });
          savedProofPath = saved.relativePath;
        }

        nextStatus = "DELIVERED";
        data = {
          status: nextStatus,
          deliveredBy: warehouseUserId,
          deliveredAt: now,
          receivedByName: normalizedEvidence.receiverName,
          receivedByRut: normalizedEvidence.receiverRut,
          deliveryProofImagePath: savedProofPath,
        };
      }

      if (task.status !== expectedStatus) {
        throw new OrderLogisticsError(transitionError(action, task.status), 409);
      }

      const updated = await updateLogisticsTask(
        tx,
        origin,
        task.id,
        expectedStatus,
        data,
      );
      if (!updated) {
        throw new OrderLogisticsError(
          "El estado cambio mientras se procesaba la accion. Actualiza la vista.",
          409,
        );
      }
      return updated;
    });
    transitionCommitted = true;

    const updatedTask = await findLogisticsTaskById(origin, transitionResult.id);
    if (!updatedTask) throw new OrderLogisticsError("No se pudo recargar la tarea", 404);

    const nextStatus = transitionResult.status as LogisticsStatus;
    const event = notificationEvent(action, nextStatus);
    if (origin === "ONLINE" && event && updatedTask.customerEmail) {
      let trackingUrl: string | undefined;
      if (updatedTask.customerType === "GUEST") {
        try {
          trackingUrl = (await issueGuestOrderTrackingAccessService(
            updatedTask.id,
            nextStatus,
          ))?.url;
        } catch (error) {
          console.error("No se pudo generar el enlace de seguimiento invitado:", error);
        }
      }
      void notifyClientOrderBestEffort({
        email: updatedTask.customerEmail,
        folio: updatedTask.folio,
        event: event as ClientOrderMailEvent,
        trackingUrl,
        recipientType: updatedTask.customerType === "GUEST" ? "GUEST" : "CLIENT",
      });
    }
    if (nextStatus === "READY_FOR_DELIVERY") {
      void notifyWarehousesBestEffort({
        folio: updatedTask.folio,
        event: "READY_FOR_DELIVERY",
      });
    }

    return presentLogisticsTask(updatedTask, { id: warehouseUserId, role: "WAREHOUSE" });
  } catch (error) {
    if (savedProofPath && !transitionCommitted) {
      await removeStoredImageFile(savedProofPath).catch(() => undefined);
    }
    throw error;
  }
}

export async function getDeliveryProofFileService(
  origin: LogisticsOrigin,
  taskId: number,
  user: { id: number; role: string },
) {
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    throw new OrderLogisticsError("No tienes permisos para ver esta evidencia", 403);
  }
  const task = await findLogisticsTaskById(origin, taskId);
  if (!task || task.deliveryType !== "DELIVERY" || task.status !== "DELIVERED") {
    throw new OrderLogisticsError("La evidencia de entrega no esta disponible", 404);
  }
  return resolveDeliveryProofFile(origin, taskId, await findDeliveryProofPath(origin, taskId));
}

async function logisticsDocumentTask(
  origin: LogisticsOrigin,
  taskId: number,
  user: { id: number; role: string },
  document: LogisticsDocument,
) {
  const task = await findLogisticsTaskById(origin, taskId);
  if (!task) throw new OrderLogisticsError("Tarea logistica no encontrada", 404);
  if (!allowedDocuments(task, user).includes(document)) {
    throw new OrderLogisticsError("No tienes permisos para descargar esta etiqueta", 403);
  }
  return task;
}

export async function getPreparationLabelService(
  origin: LogisticsOrigin,
  taskId: number,
  user: { id: number; role: string },
) {
  return buildPreparationLabelModel(
    await logisticsDocumentTask(origin, taskId, user, "PREPARATION_LABEL"),
  );
}

export async function getDispatchLabelService(
  origin: LogisticsOrigin,
  taskId: number,
  user: { id: number; role: string },
) {
  return buildDispatchLabelModel(
    await logisticsDocumentTask(origin, taskId, user, "DISPATCH_LABEL"),
  );
}

import { db } from "../../db/index.js";
import { isValidRut, normalizeName, normalizeRut } from "../auth/auth.validation.js";
import {
  notifyClientOrderBestEffort,
  notifyWarehousesBestEffort,
  type ClientOrderMailEvent,
} from "../notifications/notifications.service.js";
import {
  getStoredImageMimeType,
  removeStoredImageFile,
  resolveStoredImagePath,
  saveImageFile,
} from "../../utils/imageFiles.js";
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

function allowedActions(task: LogisticsTask, user: { id: number; role: string }) {
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

function presentTask(task: LogisticsTask, user: { id: number; role: string }) {
  const {
    preparationStartedBy,
    preparedBy: _preparedBy,
    deliveryStartedBy,
    deliveredBy: _deliveredBy,
    ...publicTask
  } = task;
  return {
    ...publicTask,
    allowedActions: allowedActions(task, user),
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
  });
  const oldestFirst = scope === "MINE" || Boolean(status && status !== "DELIVERED");
  tasks.sort((left, right) => oldestFirst
    ? taskDate(left) - taskDate(right)
    : taskDate(right) - taskDate(left));
  return tasks.map((task) => presentTask(task, user));
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
  return presentTask(task, user);
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
      void notifyClientOrderBestEffort({
        email: updatedTask.customerEmail,
        folio: updatedTask.folio,
        event: event as ClientOrderMailEvent,
      });
    }
    if (nextStatus === "READY_FOR_DELIVERY") {
      void notifyWarehousesBestEffort({
        folio: updatedTask.folio,
        event: "READY_FOR_DELIVERY",
      });
    }

    return presentTask(updatedTask, { id: warehouseUserId, role: "WAREHOUSE" });
  } catch (error) {
    if (savedProofPath && !transitionCommitted) {
      await removeStoredImageFile(savedProofPath).catch(() => undefined);
    }
    throw error;
  }
}

export async function getDeliveryProofFileService(origin: LogisticsOrigin, taskId: number) {
  const imagePath = await findDeliveryProofPath(origin, taskId);
  if (!imagePath || !imagePath.replaceAll("\\", "/").startsWith("deliveries/")) {
    throw new OrderLogisticsError("La compra no tiene fotografia comprobante", 404);
  }
  const mimeType = getStoredImageMimeType(imagePath);
  if (!mimeType) throw new OrderLogisticsError("El comprobante almacenado no es valido", 500);
  return { absolutePath: resolveStoredImagePath(imagePath), mimeType };
}

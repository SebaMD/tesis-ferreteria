import { db } from "../../db/index.js";
import type { OnlineOrderStatus } from "../../db/schema/index.js";
import {
  findLogisticsOrderById,
  findLogisticsOrderForUpdate,
  findLogisticsOrders,
  OPERATIONAL_ORDER_STATUSES,
  updateLogisticsOrder,
} from "./orderLogistics.repository.js";

export class OrderLogisticsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "OrderLogisticsError";
  }
}

export type LogisticsAction =
  | "START_PREPARATION"
  | "FINISH_PREPARATION"
  | "START_DELIVERY"
  | "COMPLETE_DELIVERY";

function normalizeSearch(value?: string) {
  const search = String(value || "").trim();
  const folio = /^P-0*(\d+)$/i.exec(search);
  return folio ? folio[1] : search;
}

export async function getLogisticsOrdersService(filters: {
  status?: string;
  search?: string;
}) {
  const status = filters.status && filters.status !== "ALL"
    ? filters.status as OnlineOrderStatus
    : undefined;

  if (status && !OPERATIONAL_ORDER_STATUSES.includes(status)) {
    throw new OrderLogisticsError("El estado solicitado no corresponde a pedidos operacionales", 400);
  }

  const search = normalizeSearch(filters.search);
  if (search.length > 100) {
    throw new OrderLogisticsError("La busqueda no puede superar 100 caracteres", 400);
  }

  return findLogisticsOrders({ status, search: search || undefined });
}

export async function getLogisticsOrderByIdService(orderId: number) {
  const order = await findLogisticsOrderById(orderId);
  if (!order) {
    throw new OrderLogisticsError(
      "Pedido operacional no encontrado. Solo los pedidos pagados ingresan a logistica.",
      404,
    );
  }
  return order;
}

function transitionError(action: LogisticsAction, status: string) {
  if (action === "START_PREPARATION" && status === "PREPARING") {
    return "El pedido ya esta siendo preparado por otro bodeguero.";
  }
  if (action === "START_DELIVERY" && status === "OUT_FOR_DELIVERY") {
    return "El pedido ya se encuentra en reparto.";
  }
  if (action === "COMPLETE_DELIVERY" && status === "DELIVERED") {
    return "El pedido ya fue entregado.";
  }

  const expected = {
    START_PREPARATION: "Solo un pedido pagado puede comenzar su preparacion.",
    FINISH_PREPARATION: "Solo un pedido en preparacion puede marcarse como preparado.",
    START_DELIVERY: "Solo un pedido listo para despacho puede iniciar reparto.",
    COMPLETE_DELIVERY: "El pedido debe estar listo para retiro o en reparto antes de confirmar su entrega.",
  } satisfies Record<LogisticsAction, string>;

  return expected[action];
}

export async function transitionLogisticsOrderService(
  orderId: number,
  warehouseUserId: number,
  action: LogisticsAction,
) {
  await db.transaction(async (tx) => {
    const order = await findLogisticsOrderForUpdate(tx, orderId);
    if (!order) throw new OrderLogisticsError("Pedido no encontrado", 404);

    const now = new Date();
    let expectedStatus: OnlineOrderStatus;
    let nextStatus: OnlineOrderStatus;
    let data: Parameters<typeof updateLogisticsOrder>[3];

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
      nextStatus = order.deliveryType === "PICKUP"
        ? "READY_FOR_PICKUP"
        : "READY_FOR_DELIVERY";
      data = {
        status: nextStatus,
        preparedBy: warehouseUserId,
        preparedAt: now,
      };
    } else if (action === "START_DELIVERY") {
      expectedStatus = "READY_FOR_DELIVERY";
      nextStatus = "OUT_FOR_DELIVERY";
      data = {
        status: nextStatus,
        deliveryStartedBy: warehouseUserId,
        deliveryStartedAt: now,
      };
    } else {
      expectedStatus = order.deliveryType === "PICKUP"
        ? "READY_FOR_PICKUP"
        : "OUT_FOR_DELIVERY";
      nextStatus = "DELIVERED";
      data = {
        status: nextStatus,
        deliveredBy: warehouseUserId,
        deliveredAt: now,
      };
    }

    if (order.status !== expectedStatus) {
      throw new OrderLogisticsError(transitionError(action, order.status), 409);
    }
    if (action === "START_DELIVERY" && order.deliveryType !== "DELIVERY") {
      throw new OrderLogisticsError("Los pedidos de retiro en tienda no inician reparto.", 409);
    }

    const updated = await updateLogisticsOrder(tx, order.id, expectedStatus, data);
    if (!updated) {
      throw new OrderLogisticsError(
        "El estado del pedido cambio mientras se procesaba la accion. Actualiza la vista.",
        409,
      );
    }
  });

  return getLogisticsOrderByIdService(orderId);
}

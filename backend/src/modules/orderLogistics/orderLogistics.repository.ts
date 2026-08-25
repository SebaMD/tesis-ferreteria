import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
  usersTable,
  type NewOnlineOrder,
  type OnlineOrderStatus,
} from "../../db/schema/index.js";

export const OPERATIONAL_ORDER_STATUSES: OnlineOrderStatus[] = [
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const logisticsOrderColumns = {
  id: onlineOrdersTable.id,
  clientId: onlineOrdersTable.clientId,
  clientNames: usersTable.names,
  clientSurnames: usersTable.surnames,
  clientRut: usersTable.rut,
  clientEmail: usersTable.correo,
  clientPhone: usersTable.phone,
  status: onlineOrdersTable.status,
  total: onlineOrdersTable.total,
  deliveryType: onlineOrdersTable.deliveryType,
  deliveryRecipientName: onlineOrdersTable.deliveryRecipientName,
  deliveryPhone: onlineOrdersTable.deliveryPhone,
  deliveryAddress: onlineOrdersTable.deliveryAddress,
  deliveryCommune: onlineOrdersTable.deliveryCommune,
  deliveryReference: onlineOrdersTable.deliveryReference,
  paidAt: onlineOrdersTable.paidAt,
  preparationStartedBy: onlineOrdersTable.preparationStartedBy,
  preparationStartedAt: onlineOrdersTable.preparationStartedAt,
  preparedBy: onlineOrdersTable.preparedBy,
  preparedAt: onlineOrdersTable.preparedAt,
  deliveryStartedBy: onlineOrdersTable.deliveryStartedBy,
  deliveryStartedAt: onlineOrdersTable.deliveryStartedAt,
  deliveredBy: onlineOrdersTable.deliveredBy,
  deliveredAt: onlineOrdersTable.deliveredAt,
  createdAt: onlineOrdersTable.createdAt,
  updatedAt: onlineOrdersTable.updatedAt,
};

type LogisticsOrderRow = typeof onlineOrdersTable.$inferSelect & {
  clientNames: string;
  clientSurnames: string;
};

async function attachLogisticsData<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const actorIds = new Set<number>();
  for (const order of orders) {
    const actorOrder = order as T & {
      preparationStartedBy?: number | null;
      preparedBy?: number | null;
      deliveryStartedBy?: number | null;
      deliveredBy?: number | null;
    };
    for (const id of [
      actorOrder.preparationStartedBy,
      actorOrder.preparedBy,
      actorOrder.deliveryStartedBy,
      actorOrder.deliveredBy,
    ]) {
      if (id) actorIds.add(id);
    }
  }

  const [items, actors] = await Promise.all([
    db
      .select({
        orderId: onlineOrderItemsTable.orderId,
        productId: onlineOrderItemsTable.productId,
        productName: productsTable.name,
        quantity: onlineOrderItemsTable.quantity,
        unitPrice: onlineOrderItemsTable.unitPrice,
        subtotal: onlineOrderItemsTable.subtotal,
      })
      .from(onlineOrderItemsTable)
      .innerJoin(productsTable, eq(onlineOrderItemsTable.productId, productsTable.id))
      .where(inArray(onlineOrderItemsTable.orderId, orderIds)),
    actorIds.size
      ? db
        .select({ id: usersTable.id, names: usersTable.names, surnames: usersTable.surnames })
        .from(usersTable)
        .where(inArray(usersTable.id, [...actorIds]))
      : Promise.resolve([]),
  ]);

  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push(item);
    itemsByOrder.set(item.orderId, current);
  }

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const actor = (id?: number | null) => id ? actorById.get(id) ?? null : null;

  return orders.map((order) => {
    const row = order as T & {
      preparationStartedBy?: number | null;
      preparedBy?: number | null;
      deliveryStartedBy?: number | null;
      deliveredBy?: number | null;
    };
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const {
      preparationStartedBy,
      preparedBy,
      deliveryStartedBy,
      deliveredBy,
      ...publicOrder
    } = row;

    return {
      ...publicOrder,
      items: orderItems,
      productCount: orderItems.length,
      totalUnits: orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      preparationStartedByUser: actor(preparationStartedBy),
      preparedByUser: actor(preparedBy),
      deliveryStartedByUser: actor(deliveryStartedBy),
      deliveredByUser: actor(deliveredBy),
    };
  });
}

export async function findLogisticsOrders(filters: {
  status?: OnlineOrderStatus;
  search?: string;
}) {
  const conditions = [inArray(onlineOrdersTable.status, OPERATIONAL_ORDER_STATUSES)];

  if (filters.status) conditions.push(eq(onlineOrdersTable.status, filters.status));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(
      ilike(sql`${onlineOrdersTable.id}::text`, pattern),
      ilike(usersTable.names, pattern),
      ilike(usersTable.surnames, pattern),
      ilike(usersTable.rut, pattern),
      ilike(usersTable.correo, pattern),
      ilike(sql`concat_ws(' ', ${usersTable.names}, ${usersTable.surnames})`, pattern),
    )!);
  }

  const rows = await db
    .select(logisticsOrderColumns)
    .from(onlineOrdersTable)
    .innerJoin(usersTable, eq(onlineOrdersTable.clientId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(onlineOrdersTable.createdAt), desc(onlineOrdersTable.id));

  return attachLogisticsData(rows);
}

export async function findLogisticsOrderById(orderId: number) {
  const rows = await db
    .select(logisticsOrderColumns)
    .from(onlineOrdersTable)
    .innerJoin(usersTable, eq(onlineOrdersTable.clientId, usersTable.id))
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      inArray(onlineOrdersTable.status, OPERATIONAL_ORDER_STATUSES),
    ))
    .limit(1);

  const [order] = await attachLogisticsData(rows);
  return order ?? null;
}

export async function findLogisticsOrderForUpdate(tx: DbTransaction, orderId: number) {
  const [order] = await tx
    .select({
      id: onlineOrdersTable.id,
      status: onlineOrdersTable.status,
      deliveryType: onlineOrdersTable.deliveryType,
    })
    .from(onlineOrdersTable)
    .where(eq(onlineOrdersTable.id, orderId))
    .limit(1)
    .for("update");

  return order ?? null;
}

export async function updateLogisticsOrder(
  tx: DbTransaction,
  orderId: number,
  expectedStatus: OnlineOrderStatus,
  data: Partial<NewOnlineOrder>,
) {
  const [order] = await tx
    .update(onlineOrdersTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(
      eq(onlineOrdersTable.id, orderId),
      eq(onlineOrdersTable.status, expectedStatus),
    ))
    .returning({ id: onlineOrdersTable.id, status: onlineOrdersTable.status });

  return order ?? null;
}

export type LogisticsOrder = LogisticsOrderRow;

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
  saleDeliveriesTable,
  saleDetailsTable,
  salesTable,
  usersTable,
  type NewOnlineOrder,
  type NewSaleDelivery,
  type OnlineOrderStatus,
  type SaleDeliveryStatus,
} from "../../db/schema/index.js";

export const OPERATIONAL_ORDER_STATUSES: OnlineOrderStatus[] = [
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export type LogisticsOrigin = "ONLINE" | "POS";
export type LogisticsStatus = OnlineOrderStatus | SaleDeliveryStatus;
export type LogisticsScope = "ALL" | "MINE";

const onlineColumns = {
  id: onlineOrdersTable.id,
  status: onlineOrdersTable.status,
  total: onlineOrdersTable.total,
  deliveryType: onlineOrdersTable.deliveryType,
  customerType: sql<"CLIENT" | "GUEST">`case when ${onlineOrdersTable.clientId} is null then 'GUEST' else 'CLIENT' end`,
  customerName: sql<string>`coalesce(nullif(btrim(concat_ws(' ', ${usersTable.names}, ${usersTable.surnames})), ''), ${onlineOrdersTable.guestName})`,
  customerRut: sql<string | null>`case when ${onlineOrdersTable.clientId} is null then null else ${usersTable.rut} end`,
  customerEmail: sql<string>`coalesce(${usersTable.correo}, ${onlineOrdersTable.guestEmail})`,
  customerPhone: sql<string | null>`coalesce(${usersTable.phone}, ${onlineOrdersTable.guestPhone})`,
  deliveryRecipientName: onlineOrdersTable.deliveryRecipientName,
  deliveryRecipientRut: sql<string | null>`null`,
  deliveryPhone: onlineOrdersTable.deliveryPhone,
  deliveryAddress: onlineOrdersTable.deliveryAddress,
  deliveryCommune: onlineOrdersTable.deliveryCommune,
  deliveryReference: onlineOrdersTable.deliveryReference,
  deliveryLatitude: onlineOrdersTable.deliveryLatitude,
  deliveryLongitude: onlineOrdersTable.deliveryLongitude,
  paidAt: onlineOrdersTable.paidAt,
  paymentMethod: sql<string | null>`null`,
  cashierName: sql<string | null>`null`,
  preparationStartedBy: onlineOrdersTable.preparationStartedBy,
  preparationStartedAt: onlineOrdersTable.preparationStartedAt,
  preparedBy: onlineOrdersTable.preparedBy,
  preparedAt: onlineOrdersTable.preparedAt,
  deliveryStartedBy: onlineOrdersTable.deliveryStartedBy,
  deliveryStartedAt: onlineOrdersTable.deliveryStartedAt,
  deliveredBy: onlineOrdersTable.deliveredBy,
  deliveredAt: onlineOrdersTable.deliveredAt,
  receivedByName: onlineOrdersTable.receivedByName,
  receivedByRut: onlineOrdersTable.receivedByRut,
  deliveryProofImagePath: onlineOrdersTable.deliveryProofImagePath,
  createdAt: onlineOrdersTable.createdAt,
  updatedAt: onlineOrdersTable.updatedAt,
};

const saleColumns = {
  id: saleDeliveriesTable.saleId,
  status: saleDeliveriesTable.status,
  total: salesTable.total,
  customerName: saleDeliveriesTable.recipientName,
  customerRut: saleDeliveriesTable.recipientRut,
  customerEmail: sql<string | null>`null`,
  customerPhone: saleDeliveriesTable.phone,
  deliveryRecipientName: saleDeliveriesTable.recipientName,
  deliveryRecipientRut: saleDeliveriesTable.recipientRut,
  deliveryPhone: saleDeliveriesTable.phone,
  deliveryAddress: saleDeliveriesTable.address,
  deliveryCommune: saleDeliveriesTable.commune,
  deliveryReference: saleDeliveriesTable.reference,
  deliveryLatitude: saleDeliveriesTable.latitude,
  deliveryLongitude: saleDeliveriesTable.longitude,
  paidAt: salesTable.date,
  paymentMethod: salesTable.paymentMethod,
  cashierName: sql<string>`concat_ws(' ', ${usersTable.names}, ${usersTable.surnames})`,
  preparationStartedBy: saleDeliveriesTable.preparationStartedBy,
  preparationStartedAt: saleDeliveriesTable.preparationStartedAt,
  preparedBy: saleDeliveriesTable.preparedBy,
  preparedAt: saleDeliveriesTable.preparedAt,
  deliveryStartedBy: saleDeliveriesTable.deliveryStartedBy,
  deliveryStartedAt: saleDeliveriesTable.deliveryStartedAt,
  deliveredBy: saleDeliveriesTable.deliveredBy,
  deliveredAt: saleDeliveriesTable.deliveredAt,
  receivedByName: saleDeliveriesTable.receivedByName,
  receivedByRut: saleDeliveriesTable.receivedByRut,
  deliveryProofImagePath: saleDeliveriesTable.deliveryProofImagePath,
  createdAt: saleDeliveriesTable.createdAt,
  updatedAt: saleDeliveriesTable.updatedAt,
};

type Actor = { id: number; names: string; surnames: string };
type LogisticsItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

export type LogisticsTask = {
  id: number;
  origin: LogisticsOrigin;
  folio: string;
  status: LogisticsStatus;
  total: string;
  deliveryType: "PICKUP" | "DELIVERY";
  customerType: "CLIENT" | "GUEST" | "POS";
  customerName: string;
  customerRut: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryRecipientName: string | null;
  deliveryRecipientRut: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryCommune: string | null;
  deliveryReference: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  cashierName: string | null;
  preparationStartedBy: number | null;
  preparationStartedAt: Date | null;
  preparedBy: number | null;
  preparedAt: Date | null;
  deliveryStartedBy: number | null;
  deliveryStartedAt: Date | null;
  deliveredBy: number | null;
  deliveredAt: Date | null;
  receivedByName: string | null;
  receivedByRut: string | null;
  proofAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: LogisticsItem[];
  productCount: number;
  totalUnits: number;
  preparationStartedByUser: Actor | null;
  preparedByUser: Actor | null;
  deliveryStartedByUser: Actor | null;
  deliveredByUser: Actor | null;
};

async function findOnlineTasks(filters: {
  status?: LogisticsStatus;
  search?: string;
  scope: LogisticsScope;
  userId?: number;
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
      ilike(onlineOrdersTable.guestName, pattern),
      ilike(onlineOrdersTable.guestEmail, pattern),
      ilike(onlineOrdersTable.guestPhone, pattern),
      ilike(sql`concat_ws(' ', ${usersTable.names}, ${usersTable.surnames})`, pattern),
    )!);
  }
  if (filters.scope === "MINE" && filters.userId) {
    conditions.push(or(
      and(
        eq(onlineOrdersTable.status, "PREPARING"),
        eq(onlineOrdersTable.preparationStartedBy, filters.userId),
      ),
      and(
        eq(onlineOrdersTable.status, "OUT_FOR_DELIVERY"),
        eq(onlineOrdersTable.deliveryStartedBy, filters.userId),
      ),
    )!);
  }

  return db
    .select(onlineColumns)
    .from(onlineOrdersTable)
    .leftJoin(usersTable, eq(onlineOrdersTable.clientId, usersTable.id))
    .where(and(...conditions));
}

async function findSaleTasks(filters: {
  status?: LogisticsStatus;
  search?: string;
  scope: LogisticsScope;
  userId?: number;
}) {
  const conditions = [];
  if (filters.status) conditions.push(eq(saleDeliveriesTable.status, filters.status));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(
      ilike(sql`${saleDeliveriesTable.saleId}::text`, pattern),
      ilike(saleDeliveriesTable.recipientName, pattern),
      ilike(saleDeliveriesTable.recipientRut, pattern),
      ilike(saleDeliveriesTable.address, pattern),
      ilike(sql`concat_ws(' ', ${usersTable.names}, ${usersTable.surnames})`, pattern),
    )!);
  }
  if (filters.scope === "MINE" && filters.userId) {
    conditions.push(or(
      and(
        eq(saleDeliveriesTable.status, "PREPARING"),
        eq(saleDeliveriesTable.preparationStartedBy, filters.userId),
      ),
      and(
        eq(saleDeliveriesTable.status, "OUT_FOR_DELIVERY"),
        eq(saleDeliveriesTable.deliveryStartedBy, filters.userId),
      ),
    )!);
  }

  const query = db
    .select(saleColumns)
    .from(saleDeliveriesTable)
    .innerJoin(salesTable, eq(saleDeliveriesTable.saleId, salesTable.id))
    .innerJoin(usersTable, eq(salesTable.userId, usersTable.id));
  return conditions.length ? query.where(and(...conditions)) : query;
}

function actorIdsFromRows(rows: Array<{
  preparationStartedBy: number | null;
  preparedBy: number | null;
  deliveryStartedBy: number | null;
  deliveredBy: number | null;
}>) {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of [row.preparationStartedBy, row.preparedBy, row.deliveryStartedBy, row.deliveredBy]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export async function findLogisticsTasks(filters: {
  status?: LogisticsStatus;
  search?: string;
  scope: LogisticsScope;
  userId?: number;
}) {
  const [onlineRows, saleRows] = await Promise.all([
    findOnlineTasks(filters),
    findSaleTasks(filters),
  ]);
  const onlineIds = onlineRows.map((row) => row.id);
  const saleIds = saleRows.map((row) => row.id);
  const actorIds = actorIdsFromRows([...onlineRows, ...saleRows]);

  const [onlineItems, saleItems, actors] = await Promise.all([
    onlineIds.length
      ? db.select({
        taskId: onlineOrderItemsTable.orderId,
        productId: onlineOrderItemsTable.productId,
        productName: productsTable.name,
        quantity: onlineOrderItemsTable.quantity,
        unitPrice: onlineOrderItemsTable.unitPrice,
        subtotal: onlineOrderItemsTable.subtotal,
      }).from(onlineOrderItemsTable)
        .innerJoin(productsTable, eq(onlineOrderItemsTable.productId, productsTable.id))
        .where(inArray(onlineOrderItemsTable.orderId, onlineIds))
      : Promise.resolve([]),
    saleIds.length
      ? db.select({
        taskId: saleDetailsTable.saleId,
        productId: saleDetailsTable.productId,
        productName: productsTable.name,
        quantity: saleDetailsTable.quantity,
        unitPrice: saleDetailsTable.unitPrice,
        subtotal: saleDetailsTable.subtotal,
      }).from(saleDetailsTable)
        .innerJoin(productsTable, eq(saleDetailsTable.productId, productsTable.id))
        .where(inArray(saleDetailsTable.saleId, saleIds))
      : Promise.resolve([]),
    actorIds.length
      ? db.select({ id: usersTable.id, names: usersTable.names, surnames: usersTable.surnames })
        .from(usersTable)
        .where(inArray(usersTable.id, actorIds))
      : Promise.resolve([]),
  ]);

  const onlineItemsById = new Map<number, LogisticsItem[]>();
  const saleItemsById = new Map<number, LogisticsItem[]>();
  for (const item of onlineItems) {
    const current = onlineItemsById.get(item.taskId) ?? [];
    current.push(item);
    onlineItemsById.set(item.taskId, current);
  }
  for (const item of saleItems) {
    const current = saleItemsById.get(item.taskId) ?? [];
    current.push(item);
    saleItemsById.set(item.taskId, current);
  }

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const actor = (id: number | null) => id ? actorById.get(id) ?? null : null;

  const onlineTasks: LogisticsTask[] = onlineRows.map((row) => {
    const items = onlineItemsById.get(row.id) ?? [];
    const { deliveryProofImagePath, ...publicRow } = row;
    return {
      ...publicRow,
      origin: "ONLINE",
      folio: `P-${String(row.id).padStart(6, "0")}`,
      status: row.status as LogisticsStatus,
      deliveryType: row.deliveryType as "PICKUP" | "DELIVERY",
      proofAvailable: Boolean(deliveryProofImagePath),
      items,
      productCount: items.length,
      totalUnits: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      preparationStartedByUser: actor(row.preparationStartedBy),
      preparedByUser: actor(row.preparedBy),
      deliveryStartedByUser: actor(row.deliveryStartedBy),
      deliveredByUser: actor(row.deliveredBy),
    };
  });

  const saleTasks: LogisticsTask[] = saleRows.map((row) => {
    const items = saleItemsById.get(row.id) ?? [];
    const { deliveryProofImagePath, ...publicRow } = row;
    return {
      ...publicRow,
      origin: "POS",
      customerType: "POS",
      folio: `V-${String(row.id).padStart(6, "0")}`,
      status: row.status as LogisticsStatus,
      deliveryType: "DELIVERY",
      proofAvailable: Boolean(deliveryProofImagePath),
      items,
      productCount: items.length,
      totalUnits: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      preparationStartedByUser: actor(row.preparationStartedBy),
      preparedByUser: actor(row.preparedBy),
      deliveryStartedByUser: actor(row.deliveryStartedBy),
      deliveredByUser: actor(row.deliveredBy),
    };
  });

  return [...onlineTasks, ...saleTasks];
}

export async function findLogisticsTaskById(origin: LogisticsOrigin, taskId: number) {
  const tasks = await findLogisticsTasks({ scope: "ALL", search: String(taskId) });
  return tasks.find((task) => task.origin === origin && task.id === taskId) ?? null;
}

export async function findLogisticsTaskForUpdate(
  tx: DbTransaction,
  origin: LogisticsOrigin,
  taskId: number,
) {
  if (origin === "ONLINE") {
    const [order] = await tx.select({
      id: onlineOrdersTable.id,
      status: onlineOrdersTable.status,
      deliveryType: onlineOrdersTable.deliveryType,
      preparationStartedBy: onlineOrdersTable.preparationStartedBy,
      deliveryStartedBy: onlineOrdersTable.deliveryStartedBy,
    }).from(onlineOrdersTable)
      .where(eq(onlineOrdersTable.id, taskId))
      .limit(1)
      .for("update");
    return order ? { ...order, origin } : null;
  }

  const [delivery] = await tx.select({
    id: saleDeliveriesTable.saleId,
    status: saleDeliveriesTable.status,
    preparationStartedBy: saleDeliveriesTable.preparationStartedBy,
    deliveryStartedBy: saleDeliveriesTable.deliveryStartedBy,
  }).from(saleDeliveriesTable)
    .where(eq(saleDeliveriesTable.saleId, taskId))
    .limit(1)
    .for("update");

  return delivery ? { ...delivery, origin, deliveryType: "DELIVERY" as const } : null;
}

export type LogisticsTaskUpdate = {
  status: LogisticsStatus;
  preparationStartedBy?: number;
  preparationStartedAt?: Date;
  preparedBy?: number;
  preparedAt?: Date;
  deliveryStartedBy?: number;
  deliveryStartedAt?: Date;
  deliveredBy?: number;
  deliveredAt?: Date;
  receivedByName?: string;
  receivedByRut?: string;
  deliveryProofImagePath?: string | null;
};

export async function updateLogisticsTask(
  tx: DbTransaction,
  origin: LogisticsOrigin,
  taskId: number,
  expectedStatus: LogisticsStatus,
  data: LogisticsTaskUpdate,
) {
  if (origin === "ONLINE") {
    const [updated] = await tx.update(onlineOrdersTable)
      .set({ ...data as Partial<NewOnlineOrder>, updatedAt: new Date() })
      .where(and(eq(onlineOrdersTable.id, taskId), eq(onlineOrdersTable.status, expectedStatus)))
      .returning({ id: onlineOrdersTable.id, status: onlineOrdersTable.status });
    return updated ?? null;
  }

  const [updated] = await tx.update(saleDeliveriesTable)
    .set({ ...data as Partial<NewSaleDelivery>, updatedAt: new Date() })
    .where(and(eq(saleDeliveriesTable.saleId, taskId), eq(saleDeliveriesTable.status, expectedStatus)))
    .returning({ id: saleDeliveriesTable.saleId, status: saleDeliveriesTable.status });
  return updated ?? null;
}

export async function findDeliveryProofPath(origin: LogisticsOrigin, taskId: number) {
  if (origin === "ONLINE") {
    const [row] = await db.select({ imagePath: onlineOrdersTable.deliveryProofImagePath })
      .from(onlineOrdersTable)
      .where(eq(onlineOrdersTable.id, taskId))
      .limit(1);
    return row?.imagePath ?? null;
  }

  const [row] = await db.select({ imagePath: saleDeliveriesTable.deliveryProofImagePath })
    .from(saleDeliveriesTable)
    .where(eq(saleDeliveriesTable.saleId, taskId))
    .limit(1);
  return row?.imagePath ?? null;
}

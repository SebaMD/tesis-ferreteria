import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbTransaction } from "../../db/index.js";
import {
  productsTable,
  saleCancellationRequestItemsTable,
  saleCancellationRequestsTable,
  saleDetailsTable,
  saleDeliveriesTable,
  salesTable,
  usersTable,
  type NewSaleCancellationRequestItem,
  type NewSaleDetail,
  type NewSaleDelivery,
} from "../../db/schema/index.js";

const requestingUsers = alias(usersTable, "requesting_users");
const reviewingUsers = alias(usersTable, "reviewing_users");
const reversingUsers = alias(usersTable, "reversing_users");

const returnedTotalExpression = sql<string>`coalesce((
  select sum(${saleDetailsTable.returnedQuantity} * ${saleDetailsTable.unitPrice})
  from ${saleDetailsTable}
  where ${saleDetailsTable.saleId} = ${salesTable.id}
), 0)`;

const netTotalExpression = sql<string>`greatest(
  ${salesTable.total} - ${returnedTotalExpression},
  0
)`;

const saleColumns = {
  id: salesTable.id,
  userId: salesTable.userId,
  userNames: usersTable.names,
  userSurnames: usersTable.surnames,
  date: salesTable.date,
  paymentMethod: salesTable.paymentMethod,
  total: salesTable.total,
  returnedTotal: returnedTotalExpression,
  netTotal: netTotalExpression,
  status: salesTable.status,
  createdAt: salesTable.createdAt,
  updatedAt: salesTable.updatedAt,
};

export async function findSales() {
  const [sales, cancellationRequests, saleSearchDetails] = await Promise.all([
    db.select(saleColumns).from(salesTable).innerJoin(usersTable, eq(salesTable.userId, usersTable.id)),
    findCancellationRequests(),
    db
      .select({
        saleId: saleDetailsTable.saleId,
        productId: saleDetailsTable.productId,
        productName: productsTable.name,
        productBarcode: productsTable.barcode,
      })
      .from(saleDetailsTable)
      .innerJoin(productsTable, eq(saleDetailsTable.productId, productsTable.id)),
  ]);
  const latestRequestBySale = new Map<number, (typeof cancellationRequests)[number]>();
  const detailsBySale = new Map<number, typeof saleSearchDetails>();

  for (const request of cancellationRequests) {
    if (!latestRequestBySale.has(request.saleId)) {
      latestRequestBySale.set(request.saleId, request);
    }
  }

  for (const detail of saleSearchDetails) {
    const currentDetails = detailsBySale.get(detail.saleId) ?? [];
    currentDetails.push(detail);
    detailsBySale.set(detail.saleId, currentDetails);
  }

  return sales.map((sale) => ({
    ...sale,
    details: detailsBySale.get(sale.id) ?? [],
    cancellationRequest: latestRequestBySale.get(sale.id) ?? null,
  }));
}

export async function findSaleById(id: number) {
  const [sale] = await db
    .select(saleColumns)
    .from(salesTable)
    .innerJoin(usersTable, eq(salesTable.userId, usersTable.id))
    .where(eq(salesTable.id, id))
    .limit(1);

  if (!sale) return null;

  const details = await db
    .select({
      saleId: saleDetailsTable.saleId,
      productId: saleDetailsTable.productId,
      productName: productsTable.name,
      productBarcode: productsTable.barcode,
      quantity: saleDetailsTable.quantity,
      returnedQuantity: saleDetailsTable.returnedQuantity,
      unitPrice: saleDetailsTable.unitPrice,
      subtotal: saleDetailsTable.subtotal,
    })
    .from(saleDetailsTable)
    .innerJoin(productsTable, eq(saleDetailsTable.productId, productsTable.id))
    .where(eq(saleDetailsTable.saleId, id));

  const cancellationRequests = await findCancellationRequests(id);

  return { ...sale, details, cancellationRequests };
}

export async function createSale(
  tx: DbTransaction,
  data: {
    userId: number;
    paymentMethod: string;
    total: string;
  },
) {
  const [sale] = await tx
    .insert(salesTable)
    .values({
      userId: data.userId,
      paymentMethod: data.paymentMethod,
      total: data.total,
      status: "ACTIVE",
    })
    .returning({ id: salesTable.id });

  return sale;
}

export async function createSaleDetails(tx: DbTransaction, details: NewSaleDetail[]) {
  return tx.insert(saleDetailsTable).values(details);
}

export async function createSaleDelivery(
  tx: DbTransaction,
  delivery: NewSaleDelivery,
) {
  const [created] = await tx
    .insert(saleDeliveriesTable)
    .values(delivery)
    .returning({ saleId: saleDeliveriesTable.saleId });

  return created;
}

export async function findSaleForCancellation(tx: DbTransaction, id: number) {
  const [sale] = await tx
    .select({
      id: salesTable.id,
      status: salesTable.status,
    })
    .from(salesTable)
    .where(eq(salesTable.id, id))
    .limit(1)
    .for("update");

  return sale ?? null;
}

export async function findSaleDetailsForReturn(tx: DbTransaction, saleId: number) {
  return tx
    .select({
      productId: saleDetailsTable.productId,
      quantity: saleDetailsTable.quantity,
      returnedQuantity: saleDetailsTable.returnedQuantity,
      unitPrice: saleDetailsTable.unitPrice,
    })
    .from(saleDetailsTable)
    .where(eq(saleDetailsTable.saleId, saleId))
    .for("update");
}

export async function increaseReturnedQuantity(
  tx: DbTransaction,
  data: { saleId: number; productId: number; quantity: number },
) {
  const [detail] = await tx
    .update(saleDetailsTable)
    .set({
      returnedQuantity: sql`${saleDetailsTable.returnedQuantity} + ${data.quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saleDetailsTable.saleId, data.saleId),
        eq(saleDetailsTable.productId, data.productId),
        sql`${saleDetailsTable.returnedQuantity} + ${data.quantity} <= ${saleDetailsTable.quantity}`,
      ),
    )
    .returning({ returnedQuantity: saleDetailsTable.returnedQuantity });

  return detail ?? null;
}

export async function decreaseReturnedQuantity(
  tx: DbTransaction,
  data: { saleId: number; productId: number; quantity: number },
) {
  const [detail] = await tx
    .update(saleDetailsTable)
    .set({
      returnedQuantity: sql`${saleDetailsTable.returnedQuantity} - ${data.quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saleDetailsTable.saleId, data.saleId),
        eq(saleDetailsTable.productId, data.productId),
        sql`${saleDetailsTable.returnedQuantity} >= ${data.quantity}`,
      ),
    )
    .returning({ returnedQuantity: saleDetailsTable.returnedQuantity });

  return detail ?? null;
}

export type SaleReturnStatus = "ACTIVE" | "PARTIALLY_RETURNED" | "CANCELLED";

export async function updateSaleReturnStatus(
  tx: DbTransaction,
  id: number,
  status: SaleReturnStatus,
) {
  const [sale] = await tx
    .update(salesTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(salesTable.id, id))
    .returning({ id: salesTable.id, status: salesTable.status });

  return sale ?? null;
}

const cancellationRequestColumns = {
  id: saleCancellationRequestsTable.id,
  saleId: saleCancellationRequestsTable.saleId,
  saleDate: salesTable.date,
  saleTotal: salesTable.total,
  saleStatus: salesTable.status,
  originalCashierId: salesTable.userId,
  originalCashierNames: usersTable.names,
  originalCashierSurnames: usersTable.surnames,
  originalCashierEmail: usersTable.correo,
  requestedBy: saleCancellationRequestsTable.requestedBy,
  requesterNames: requestingUsers.names,
  requesterSurnames: requestingUsers.surnames,
  requesterEmail: requestingUsers.correo,
  reason: saleCancellationRequestsTable.reason,
  status: saleCancellationRequestsTable.status,
  reviewedBy: saleCancellationRequestsTable.reviewedBy,
  reviewerNames: reviewingUsers.names,
  reviewerSurnames: reviewingUsers.surnames,
  reviewerEmail: reviewingUsers.correo,
  adminResponse: saleCancellationRequestsTable.adminResponse,
  requestedAt: saleCancellationRequestsTable.requestedAt,
  reviewedAt: saleCancellationRequestsTable.reviewedAt,
  reversedBy: saleCancellationRequestsTable.reversedBy,
  reverserNames: reversingUsers.names,
  reverserSurnames: reversingUsers.surnames,
  reverserEmail: reversingUsers.correo,
  reversedAt: saleCancellationRequestsTable.reversedAt,
  createdAt: saleCancellationRequestsTable.createdAt,
  updatedAt: saleCancellationRequestsTable.updatedAt,
};

const cancellationRequestItemColumns = {
  requestId: saleCancellationRequestItemsTable.requestId,
  saleId: saleCancellationRequestsTable.saleId,
  productId: saleCancellationRequestItemsTable.productId,
  productName: productsTable.name,
  requestedQuantity: saleCancellationRequestItemsTable.requestedQuantity,
  soldQuantity: saleDetailsTable.quantity,
  returnedQuantity: saleDetailsTable.returnedQuantity,
  unitPrice: saleDetailsTable.unitPrice,
};

async function attachCancellationRequestItems<T extends { id: number }>(requests: T[]) {
  if (requests.length === 0) return [];

  const items = await db
    .select(cancellationRequestItemColumns)
    .from(saleCancellationRequestItemsTable)
    .innerJoin(
      saleCancellationRequestsTable,
      eq(saleCancellationRequestItemsTable.requestId, saleCancellationRequestsTable.id),
    )
    .innerJoin(productsTable, eq(saleCancellationRequestItemsTable.productId, productsTable.id))
    .innerJoin(
      saleDetailsTable,
      and(
        eq(saleCancellationRequestsTable.saleId, saleDetailsTable.saleId),
        eq(saleCancellationRequestItemsTable.productId, saleDetailsTable.productId),
      ),
    )
    .where(inArray(saleCancellationRequestItemsTable.requestId, requests.map((request) => request.id)));

  const itemsByRequest = new Map<number, typeof items>();

  for (const item of items) {
    const current = itemsByRequest.get(item.requestId) ?? [];
    current.push(item);
    itemsByRequest.set(item.requestId, current);
  }

  return requests.map((request) => {
    const details = (itemsByRequest.get(request.id) ?? []).map((item) => ({
      ...item,
      requestedSubtotal: (Number(item.unitPrice) * item.requestedQuantity).toFixed(2),
    }));

    return {
      ...request,
      details,
      requestedTotal: details
        .reduce((total, item) => total + Math.round(Number(item.requestedSubtotal) * 100), 0) / 100,
    };
  });
}

export async function findCancellationRequests(saleId?: number) {
  const query = db
    .select(cancellationRequestColumns)
    .from(saleCancellationRequestsTable)
    .innerJoin(salesTable, eq(saleCancellationRequestsTable.saleId, salesTable.id))
    .innerJoin(usersTable, eq(salesTable.userId, usersTable.id))
    .innerJoin(requestingUsers, eq(saleCancellationRequestsTable.requestedBy, requestingUsers.id))
    .leftJoin(reviewingUsers, eq(saleCancellationRequestsTable.reviewedBy, reviewingUsers.id))
    .leftJoin(reversingUsers, eq(saleCancellationRequestsTable.reversedBy, reversingUsers.id));

  const requests = saleId === undefined
    ? query.orderBy(desc(saleCancellationRequestsTable.requestedAt))
    : query
      .where(eq(saleCancellationRequestsTable.saleId, saleId))
      .orderBy(desc(saleCancellationRequestsTable.requestedAt));

  return attachCancellationRequestItems(await requests);
}

export async function findCancellationRequestById(id: number) {
  const requests = await db
    .select(cancellationRequestColumns)
    .from(saleCancellationRequestsTable)
    .innerJoin(salesTable, eq(saleCancellationRequestsTable.saleId, salesTable.id))
    .innerJoin(usersTable, eq(salesTable.userId, usersTable.id))
    .innerJoin(requestingUsers, eq(saleCancellationRequestsTable.requestedBy, requestingUsers.id))
    .leftJoin(reviewingUsers, eq(saleCancellationRequestsTable.reviewedBy, reviewingUsers.id))
    .leftJoin(reversingUsers, eq(saleCancellationRequestsTable.reversedBy, reversingUsers.id))
    .where(eq(saleCancellationRequestsTable.id, id))
    .limit(1);

  const [request] = await attachCancellationRequestItems(requests);
  return request ?? null;
}

export async function findCancellationRequestForUpdate(tx: DbTransaction, id: number) {
  const [request] = await tx
    .select({
      id: saleCancellationRequestsTable.id,
      saleId: saleCancellationRequestsTable.saleId,
      status: saleCancellationRequestsTable.status,
      reversedBy: saleCancellationRequestsTable.reversedBy,
      reversedAt: saleCancellationRequestsTable.reversedAt,
    })
    .from(saleCancellationRequestsTable)
    .where(eq(saleCancellationRequestsTable.id, id))
    .limit(1)
    .for("update");

  return request ?? null;
}

export async function findPendingCancellationRequest(tx: DbTransaction, saleId: number) {
  const [request] = await tx
    .select({
      id: saleCancellationRequestsTable.id,
      saleId: saleCancellationRequestsTable.saleId,
      status: saleCancellationRequestsTable.status,
    })
    .from(saleCancellationRequestsTable)
    .where(
      and(
        eq(saleCancellationRequestsTable.saleId, saleId),
        eq(saleCancellationRequestsTable.status, "PENDING"),
      ),
    )
    .limit(1);

  return request ?? null;
}

export async function createCancellationRequest(
  tx: DbTransaction,
  data: {
    saleId: number;
    requestedBy: number;
    reason: string;
  },
) {
  const [request] = await tx
    .insert(saleCancellationRequestsTable)
    .values(data)
    .returning({ id: saleCancellationRequestsTable.id });

  return request;
}

export async function createCancellationRequestItems(
  tx: DbTransaction,
  details: NewSaleCancellationRequestItem[],
) {
  return tx.insert(saleCancellationRequestItemsTable).values(details);
}

export async function findCancellationRequestItemsForUpdate(
  tx: DbTransaction,
  requestId: number,
) {
  return tx
    .select({
      requestId: saleCancellationRequestItemsTable.requestId,
      productId: saleCancellationRequestItemsTable.productId,
      requestedQuantity: saleCancellationRequestItemsTable.requestedQuantity,
    })
    .from(saleCancellationRequestItemsTable)
    .where(eq(saleCancellationRequestItemsTable.requestId, requestId))
    .for("update");
}

export async function resolveCancellationRequest(
  tx: DbTransaction,
  data: {
    id: number;
    status: "APPROVED" | "REJECTED";
    reviewedBy: number;
    adminResponse: string;
  },
) {
  const now = new Date();
  const [request] = await tx
    .update(saleCancellationRequestsTable)
    .set({
      status: data.status,
      reviewedBy: data.reviewedBy,
      adminResponse: data.adminResponse,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(saleCancellationRequestsTable.id, data.id),
        eq(saleCancellationRequestsTable.status, "PENDING"),
      ),
    )
    .returning({ id: saleCancellationRequestsTable.id });

  return request ?? null;
}

export async function reverseCancellationRequest(
  tx: DbTransaction,
  data: { id: number; reversedBy: number },
) {
  const now = new Date();
  const [request] = await tx
    .update(saleCancellationRequestsTable)
    .set({
      status: "REVERSED",
      reversedBy: data.reversedBy,
      reversedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(saleCancellationRequestsTable.id, data.id),
        eq(saleCancellationRequestsTable.status, "APPROVED"),
      ),
    )
    .returning({ id: saleCancellationRequestsTable.id });

  return request ?? null;
}

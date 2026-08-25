import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
} from "../../db/schema/index.js";

type QueryExecutor = typeof db | DbTransaction;

export async function lockProductsForAvailability(
  tx: DbTransaction,
  productIds: number[],
) {
  const uniqueIds = [...new Set(productIds)].sort((left, right) => left - right);

  if (uniqueIds.length === 0) return [];

  return tx
    .select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      currentStock: productsTable.currentStock,
      status: productsTable.status,
    })
    .from(productsTable)
    .where(inArray(productsTable.id, uniqueIds))
    .orderBy(asc(productsTable.id))
    .for("update");
}

export async function findActiveReservedQuantities(
  executor: QueryExecutor,
  productIds: number[],
  excludedOrderId?: number,
) {
  const uniqueIds = [...new Set(productIds)];

  if (uniqueIds.length === 0) return new Map<number, number>();

  const conditions = [
    inArray(onlineOrderItemsTable.productId, uniqueIds),
    eq(onlineOrdersTable.status, "PENDING_PAYMENT"),
    gt(onlineOrdersTable.reservationExpiresAt, sql`now() - interval '2 minutes'`),
  ];

  if (excludedOrderId !== undefined) {
    conditions.push(ne(onlineOrdersTable.id, excludedOrderId));
  }

  const rows = await executor
    .select({
      productId: onlineOrderItemsTable.productId,
      reservedQuantity: sql<number>`sum(${onlineOrderItemsTable.quantity})::integer`,
    })
    .from(onlineOrderItemsTable)
    .innerJoin(onlineOrdersTable, eq(onlineOrderItemsTable.orderId, onlineOrdersTable.id))
    .where(and(...conditions))
    .groupBy(onlineOrderItemsTable.productId);

  return new Map(rows.map((row) => [row.productId, Number(row.reservedQuantity || 0)]));
}

export function calculateAvailableStock(currentStock: number, reservedQuantity: number) {
  return Math.max(Number(currentStock || 0) - Number(reservedQuantity || 0), 0);
}

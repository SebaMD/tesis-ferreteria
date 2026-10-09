import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  onlineOrderItemsTable,
  onlineOrdersTable,
  productsTable,
  saleDetailsTable,
  salesTable,
} from "../../db/schema/index.js";
import type { ReportDateRange } from "./reports.validation.js";

export const COMPLETED_ONLINE_ORDER_STATUSES = [
  "PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export async function findManagerStatisticsData(filters: ReportDateRange) {
  const onlineCommercialDate = sql<Date>`coalesce(${onlineOrdersTable.paidAt}, ${onlineOrdersTable.createdAt})`;

  const [pointOfSaleRows, onlineRows, lowStockProducts] = await Promise.all([
    db
      .select({
        saleId: salesTable.id,
        date: salesTable.date,
        paymentMethod: salesTable.paymentMethod,
        saleTotal: salesTable.total,
        saleStatus: salesTable.status,
        productId: productsTable.id,
        productName: productsTable.name,
        quantity: saleDetailsTable.quantity,
        returnedQuantity: saleDetailsTable.returnedQuantity,
        unitPrice: saleDetailsTable.unitPrice,
      })
      .from(salesTable)
      .innerJoin(saleDetailsTable, eq(salesTable.id, saleDetailsTable.saleId))
      .innerJoin(productsTable, eq(saleDetailsTable.productId, productsTable.id))
      .where(and(
        gte(salesTable.date, filters.from),
        lt(salesTable.date, filters.toExclusive),
      )),
    db
      .select({
        orderId: onlineOrdersTable.id,
        commercialDate: onlineCommercialDate,
        orderTotal: onlineOrdersTable.total,
        orderStatus: onlineOrdersTable.status,
        productId: productsTable.id,
        productName: productsTable.name,
        quantity: onlineOrderItemsTable.quantity,
        unitPrice: onlineOrderItemsTable.unitPrice,
        subtotal: onlineOrderItemsTable.subtotal,
      })
      .from(onlineOrdersTable)
      .innerJoin(onlineOrderItemsTable, eq(onlineOrdersTable.id, onlineOrderItemsTable.orderId))
      .innerJoin(productsTable, eq(onlineOrderItemsTable.productId, productsTable.id))
      .where(and(
        inArray(onlineOrdersTable.status, [...COMPLETED_ONLINE_ORDER_STATUSES]),
        sql`${onlineCommercialDate} >= ${filters.from}`,
        sql`${onlineCommercialDate} < ${filters.toExclusive}`,
      )),
    db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        currentStock: productsTable.currentStock,
        minimumStock: productsTable.minimumStock,
        unitMeasure: productsTable.unitMeasure,
      })
      .from(productsTable)
      .where(and(
        eq(productsTable.status, true),
        sql`${productsTable.currentStock} <= ${productsTable.minimumStock}`,
      ))
      .orderBy(
        asc(sql`${productsTable.currentStock} - ${productsTable.minimumStock}`),
        asc(productsTable.name),
      ),
  ]);

  return { pointOfSaleRows, onlineRows, lowStockProducts };
}

export type ManagerStatisticsSource = Awaited<ReturnType<typeof findManagerStatisticsData>>;

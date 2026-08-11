import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { saleDetailsTable, salesTable, usersTable } from "../../db/schema/index.js";
import type { ReportDateRange } from "./reports.validation.js";

const returnedTotalExpression = sql<string>`coalesce((
  select sum(${saleDetailsTable.returnedQuantity} * ${saleDetailsTable.unitPrice})
  from ${saleDetailsTable}
  where ${saleDetailsTable.saleId} = ${salesTable.id}
), 0)`;

const netTotalExpression = sql<string>`greatest(
  ${salesTable.total} - ${returnedTotalExpression},
  0
)`;

const reportSaleColumns = {
  id: salesTable.id,
  cashierId: salesTable.userId,
  cashierNames: usersTable.names,
  cashierSurnames: usersTable.surnames,
  cashierEmail: usersTable.correo,
  cashierWorkShift: usersTable.workShift,
  cashierShiftStartTime: usersTable.shiftStartTime,
  cashierShiftEndTime: usersTable.shiftEndTime,
  cashierShiftNote: usersTable.shiftNote,
  date: salesTable.date,
  paymentMethod: salesTable.paymentMethod,
  total: salesTable.total,
  returnedTotal: returnedTotalExpression,
  netTotal: netTotalExpression,
  status: salesTable.status,
};

export async function findSalesForReport(filters: ReportDateRange) {
  const conditions: SQL[] = [
    gte(salesTable.date, filters.from),
    lt(salesTable.date, filters.toExclusive),
  ];

  if (filters.cashierId !== undefined) {
    conditions.push(eq(salesTable.userId, filters.cashierId));
  }

  if (filters.paymentMethod) {
    conditions.push(sql`lower(${salesTable.paymentMethod}) = lower(${filters.paymentMethod})`);
  }

  return db
    .select(reportSaleColumns)
    .from(salesTable)
    .innerJoin(usersTable, eq(salesTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(salesTable.date), desc(salesTable.id));
}

export type ReportSale = Awaited<ReturnType<typeof findSalesForReport>>[number];

import { and, eq } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { productsTable, saleDetailsTable, salesTable, usersTable, type NewSaleDetail } from "../../db/schema/index.js";

const saleColumns = {
  id: salesTable.id,
  userId: salesTable.userId,
  userNames: usersTable.names,
  userSurnames: usersTable.surnames,
  date: salesTable.date,
  paymentMethod: salesTable.paymentMethod,
  total: salesTable.total,
  status: salesTable.status,
  createdAt: salesTable.createdAt,
  updatedAt: salesTable.updatedAt,
};

export async function findSales() {
  return db.select(saleColumns).from(salesTable).innerJoin(usersTable, eq(salesTable.userId, usersTable.id));
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
      quantity: saleDetailsTable.quantity,
      unitPrice: saleDetailsTable.unitPrice,
      subtotal: saleDetailsTable.subtotal,
    })
    .from(saleDetailsTable)
    .innerJoin(productsTable, eq(saleDetailsTable.productId, productsTable.id))
    .where(eq(saleDetailsTable.saleId, id));

  return { ...sale, details };
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

export async function findSaleForStatusChange(tx: DbTransaction, id: number) {
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

export async function findSaleDetailsForCancellation(tx: DbTransaction, saleId: number) {
  return tx
    .select({
      productId: saleDetailsTable.productId,
      quantity: saleDetailsTable.quantity,
    })
    .from(saleDetailsTable)
    .where(eq(saleDetailsTable.saleId, saleId));
}

export async function markSaleAsCancelled(tx: DbTransaction, id: number) {
  const [sale] = await tx
    .update(salesTable)
    .set({
      status: "CANCELLED",
      updatedAt: new Date(),
    })
    .where(and(eq(salesTable.id, id), eq(salesTable.status, "ACTIVE")))
    .returning({ id: salesTable.id });

  return sale ?? null;
}

export async function markSaleAsActive(tx: DbTransaction, id: number) {
  const [sale] = await tx
    .update(salesTable)
    .set({
      status: "ACTIVE",
      updatedAt: new Date(),
    })
    .where(and(eq(salesTable.id, id), eq(salesTable.status, "CANCELLED")))
    .returning({ id: salesTable.id });

  return sale ?? null;
}

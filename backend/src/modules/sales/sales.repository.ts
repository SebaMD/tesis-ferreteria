import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productsTable, saleDetailsTable, salesTable, usersTable } from "../../db/schema/index.js";
import type { SaleBody } from "./sales.validation.js";

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

export async function createSale(data: SaleBody) {
  const total = data.details.reduce((sum, detail) => sum + detail.quantity * Number(detail.unitPrice), 0);

  const [sale] = await db.transaction(async (tx) => {
    const [createdSale] = await tx
      .insert(salesTable)
      .values({
        userId: data.userId,
        paymentMethod: data.paymentMethod,
        status: data.status,
        date: data.date,
        total: total.toFixed(2),
      })
      .returning({ id: salesTable.id });

    await tx.insert(saleDetailsTable).values(
      data.details.map((detail) => ({
        saleId: createdSale.id,
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: (detail.quantity * Number(detail.unitPrice)).toFixed(2),
      })),
    );

    return [createdSale];
  });

  return findSaleById(sale.id);
}

export async function updateSaleStatusById(id: number, status: string) {
  const [sale] = await db
    .update(salesTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(salesTable.id, id))
    .returning({ id: salesTable.id });

  if (!sale) return null;
  return findSaleById(sale.id);
}

export async function deleteSaleById(id: number) {
  const [sale] = await db
    .update(salesTable)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(salesTable.id, id))
    .returning({ id: salesTable.id });

  return sale ?? null;
}

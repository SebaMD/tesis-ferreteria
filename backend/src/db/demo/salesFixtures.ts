import { eq } from "drizzle-orm";
import type { DbTransaction } from "../index.js";
import { saleCancellationRequestItemsTable, saleCancellationRequestsTable, saleDetailsTable, salesTable } from "../schema/index.js";
import { applyInventoryMovement } from "../../modules/inventory/inventory.service.js";
import { decreaseReturnedQuantity, increaseReturnedQuantity } from "../../modules/sales/sales.repository.js";

type DemoProduct = { id: number; price: string; currentStock: number; minimumStock: number; status: boolean };
type Detail = { productId: number; quantity: number };
type Scenario = "PENDING" | "REJECTED" | "PARTIAL" | "FULL" | "REVERSED";

function demoDate(daysAgo: number, hour: number, minute: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function seedReturn(tx: DbTransaction, saleId: number, cashierId: number, adminId: number,
  saleDate: Date, details: Detail[], scenario: Scenario) {
  const requestedAt = new Date(saleDate.getTime() + 45 * 60 * 1000);
  const reviewedAt = new Date(requestedAt.getTime() + 15 * 60 * 1000);
  const reversedAt = new Date(reviewedAt.getTime() + 15 * 60 * 1000);
  const requested = scenario === "FULL" ? details : [{ productId: details[0].productId, quantity: 1 }];
  const [request] = await tx.insert(saleCancellationRequestsTable).values({
    saleId, requestedBy: cashierId,
    reason: "Devolución de demostración: producto no requerido por el comprador",
    requestedAt, createdAt: requestedAt, updatedAt: requestedAt,
  }).returning({ id: saleCancellationRequestsTable.id });
  await tx.insert(saleCancellationRequestItemsTable).values(requested.map((detail) => ({
    requestId: request.id, productId: detail.productId, requestedQuantity: detail.quantity,
  })));
  if (scenario === "PENDING") return;
  if (scenario === "REJECTED") {
    await tx.update(saleCancellationRequestsTable).set({
      status: "REJECTED", reviewedBy: adminId,
      adminResponse: "Solicitud ficticia rechazada para demostrar el flujo de revisión; no define una política comercial",
      reviewedAt, updatedAt: reviewedAt,
    }).where(eq(saleCancellationRequestsTable.id, request.id));
    return;
  }
  for (const detail of [...requested].sort((left, right) => left.productId - right.productId)) {
    await applyInventoryMovement(tx, {
      productId: detail.productId, userId: adminId, movementType: "ENTRY", quantity: detail.quantity,
      reason: `Devolución aprobada de venta #${saleId} · solicitud #${request.id}`,
      date: reviewedAt, allowInactive: true,
    });
    if (!await increaseReturnedQuantity(tx, { saleId, ...detail })) throw new Error("Cantidades devueltas demo inválidas");
  }
  await tx.update(saleCancellationRequestsTable).set({
    status: "APPROVED", reviewedBy: adminId, adminResponse: "Devolución de demostración aprobada",
    reviewedAt, updatedAt: reviewedAt,
  }).where(eq(saleCancellationRequestsTable.id, request.id));
  await tx.update(salesTable).set({
    status: scenario === "FULL" ? "CANCELLED" : "PARTIALLY_RETURNED", updatedAt: reviewedAt,
  }).where(eq(salesTable.id, saleId));
  if (scenario !== "REVERSED") return;
  for (const detail of requested) {
    await applyInventoryMovement(tx, {
      productId: detail.productId, userId: adminId, movementType: "EXIT", quantity: detail.quantity,
      reason: `Reversión de devolución de venta #${saleId} · solicitud #${request.id}`,
      date: reversedAt, allowInactive: true,
    });
    if (!await decreaseReturnedQuantity(tx, { saleId, ...detail })) throw new Error("Reversión demo inválida");
  }
  await tx.update(saleCancellationRequestsTable).set({
    status: "REVERSED", reversedBy: adminId, reversedAt, updatedAt: reversedAt,
  }).where(eq(saleCancellationRequestsTable.id, request.id));
  await tx.update(salesTable).set({ status: "ACTIVE", updatedAt: reversedAt }).where(eq(salesTable.id, saleId));
}

// Separate from catalog loading; no Webpay transaction, guest flow or mailer is used.
export async function loadDemoSales(tx: DbTransaction, products: DemoProduct[], adminId: number,
  morningId: number, afternoonId: number) {
  const saleable = products.filter((product) => product.status && product.currentStock >= product.minimumStock + 8);
  if (saleable.length < 20) throw new Error("No hay suficientes productos para las ventas demo");
  const methods = ["efectivo", "debito", "credito", "transferencia"];
  const scenarios = { PENDING: 0, REJECTED: 0, PARTIAL: 0, FULL: 0, REVERSED: 0 };
  for (let saleIndex = 0; saleIndex < 36; saleIndex += 1) {
    const slot = saleIndex % 3;
    const saleDate = demoDate(1 + Math.floor(saleIndex / 3), [12, 16, 20][slot], 10 + ((saleIndex * 7) % 40));
    const cashierId = slot === 0 ? morningId : afternoonId;
    const details: Array<Detail & { unitPrice: string; subtotal: string }> = [];
    const used = new Set<number>();
    for (let detailIndex = 0; detailIndex < 2 + (saleIndex % 2); detailIndex += 1) {
      let offset = (saleIndex * 5 + detailIndex * 13) % saleable.length;
      while (used.has(saleable[offset].id)) offset = (offset + 1) % saleable.length;
      const product = saleable[offset];
      const quantity = 1 + ((saleIndex + detailIndex) % 2);
      used.add(product.id);
      details.push({ productId: product.id, quantity,
        unitPrice: Number(product.price).toFixed(2), subtotal: (Number(product.price) * quantity).toFixed(2) });
    }
    const [sale] = await tx.insert(salesTable).values({
      userId: cashierId, date: saleDate, paymentMethod: methods[saleIndex % methods.length],
      total: details.reduce((sum, detail) => sum + Number(detail.subtotal), 0).toFixed(2),
      status: "ACTIVE", createdAt: saleDate, updatedAt: saleDate,
    }).returning({ id: salesTable.id });
    await tx.insert(saleDetailsTable).values(details.map((detail) => ({
      saleId: sale.id, ...detail, createdAt: saleDate, updatedAt: saleDate,
    })));
    for (const detail of details) await applyInventoryMovement(tx, {
      productId: detail.productId, userId: cashierId, movementType: "EXIT", quantity: detail.quantity,
      reason: `Venta #${sale.id}`, date: saleDate,
    });
    const scenario: Scenario | null = saleIndex === 4 ? "PENDING" : saleIndex === 10 ? "REJECTED"
      : saleIndex === 12 ? "REVERSED" : saleIndex % 11 === 3 ? "PARTIAL" : saleIndex % 11 === 7 ? "FULL" : null;
    if (scenario) {
      await seedReturn(tx, sale.id, cashierId, adminId, saleDate, details, scenario);
      scenarios[scenario] += 1;
    }
  }
  return scenarios;
}

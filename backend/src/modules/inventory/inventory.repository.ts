import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inventoryMovementsTable, productsTable, usersTable, type NewInventoryMovement } from "../../db/schema/index.js";

const movementColumns = {
  id: inventoryMovementsTable.id,
  productId: inventoryMovementsTable.productId,
  productName: productsTable.name,
  userId: inventoryMovementsTable.userId,
  userNames: usersTable.names,
  userSurnames: usersTable.surnames,
  movementType: inventoryMovementsTable.movementType,
  quantity: inventoryMovementsTable.quantity,
  reason: inventoryMovementsTable.reason,
  date: inventoryMovementsTable.date,
  createdAt: inventoryMovementsTable.createdAt,
  updatedAt: inventoryMovementsTable.updatedAt,
};

export async function findInventoryMovements() {
  return db
    .select(movementColumns)
    .from(inventoryMovementsTable)
    .innerJoin(productsTable, eq(inventoryMovementsTable.productId, productsTable.id))
    .innerJoin(usersTable, eq(inventoryMovementsTable.userId, usersTable.id));
}

export async function findInventoryMovementById(id: number) {
  const [movement] = await db
    .select(movementColumns)
    .from(inventoryMovementsTable)
    .innerJoin(productsTable, eq(inventoryMovementsTable.productId, productsTable.id))
    .innerJoin(usersTable, eq(inventoryMovementsTable.userId, usersTable.id))
    .where(eq(inventoryMovementsTable.id, id))
    .limit(1);
  return movement;
}

export async function createInventoryMovement(data: NewInventoryMovement) {
  const [movement] = await db.insert(inventoryMovementsTable).values(data).returning({ id: inventoryMovementsTable.id });
  return findInventoryMovementById(movement.id);
}

export async function deleteInventoryMovementById(id: number) {
  const [movement] = await db
    .delete(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.id, id))
    .returning({ id: inventoryMovementsTable.id });
  return movement ?? null;
}

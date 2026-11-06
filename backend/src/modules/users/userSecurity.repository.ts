import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbTransaction } from "../../db/index.js";
import { onlineOrdersTable, rolesTable, saleDeliveriesTable, usersTable, passwordResetTokensTable } from "../../db/schema/index.js";

export class UserSecurityError extends Error {
  constructor(message: string, public readonly statusCode = 409) { super(message); }
}

export async function lockAdministrativeUsers(tx: DbTransaction, actorId: number, targetId: number) {
  // One order for all administrative mutations: admin-set lock, user rows, then dependent rows.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('fyf:administrative-users', 0))`);
  await tx.select({ id: usersTable.id }).from(usersTable)
    .where(inArray(usersTable.id, [...new Set([actorId, targetId])]))
    .orderBy(asc(usersTable.id)).for("update");
  const [actor] = await tx.select({ role: rolesTable.name, status: usersTable.status }).from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId)).where(eq(usersTable.id, actorId));
  if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") {
    throw new UserSecurityError("La cuenta administrativa ya no está habilitada para esta operación", 403);
  }
}

export async function lockActiveWarehouseUser(tx: DbTransaction, id: number) {
  const [user] = await tx.select({ id: usersTable.id, role: rolesTable.name, status: usersTable.status }).from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
    .where(eq(usersTable.id, id)).for("update", { of: usersTable });
  if (!user || user.role !== "WAREHOUSE" || user.status !== "ACTIVE") {
    throw new UserSecurityError("El bodeguero ya no está habilitado para realizar esta operación", 403);
  }
}

export async function assertNoExclusiveLogistics(tx: DbTransaction, userId: number) {
  const ownTask = (table: typeof onlineOrdersTable | typeof saleDeliveriesTable) => or(
    and(eq(table.status, "PREPARING"), eq(table.preparationStartedBy, userId)),
    and(eq(table.status, "OUT_FOR_DELIVERY"), eq(table.deliveryStartedBy, userId)),
  );
  const online = await tx.select({ status: onlineOrdersTable.status }).from(onlineOrdersTable).where(ownTask(onlineOrdersTable)).limit(1);
  const sales = await tx.select({ status: saleDeliveriesTable.status }).from(saleDeliveriesTable).where(ownTask(saleDeliveriesTable)).limit(1);
  if (online.length || sales.length) throw new UserSecurityError(
    "Este bodeguero tiene preparaciones o repartos propios en curso. Primero debe finalizar esas tareas antes de desactivarlo, cambiar su rol o eliminarlo.",
  );
}

export async function invalidateUserPasswordResets(tx: DbTransaction, id: number) {
  await tx.update(passwordResetTokensTable).set({ consumedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.userId, id), isNull(passwordResetTokensTable.consumedAt)));
}

import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rolesTable, usersTable } from "../../db/schema/index.js";

export async function findActiveWarehouseEmails() {
  const rows = await db
    .select({ email: usersTable.correo })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(and(eq(rolesTable.name, "WAREHOUSE"), eq(usersTable.status, "ACTIVE")));

  return [...new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
}

import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rolesTable, usersTable } from "../../db/schema/index.js";

const authUserColumns = {
  id: usersTable.id,
  roleId: usersTable.roleId,
  roleName: rolesTable.name,
  rut: usersTable.rut,
  names: usersTable.names,
  surnames: usersTable.surnames,
  correo: usersTable.correo,
  password: usersTable.password,
  phone: usersTable.phone,
  status: usersTable.status,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
};

export async function findAuthUserByCorreo(correo: string) {
  const [user] = await db
    .select(authUserColumns)
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.correo, correo))
    .limit(1);

  return user;
}

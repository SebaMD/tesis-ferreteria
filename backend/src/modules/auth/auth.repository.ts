import { eq, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rolesTable, usersTable, type NewUser } from "../../db/schema/index.js";

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

export async function findRoleByName(name: string) {
  const [role] = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.name, name))
    .limit(1);

  return role ?? null;
}

export async function findUserByRutOrCorreo(rut: string, correo: string) {
  const [user] = await db
    .select({ id: usersTable.id, rut: usersTable.rut, correo: usersTable.correo })
    .from(usersTable)
    .where(or(eq(usersTable.rut, rut), eq(usersTable.correo, correo)))
    .limit(1);

  return user ?? null;
}

export async function createAuthUser(data: NewUser) {
  const [user] = await db
    .insert(usersTable)
    .values(data)
    .returning({ id: usersTable.id });

  return user;
}

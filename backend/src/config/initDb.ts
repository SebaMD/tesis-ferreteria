import bcrypt from "bcrypt";
import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { rolesTable, usersTable } from "../db/schema/index.js";

export async function createInitialUsers() {
  const roleDefinitions = [
    {
      name: "ADMIN",
      description: "Gestiona usuarios, roles, categorias, productos, inventario y ventas",
    },
    {
      name: "MANAGER",
      description: "Visualiza reportes, analisis de ventas e informacion estrategica",
    },
    {
      name: "CASHIER",
      description: "Registra ventas presenciales y consulta productos/stock",
    },
    {
      name: "WAREHOUSE",
      description: "Gestiona movimientos de inventario y consulta productos",
    },
    {
      name: "CLIENT",
      description: "Consulta el catalogo y utiliza las funciones destinadas a clientes",
    },
  ];

  await db
    .insert(rolesTable)
    .values(roleDefinitions)
    .onConflictDoNothing({ target: rolesTable.name });

  const roles = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(inArray(rolesTable.name, roleDefinitions.map((role) => role.name)));

  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existingUsers.length > 0) return;

  const roleByName = new Map(roles.map((role) => [role.name, role.id]));

  const users: Array<typeof usersTable.$inferInsert> = [
    {
      roleId: roleByName.get("ADMIN")!,
      rut: "12345678-9",
      names: "Administrador",
      surnames: "Sistema",
      correo: "admin@gmail.com",
      password: await bcrypt.hash("@dmin.2026", 10),
      phone: null,
      status: "ACTIVE",
    },
    {
      roleId: roleByName.get("MANAGER")!,
      rut: "11222333-4",
      names: "Gerente",
      surnames: "Sistema",
      correo: "gerente@gmail.com",
      password: await bcrypt.hash("Gerente123.", 10),
      phone: null,
      status: "ACTIVE",
    },
    {
      roleId: roleByName.get("CASHIER")!,
      rut: "55666777-8",
      names: "Cajero",
      surnames: "Mañana",
      correo: "cajero@gmail.com",
      password: await bcrypt.hash("Cajero123.", 10),
      phone: "+56933333333",
      status: "ACTIVE",
      workShift: "MORNING",
      shiftStartTime: "08:30",
      shiftEndTime: "13:30",
      shiftNote: "Turno de apertura y caja de la mañana",
    },
    {
      roleId: roleByName.get("CASHIER")!,
      rut: "13579246-8",
      names: "Cajero",
      surnames: "Tarde",
      correo: "cajero.tarde@gmail.com",
      password: await bcrypt.hash("Cajero123.", 10),
      phone: "+56944444444",
      status: "ACTIVE",
      workShift: "AFTERNOON",
      shiftStartTime: "14:00",
      shiftEndTime: "20:00",
      shiftNote: "Turno de tarde y cierre de caja",
    },
    {
      roleId: roleByName.get("WAREHOUSE")!,
      rut: "98765432-1",
      names: "Bodeguero",
      surnames: "Sistema",
      correo: "bodeguero@gmail.com",
      password: await bcrypt.hash("Bodeguero123.", 10),
      phone: null,
      status: "ACTIVE",
    },
  ];

  await db.insert(usersTable).values(users);
  console.log("=> Usuarios iniciales creados exitosamente");
}

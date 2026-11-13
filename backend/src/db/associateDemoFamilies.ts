import { eq, sql } from "drizzle-orm";
import { db } from "./index.js";
import { usersTable, rolesTable } from "./schema/index.js";
import { associateDemoFamilies } from "./demo/families.js";

try {
  if (process.env.ASSOCIATE_DEMO_FAMILIES !== "true" || process.env.NODE_ENV === "production"
    || process.env.WEBPAY_ENVIRONMENT === "production") throw new Error("Asociación demo requiere autorización explícita y entorno no productivo");
  const url = new URL(process.env.DATABASE_URL ?? "http://missing");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.port || url.port === "5432") throw new Error("Solo se permite PostgreSQL local en un puerto explícito distinto de 5432");
  const result = await db.transaction(async (tx) => {
    const target = (await tx.execute<{ name: string; comment: string }>(sql`select current_database() as name, shobj_description(oid, 'pg_database') as comment from pg_database where datname=current_database()`)).rows[0];
    if (target.comment !== "FYF_DISPOSABLE_DEMO:supplier-reference-demo-2026-10-v1") throw new Error("La base no contiene la marca de la seed revisada");
    const [admin] = await tx.select({ id: usersTable.id }).from(usersTable).innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id)).where(eq(rolesTable.name, "ADMIN")).limit(1);
    if (!admin) throw new Error("No existe un administrador para la trazabilidad");
    return associateDemoFamilies(tx, admin.id);
  });
  console.log("Asociación idempotente completada, sin modificar IDs, precios, stock ni operaciones:", result);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { await db.$client.end(); }

import bcrypt from "bcrypt";
import { eq, inArray, sql } from "drizzle-orm";
import { createInitialUsers } from "../config/initDb.js";
import { db } from "./index.js";
import { catalogPresentationTable, rolesTable, usersTable } from "./schema/index.js";
import { DEMO_DISCLAIMER, demoCategories, demoProducts } from "./demo/catalog.js";
import { loadDemoCatalog } from "./demo/catalogLoader.js";
import { loadDemoSales } from "./demo/salesFixtures.js";
import { associateDemoFamilies } from "./demo/families.js";
import { authorizeDemoTarget, DEMO_DATABASE_MARKER } from "./demo/seedAuthorization.js";

const marker = DEMO_DATABASE_MARKER;

async function seedDemoData() {
  if (process.env.SEED_DEMO_DATA !== "true") throw new Error("Autorice explícitamente con SEED_DEMO_DATA=true");
  if (process.env.NODE_ENV?.toLowerCase() === "production"
    || process.env.WEBPAY_ENVIRONMENT?.toLowerCase() === "production"
    || process.env.MAIL_ENABLED !== "false") {
    throw new Error("Seed exclusivo de desarrollo: production no está permitido y MAIL_ENABLED debe ser false");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-disposable-demo-seed'))`);
    const result = await tx.execute<{ name: string; comment: string | null }>(sql`
      select datname as name, shobj_description(oid, 'pg_database') as comment
      from pg_database where datname = current_database()`);
    const target = result.rows[0];
    if (!target) throw new Error("No se pudo verificar la identidad de la base");
    // The database comment is an atomic initialization marker, not a table or
    // migration. A completed dataset is a strict no-op, even after manual sales.
    if (authorizeDemoTarget(target, process.env.DATABASE_URL, process.env.SEED_LOCAL_ONCE_TOKEN) === "loaded") {
      return { alreadyLoaded: true };
    }
    const tables = await tx.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`);
    for (const { table_name: table } of tables.rows) {
      if (table === "roles" || table === "catalog_presentation") continue;
      const rows = await tx.execute(sql`select 1 from ${sql.identifier(table)} limit 1`);
      if (rows.rows.length) throw new Error(`Base no vacía (${table}): no se modificó ni reemplazó ningún dato`);
    }
    // Bootstrap also joins this transaction, so a failed seed leaves no partial data.
    await createInitialUsers(tx);
    const [cashierRole] = await tx.select().from(rolesTable).where(eq(rolesTable.name, "CASHIER"));
    await tx.insert(usersTable).values({
      roleId: cashierRole.id, rut: "24681357-4", names: "Cajero", surnames: "Inactivo",
      correo: "cajero.inactivo@gmail.com", password: await bcrypt.hash("Cajero123.", 10), status: "INACTIVE",
    });
    const emails = ["admin@gmail.com", "cajero@gmail.com", "cajero.tarde@gmail.com"];
    const users = await tx.select().from(usersTable).where(inArray(usersTable.correo, emails));
    const ids = new Map(users.map((user) => [user.correo, user.id]));
    const adminId = ids.get(emails[0])!;
    await tx.update(catalogPresentationTable).set({
      title: "Catálogo de demostración FYF",
      mainText: DEMO_DISCLAIMER,
      secondaryText: "Entorno aislado de desarrollo y demostración. Artículos de referencia de proveedores; selección y presentaciones pendientes de confirmación comercial. No es un catálogo de existencias reales.",
      updatedAt: new Date(),
    }).where(eq(catalogPresentationTable.id, 1));
    const products = await loadDemoCatalog(tx, adminId);
    const scenarios = await loadDemoSales(tx, products, adminId, ids.get(emails[1])!, ids.get(emails[2])!);
    await associateDemoFamilies(tx, adminId);
    // Both identifiers below come exclusively from validated internal constants.
    await tx.execute(sql.raw(`COMMENT ON DATABASE "${target.name}" IS '${marker}'`));
    return { alreadyLoaded: false, scenarios };
  });
}

try {
  const result = await seedDemoData();
  console.log(DEMO_DISCLAIMER);
  console.log(result.alreadyLoaded
    ? "Demo ya inicializada: sin escrituras, sin reiniciar stock ni modificar operaciones existentes."
    : "Demo inicializada atómicamente: catálogo, existencias, 36 ventas y 9 solicitudes de devolución ficticias.");
  console.log(`Catálogo fuente: ${demoCategories.length} categorías y ${demoProducts.length} productos.`);
  console.log("Sin imágenes publicadas, envíos de correo ni llamadas Webpay.");
} catch (error) {
  console.error("Seed rechazado o revertido:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}

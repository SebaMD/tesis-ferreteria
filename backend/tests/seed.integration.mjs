// SEED_TEST_DATABASE_URL must point to a disposable fyf-seed-audit-* PostgreSQL cluster.
// This test creates and drops only its own database; it never seeds the supplied database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const rootUrl = new URL(process.env.SEED_TEST_DATABASE_URL || "http://missing");
assert.equal(rootUrl.protocol, "postgresql:");
assert.equal(rootUrl.hostname, "127.0.0.1");
assert.ok(Number(rootUrl.port) >= 1024 && ![5432, 5433].includes(Number(rootUrl.port)));
const admin = new pg.Client({ connectionString: rootUrl.href });
await admin.connect();
const databaseName = `fyf_seed_demo_${randomBytes(8).toString("hex")}`;
let created = false;
let pool;
try {
  const directory = (await admin.query("SHOW data_directory")).rows[0].data_directory.replaceAll("\\", "/");
  assert.match(directory, /\/fyf-seed-audit-[a-f0-9]+\/data$/,
    "Use an explicitly disposable cluster, not the normal PostgreSQL instance");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const target = new URL(rootUrl);
  target.pathname = `/${databaseName}`;
  pool = new pg.Pool({ connectionString: target.href });
  const env = { ...process.env, DATABASE_URL: target.href, MAIL_ENABLED: "false", TZ: "America/Santiago" };
  const run = (args) => execFileSync(process.execPath, args, { env, stdio: "inherit" });
  run(["node_modules/drizzle-kit/bin.cjs", "migrate"]);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  assert.equal(Number((await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
  console.log(`PASS ${journal.entries.length} migraciones desde cero en base descartable`);
  run(["--import", "tsx", "src/db/seed.ts"]);

  const counts = async () => {
    const tables = ["roles", "users", "categories", "products", "sales", "sale_details",
      "inventory_movements", "sale_cancellation_requests", "sale_cancellation_request_items"];
    return Object.fromEntries(await Promise.all(tables.map(async (table) =>
      [table, Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)])));
  };
  const firstCounts = await counts();
  assert.equal(firstCounts.roles, 5);
  assert.ok(firstCounts.users >= 6);
  assert.equal(firstCounts.categories, 10);
  assert.equal(firstCounts.products, 100);
  assert.equal(firstCounts.sales, 36);
  assert.equal(firstCounts.sale_details, 90);
  assert.equal(firstCounts.sale_cancellation_requests, 9);
  assert.deepEqual((await pool.query("SELECT status, count(*)::int AS count FROM sale_cancellation_requests GROUP BY status ORDER BY status")).rows,
    [{ status: "APPROVED", count: 6 }, { status: "PENDING", count: 1 }, { status: "REJECTED", count: 1 }, { status: "REVERSED", count: 1 }]);
  assert.deepEqual((await pool.query("SELECT status, count(*)::int AS count FROM sales GROUP BY status ORDER BY status")).rows,
    [{ status: "ACTIVE", count: 30 }, { status: "CANCELLED", count: 3 }, { status: "PARTIALLY_RETURNED", count: 3 }]);

  const zero = async (sql, label) => {
    assert.equal(Number((await pool.query(sql)).rows[0].count), 0, label);
    console.log(`PASS ${label}`);
  };
  await zero(`SELECT count(*) FROM sale_details d WHERE returned_quantity < 0 OR returned_quantity > quantity
    OR returned_quantity <> COALESCE((SELECT sum(i.requested_quantity)
      FROM sale_cancellation_request_items i JOIN sale_cancellation_requests r ON r.id=i.request_id
      WHERE r.sale_id=d.sale_id AND i.product_id=d.product_id AND r.status='APPROVED'), 0)`, "cantidades devueltas coinciden con devoluciones aprobadas vigentes");
  await zero(`SELECT count(*) FROM sales s WHERE total <> (SELECT sum(d.subtotal) FROM sale_details d WHERE d.sale_id=s.id)
    OR status <> (SELECT CASE WHEN sum(returned_quantity)=0 THEN 'ACTIVE'
      WHEN sum(returned_quantity)=sum(quantity) THEN 'CANCELLED' ELSE 'PARTIALLY_RETURNED' END
      FROM sale_details d WHERE d.sale_id=s.id)`, "total original y estado de venta coherentes");
  await zero(`SELECT count(*) FROM sale_cancellation_request_items i JOIN sale_cancellation_requests r ON r.id=i.request_id
    LEFT JOIN sale_details d ON d.sale_id=r.sale_id AND d.product_id=i.product_id
    WHERE d.sale_id IS NULL OR i.requested_quantity <= 0 OR i.requested_quantity > d.quantity`, "productos y cantidades de solicitudes válidos");
  await zero(`SELECT count(*) FROM sale_cancellation_requests r WHERE
    (status='PENDING' AND (reviewed_by IS NOT NULL OR reviewed_at IS NOT NULL OR reversed_by IS NOT NULL))
    OR (status<>'PENDING' AND (reviewed_by IS NULL OR reviewed_at IS NULL OR admin_response IS NULL))
    OR (status='REVERSED' AND (reversed_by IS NULL OR reversed_at IS NULL))
    OR requested_at > now() OR reviewed_at > now() OR reversed_at > now()`, "revisión, reversión y fechas consistentes");
  await zero(`SELECT count(*) FROM sale_cancellation_requests r WHERE
    COALESCE((SELECT sum(m.quantity) FROM inventory_movements m
      WHERE m.reason LIKE '%solicitud #' || r.id AND m.movement_type='ENTRY'), 0)
      <> CASE WHEN r.status IN ('APPROVED','REVERSED') THEN
        (SELECT sum(i.requested_quantity) FROM sale_cancellation_request_items i WHERE i.request_id=r.id) ELSE 0 END
    OR COALESCE((SELECT sum(m.quantity) FROM inventory_movements m
      WHERE m.reason LIKE '%solicitud #' || r.id AND m.movement_type='EXIT'), 0)
      <> CASE WHEN r.status='REVERSED' THEN
        (SELECT sum(i.requested_quantity) FROM sale_cancellation_request_items i WHERE i.request_id=r.id) ELSE 0 END`, "ENTRY al aprobar, EXIT al revertir y ningún movimiento por pendiente/rechazo");
  await zero(`SELECT count(*) FROM products p WHERE current_stock < 0 OR current_stock <>
    COALESCE((SELECT quantity FROM inventory_movements a WHERE a.product_id=p.id AND a.movement_type='ADJUSTMENT' ORDER BY a.id DESC LIMIT 1), 0)
    + COALESCE((SELECT sum(CASE WHEN m.movement_type='ENTRY' THEN m.quantity ELSE -m.quantity END)
      FROM inventory_movements m WHERE m.product_id=p.id AND m.movement_type IN ('ENTRY','EXIT')
      AND m.id > COALESCE((SELECT max(a.id) FROM inventory_movements a WHERE a.product_id=p.id AND a.movement_type='ADJUSTMENT'), 0)), 0)`, "stock no negativo y conciliado con movimientos");
  await zero("SELECT count(*) FROM inventory_movements WHERE reason ILIKE '%cancelacion%' OR reason ILIKE '%reactiv%'", "sin movimientos del antiguo flujo cancelar/reactivar venta");

  const snapshot = async () => {
    const result = {};
    for (const table of ["products", "sales", "sale_details", "inventory_movements", "sale_cancellation_requests", "sale_cancellation_request_items"]) {
      result[table] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
    }
    return result;
  };
  const before = await snapshot();
  run(["--import", "tsx", "src/db/seed.ts"]);
  assert.deepEqual(await counts(), firstCounts);
  assert.deepEqual(await snapshot(), before);
  console.log("PASS segunda ejecución sin duplicar ventas/devoluciones/movimientos ni modificar stock o totales");
  console.log("Datos demo:", JSON.stringify(firstCounts));
} finally {
  await pool?.end();
  if (created) {
    await admin.query(`DROP DATABASE "${databaseName}"`);
    console.log("PASS base temporal eliminada");
  }
  await admin.end();
}

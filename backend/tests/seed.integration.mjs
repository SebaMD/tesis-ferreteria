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
let server;
let applicationDb;
try {
  const directory = (await admin.query("SHOW data_directory")).rows[0].data_directory.replaceAll("\\", "/");
  assert.match(directory, /\/fyf-seed-audit-[a-f0-9]+\/data$/,
    "Use an explicitly disposable cluster, not the normal PostgreSQL instance");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const target = new URL(rootUrl);
  target.pathname = `/${databaseName}`;
  pool = new pg.Pool({ connectionString: target.href });
  const env = { ...process.env, DATABASE_URL: target.href, SEED_DEMO_DATA: "true", NODE_ENV: "test",
    WEBPAY_ENVIRONMENT: "integration", MAIL_ENABLED: "false", TZ: "America/Santiago" };
  const run = (args, overrides = {}) => execFileSync(process.execPath, args, { env: { ...env, ...overrides }, stdio: "inherit" });
  run(["node_modules/drizzle-kit/bin.cjs", "migrate"]);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  assert.equal(Number((await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
  console.log(`PASS ${journal.entries.length} migraciones desde cero en base descartable`);
  assert.throws(() => run(["--import", "tsx", "src/db/seed.ts"], { SEED_DEMO_DATA: "false" }));
  assert.throws(() => run(["--import", "tsx", "src/db/seed.ts"], { NODE_ENV: "production" }));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM products")).rows[0].n, 0);
  console.log("PASS opt-in obligatorio y rechazo de producción sin escrituras");
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
  assert.equal(firstCounts.categories, 8);
  assert.equal(firstCounts.products, 96);
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
  await zero("SELECT count(*) FROM products WHERE barcode IS NOT NULL", "ningún código de proveedor se interpreta como código de barras");
  await zero("SELECT count(*) FROM products WHERE description NOT LIKE 'DEMOSTRACIÓN:%'", "todos los precios y stocks identificados como ficticios");
  await zero("SELECT count(*) FROM product_images", "imágenes de proveedores no publicadas");
  await zero("SELECT count(*) FROM online_payments", "ningún intento Webpay creado por la seed");
  await zero("SELECT count(*) FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE c.id IS NULL", "categorías relacionadas correctamente");
  await zero("SELECT count(*) FROM (SELECT category_id,lower(name) FROM products GROUP BY category_id,lower(name) HAVING count(*)>1) d", "sin productos duplicados");

  // Real HTTP reads and a POS sale against this disposable database only.
  Object.assign(process.env, env, {
    SESSION_SECRET: randomBytes(32).toString("hex"),
    EMAIL_VERIFICATION_SECRET: randomBytes(32).toString("hex"),
    LOGISTICS_QR_SECRET: randomBytes(32).toString("hex"),
  });
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, options = {}) => {
    const response = await fetch(base + route, options);
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload.data;
  };
  const catalog = await request("/catalog/products?limit=100");
  assert.equal(catalog.totalItems, 43); // 19 families + 24 active simple products
  assert.equal(catalog.facets.categories.length, 8);
  const meshId = catalog.facets.categories.find((category) => category.name === "Mallas y cercos").id;
  assert.equal((await request(`/catalog/products?categoryId=${meshId}&limit=100`)).totalItems, 2);
  assert.equal((await request("/catalog/products?availability=in-stock&limit=100")).totalItems, 43);
  const priceFilter = await request("/catalog/products?minPrice=5000&maxPrice=10000&limit=100");
  assert.ok(priceFilter.items.length > 0 && priceFilter.items.every((item) => Number(item.fromPrice ?? item.price) >= 5000 && Number(item.fromPrice ?? item.price) <= 10000));
  assert.equal((await request("/catalog/products?brand=rex&limit=100")).totalItems, 3);
  assert.equal((await request("/catalog/products?search=BP5820")).totalItems, 1);
  const { token: adminToken } = await request("/auth/login", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "admin@gmail.com", password: "@dmin.2026" }) });
  const { token: cashierToken } = await request("/auth/login", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "cajero@gmail.com", password: "Cajero123." }) });
  const stock = await request("/products", { headers: { Authorization: `Bearer ${cashierToken}` } });
  const posProduct = stock.find((product) => product.status && product.availableStock > 5);
  assert.ok(posProduct);
  const saleResponse = await fetch(base + "/sales", { method: "POST",
    headers: { Authorization: `Bearer ${cashierToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethod: "efectivo", details: [{ productId: posProduct.id, quantity: 1 }] }) });
  assert.equal(saleResponse.status, 201, await saleResponse.text());
  assert.equal(Number((await pool.query("SELECT current_stock FROM products WHERE id=$1", [posProduct.id])).rows[0].current_stock), posProduct.currentStock - 1);
  const movements = await request("/inventory", { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(movements.length > 0);
  assert.equal((await pool.query("SELECT title FROM catalog_presentation WHERE id=1")).rows[0].title, "Catálogo de demostración FYF");
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/docs/seed-catalog-review/images/cot-5003027.png`)).status, 404);
  console.log("PASS catálogo, marca, búsqueda, categorías, inventario y nueva venta POS con descuento exacto");

  const snapshot = async () => {
    const result = {};
    const tables = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows;
    for (const { table_name: table } of tables) {
      result[table] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows;
    }
    return result;
  };
  const before = await snapshot();
  const beforeCounts = await counts();
  run(["--import", "tsx", "src/db/seed.ts"]);
  assert.deepEqual(await counts(), beforeCounts);
  assert.deepEqual(await snapshot(), before);
  console.log("PASS segunda ejecución sin duplicar ventas/devoluciones/movimientos ni modificar stock o totales");
  console.log("Datos demo:", JSON.stringify(firstCounts));
  // Even with explicit opt-in, an unmarked database containing this history is rejected.
  await pool.query(`COMMENT ON DATABASE "${databaseName}" IS NULL`);
  assert.throws(() => run(["--import", "tsx", "src/db/seed.ts"]));
  assert.deepEqual(await snapshot(), before);
  console.log("PASS rechaza base no vacía sin marca; historial intacto");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await applicationDb?.$client.end();
  await pool?.end();
  if (created) {
    await admin.query(`DROP DATABASE "${databaseName}"`);
    console.log("PASS base temporal eliminada");
  }
  await admin.end();
}

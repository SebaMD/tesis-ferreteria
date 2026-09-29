// CATALOG_PAGINATION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55444/postgres node tests/catalogPagination.integration.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const rootUrl = new URL(process.env.CATALOG_PAGINATION_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55444",
  "Use the isolated PostgreSQL cluster on port 55444",
);

const databaseName = `fyf_catalog_pagination_${randomBytes(4).toString("hex")}`;
const admin = new pg.Client({ connectionString: rootUrl.href });
let pool;
let server;
let applicationDb;

function databaseUrl() {
  const value = new URL(rootUrl);
  value.pathname = `/${databaseName}`;
  return value.href;
}

await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  pool = new pg.Pool({ connectionString: databaseUrl() });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const categories = (await pool.query(`
    INSERT INTO categories(name) VALUES ('Herramientas'),('Materiales') RETURNING id,name
  `)).rows;
  const toolsId = categories.find((category) => category.name === "Herramientas").id;
  const materialsId = categories.find((category) => category.name === "Materiales").id;

  await pool.query(`
    INSERT INTO products(category_id,name,brand,description,price,unit_measure,current_stock,minimum_stock,status)
    SELECT
      CASE WHEN number % 2 = 0 THEN $1::integer ELSE $2::integer END,
      'Producto ' || lpad(number::text, 3, '0'),
      CASE
        WHEN number = 1 THEN 'Marca Solo'
        WHEN number BETWEEN 2 AND 8 THEN 'Marca Pequeña'
        WHEN number BETWEEN 9 AND 28 THEN 'Marca Veinte'
        WHEN number BETWEEN 29 AND 49 THEN 'Marca Veintiuno'
        ELSE 'Marca Masiva'
      END,
      'Descripción del producto ' || number,
      1000 + number,
      'unidad',
      CASE WHEN number % 10 = 0 THEN 0 ELSE 5 END,
      1,
      true
    FROM generate_series(1,122) AS number
  `, [toolsId, materialsId]);
  await pool.query(`
    INSERT INTO products(category_id,name,brand,price,unit_measure,current_stock,status)
    VALUES ($1,'Producto inactivo','Marca Masiva',999,'unidad',10,false)
  `, [toolsId]);

  process.env.DATABASE_URL = databaseUrl();
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
  process.env.LOGISTICS_QR_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/catalog/products`;

  const request = async (query = "", expected = 200) => {
    const response = await fetch(`${base}${query}`);
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload.data;
  };

  const first = await request();
  assert.deepEqual(
    { page: first.page, pageSize: first.pageSize, totalItems: first.totalItems, totalPages: first.totalPages, items: first.items.length },
    { page: 1, pageSize: 20, totalItems: 122, totalPages: 7, items: 20 },
  );
  assert.equal(first.items[0].name, "Producto 001");
  assert.equal(first.facets.categories.length, 2);
  assert.equal(first.facets.brands.length, 5);

  const last = await request("?page=7&limit=20");
  assert.deepEqual({ page: last.page, count: last.items.length }, { page: 7, count: 2 });
  const clamped = await request("?page=999&limit=20");
  assert.deepEqual({ page: clamped.page, count: clamped.items.length }, { page: 7, count: 2 });
  const hundred = await request("?page=2&limit=100");
  assert.deepEqual({ page: hundred.page, count: hundred.items.length }, { page: 2, count: 22 });

  for (const [brand, total] of [["marca solo", 1], ["marca pequeña", 7], ["marca veinte", 20], ["marca veintiuno", 21]]) {
    const result = await request(`?brand=${encodeURIComponent(brand)}`);
    assert.equal(result.totalItems, total, brand);
  }
  assert.equal((await request("?search=Producto%20021")).totalItems, 1);
  assert.equal((await request(`?categoryId=${toolsId}`)).totalItems, 61);
  assert.equal((await request("?availability=in-stock")).totalItems, 110);
  assert.equal((await request("?minPrice=1100&maxPrice=1110")).totalItems, 11);
  assert.equal((await request("?sort=price-desc")).items[0].name, "Producto 122");
  assert.equal((await request("?search=no-existe")).totalItems, 0);

  await request("?limit=30", 400);
  await request("?page=0", 400);
  await request("?sort=newest", 400);
  console.log("PASS server-side catalog pagination, filtered totals, limits, ordering, facets and safe validation");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb?.$client) await applicationDb.$client.end();
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
}

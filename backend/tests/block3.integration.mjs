// Run after npm run build against an isolated local PostgreSQL cluster only:
// BLOCK3_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/postgres node tests/block3.integration.mjs
// Optional BLOCK3_VISUAL_SERVER=1 keeps the fixtures/API on 5184 until Ctrl+C.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = new URL(process.env.BLOCK3_TEST_DATABASE_URL || "http://missing");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55438", "Use the isolated local test cluster on port 55438");
const suffix = randomBytes(4).toString("hex");
const names = [`fyf_block3_upgrade_${suffix}`, `fyf_block3_clean_${suffix}`];
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const created = [];
const pools = [];
let server, applicationDb;
const folder = await mkdtemp(path.join(tmpdir(), "fyf-block3-migrations-"));
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  await mkdir(path.join(folder, "meta"));
  const previous = journal.entries.filter((entry) => entry.idx <= 17);
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
  for (const entry of previous) await copyFile(`drizzle/${entry.tag}.sql`, path.join(folder, `${entry.tag}.sql`));
  for (const name of names) { await admin.query(`CREATE DATABASE "${name}"`); created.push(name); }
  const connection = (name) => { const target = new URL(url); target.pathname = `/${name}`; return target.href; };
  const pool = new pg.Pool({ connectionString: connection(names[0]) }); pools.push(pool);
  await migrate(drizzle(pool), { migrationsFolder: folder });
  await pool.query("INSERT INTO categories(name) VALUES ('Herramientas')");
  await pool.query("INSERT INTO products(category_id,name,price,unit_measure,current_stock) VALUES (1,'Producto anterior a 0018',1000,'unidad',10)");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  assert.deepEqual((await pool.query("SELECT brand,current_stock FROM products WHERE id=1")).rows[0], { brand: null, current_stock: 10 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("PASS migration upgrade 0017 -> 0018, existing product preserved, migration replay");
  const clean = new pg.Pool({ connectionString: connection(names[1]) }); pools.push(clean);
  await migrate(drizzle(clean), { migrationsFolder: "drizzle" });
  assert.equal((await clean.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count, String(journal.entries.length));
  console.log("PASS clean migrations 0000 -> 0018");

  process.env.DATABASE_URL = connection(names[0]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  const roles = ["CLIENT", "ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"];
  for (const role of roles) await pool.query("INSERT INTO roles(name) VALUES ($1) ON CONFLICT(name) DO NOTHING", [role]);
  const password = await bcrypt.hash("Block3-Test-2026!", 4);
  const users = [];
  for (const [index, role] of ["CLIENT", "CLIENT", "ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"].entries()) {
    const roleId = (await pool.query("SELECT id FROM roles WHERE name=$1", [role])).rows[0].id;
    const { rows } = await pool.query("INSERT INTO users(role_id,rut,names,surnames,correo,password) VALUES ($1,$2,$3,'Prueba',$4,$5) RETURNING id", [roleId, `${10000000 + index}-0`, `Persona ${index + 1}`, `block3-${index + 1}@example.test`, password]);
    users.push({ id: rows[0].id, role, roleId });
  }
  server = app.listen(process.env.BLOCK3_VISUAL_SERVER === "1" ? 5184 : 0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = (user) => jwt.sign(user, process.env.SESSION_SECRET);
  const request = async (method, route, user, body, expected = 200) => {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return data.data;
  };
  const [a, b, owner] = users;
  const productData = { categoryId: 1, name: "Árbol de prueba", price: 9000, unitMeasure: "unidad" };
  const branded = await request("POST", "/products", owner, { ...productData, brand: "  Marca   Prueba  " }, 201);
  assert.equal(branded.brand, "Marca Prueba");
  const noBrand = await request("POST", "/products", owner, { ...productData, name: "Zinc de prueba" }, 201);
  assert.equal(noBrand.brand, null);
  assert.equal((await request("PATCH", `/products/${noBrand.id}`, owner, { brand: "  " })).brand, null);
  assert.equal((await request("PATCH", `/products/${branded.id}`, owner, { brand: " Otra   Marca " })).brand, "Otra Marca");
  await request("PATCH", `/products/${branded.id}`, owner, { brand: "x".repeat(101) }, 400);
  await request("PATCH", `/products/${branded.id}`, owner, { brand: 8 }, 400);
  for (const user of users.filter((user) => user.role !== "ADMIN")) await request("PATCH", `/products/${branded.id}`, user, { brand: "No" }, 403);
  assert.equal((await request("GET", `/catalog/products/${branded.id}`)).brand, "Otra Marca");
  console.log("PASS brand create/null/edit/normalization/length/type/public DTO/ADMIN-only");

  await request("GET", "/favorites", undefined, undefined, 401);
  for (const user of users.slice(2)) await request("GET", "/favorites", user, undefined, 403);
  await request("PUT", `/favorites/${branded.id}`, a);
  await request("PUT", `/favorites/${branded.id}`, a);
  assert.equal((await request("GET", "/favorites", a)).length, 1);
  assert.equal((await request("GET", `/favorites?client_id=${a.id}`, b)).length, 0);
  await request("PUT", `/favorites/${branded.id}`, b, { client_id: a.id }, 400);
  await request("DELETE", `/favorites/${branded.id}`, b);
  assert.equal((await request("GET", "/favorites", a)).length, 1);
  await request("DELETE", `/favorites/${branded.id}`, a);
  await request("DELETE", `/favorites/${branded.id}`, a);
  await request("PUT", "/favorites/999999", a, undefined, 404);
  await request("PUT", "/favorites/NaN", a, undefined, 400);
  console.log("PASS favorites JWT role/ownership/IDOR/repeated add/repeated delete/invalid product");
  await request("PUT", `/favorites/${branded.id}`, a);
  await pool.query("UPDATE products SET status=false WHERE id=$1", [branded.id]);
  assert.equal((await request("GET", "/favorites", a)).length, 0);
  assert.equal((await pool.query("SELECT count(*) FROM client_product_favorites WHERE client_id=$1", [a.id])).rows[0].count, "1");
  await request("PUT", `/favorites/${branded.id}`, a, undefined, 404);
  await pool.query("DELETE FROM products WHERE id=$1", [branded.id]);
  assert.equal((await pool.query("SELECT count(*) FROM client_product_favorites")).rows[0].count, "0");
  assert.equal((await pool.query("SELECT current_stock FROM products WHERE id=1")).rows[0].current_stock, 10);
  assert.equal((await pool.query("SELECT count(*) FROM inventory_movements")).rows[0].count, "0");
  console.log("PASS inactive product excluded but relation retained, hard-delete cascade, stock/movements unchanged");
  if (process.env.BLOCK3_VISUAL_SERVER === "1") {
    await pool.query("INSERT INTO categories(name) VALUES ('Materiales')");
    for (let index = 0; index < 15; index++) await pool.query("INSERT INTO products(category_id,name,brand,price,unit_measure,current_stock) VALUES ($1,$2,$3,$4,'caja',$5)", [index % 2 + 1, `${index === 0 ? 'Taladro para trabajos de construcción y reparaciones en espacios reducidos' : 'Material de prueba'} ${index + 1}`, index % 3 ? "Marca Prueba" : null, (index + 1) * 1000, index % 4 ? 10 : 0]);
    console.log("VISUAL API ready on 5184. Temporary CLIENT emails block3-1@example.test / block3-2@example.test, ADMIN block3-3@example.test; password Block3-Test-2026!");
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  for (const pool of pools) await pool.end();
  for (const name of created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await rm(folder, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const adminUrl = new URL(process.env.MANAGER_STATISTICS_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(adminUrl.hostname) && adminUrl.port === "55442",
  "Use the isolated local test cluster on port 55442",
);

const databaseName = `fyf_manager_statistics_${randomBytes(4).toString("hex")}`;
const adminConnection = new pg.Client({ connectionString: adminUrl.href });
await adminConnection.connect();
let pool;
let server;
let applicationDb;

try {
  await adminConnection.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  pool = new pg.Pool({ connectionString: databaseUrl.href });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query(`
    INSERT INTO roles(name,description) VALUES
      ('CLIENT','Cliente'),('WAREHOUSE','Bodeguero'),('ADMIN','Administrador'),
      ('MANAGER','Gerente'),('CASHIER','Cajero')
    ON CONFLICT (name) DO NOTHING
  `);
  const roles = Object.fromEntries((await pool.query("SELECT id,name FROM roles")).rows.map((row) => [row.name, row.id]));
  const passwordHash = await bcrypt.hash("Manager-Statistics-2026!", 4);
  const insertUser = async (role, rut, email) => (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password,email_verified_at)
    VALUES ($1,$2,$3,'Pruebas',$4,$5,NOW()) RETURNING id,correo,rut
  `, [roles[role], rut, role, email, passwordHash])).rows[0];
  const manager = await insertUser("MANAGER", "11111111-1", "manager-statistics@example.test");
  const admin = await insertUser("ADMIN", "22222222-2", "admin-statistics@example.test");
  const cashier = await insertUser("CASHIER", "33333333-3", "cashier-statistics@example.test");
  const client = await insertUser("CLIENT", "44444444-4", "client-statistics@example.test");

  const categoryId = (await pool.query("INSERT INTO categories(name) VALUES ('Estadísticas') RETURNING id")).rows[0].id;
  const insertProduct = async (name, stock, minimum, price) => (await pool.query(`
    INSERT INTO products(category_id,name,price,unit_measure,current_stock,minimum_stock)
    VALUES ($1,$2,$3,'unidad',$4,$5) RETURNING id
  `, [categoryId, name, price, stock, minimum])).rows[0].id;
  const hammer = await insertProduct("Martillo estadístico", 2, 5, 5000);
  const drill = await insertProduct("Taladro estadístico", 12, 4, 10000);
  const bit = await insertProduct("Broca estadística", 0, 3, 4000);

  const insertSale = async (date, method, total, status, items) => {
    const saleId = (await pool.query(`
      INSERT INTO sales(user_id,date,payment_method,total,status)
      VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [cashier.id, date, method, total, status])).rows[0].id;
    for (const item of items) {
      await pool.query(`
        INSERT INTO sale_details(sale_id,product_id,quantity,returned_quantity,unit_price,subtotal)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [saleId, item.productId, item.quantity, item.returned, item.unitPrice, item.quantity * item.unitPrice]);
    }
  };
  await insertSale("2026-09-01T10:00:00", "efectivo", 10000, "ACTIVE", [
    { productId: hammer, quantity: 2, returned: 0, unitPrice: 5000 },
  ]);
  await insertSale("2026-09-02T10:00:00", "debito", 20000, "PARTIALLY_RETURNED", [
    { productId: hammer, quantity: 2, returned: 1, unitPrice: 5000 },
    { productId: drill, quantity: 1, returned: 0, unitPrice: 10000 },
  ]);
  await insertSale("2026-09-03T10:00:00", "credito", 8000, "CANCELLED", [
    { productId: bit, quantity: 2, returned: 2, unitPrice: 4000 },
  ]);

  const insertOrder = async (status, total, paidAt, key, productId, quantity, unitPrice) => {
    const orderId = (await pool.query(`
      INSERT INTO online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at,paid_at)
      VALUES ($1,$2,$3,$4,'PICKUP','2026-09-30T00:00:00',$5) RETURNING id
    `, [client.id, key, status, total, paidAt])).rows[0].id;
    await pool.query(`
      INSERT INTO online_order_items(order_id,product_id,quantity,unit_price,subtotal)
      VALUES ($1,$2,$3,$4,$5)
    `, [orderId, productId, quantity, unitPrice, quantity * unitPrice]);
  };
  await insertOrder("PAID", 15000, "2026-09-02T15:00:00", "paid-order", hammer, 3, 5000);
  await insertOrder("DELIVERED", 7000, "2026-09-03T15:00:00", "delivered-order", drill, 1, 7000);
  await insertOrder("PENDING_PAYMENT", 99000, null, "pending-order", drill, 1, 99000);
  await insertOrder("PAYMENT_FAILED", 88000, null, "failed-order", drill, 1, 88000);
  await insertOrder("CANCELLED", 77000, null, "cancelled-order", drill, 1, 77000);
  await insertOrder("PAYMENT_REVIEW", 66000, "2026-09-02T18:00:00", "review-order", drill, 1, 66000);

  process.env.DATABASE_URL = databaseUrl.href;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
  process.env.LOGISTICS_QR_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  const applicationPort = process.env.MANAGER_STATISTICS_VISUAL === "true" ? 3106 : 0;
  server = app.listen(applicationPort, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const auth = (user, role) => ({ Authorization: `Bearer ${jwt.sign({
    id: user.id,
    correo: user.correo,
    rut: user.rut,
    roleId: roles[role],
    role,
    status: "ACTIVE",
  }, process.env.SESSION_SECRET)}` });
  const path = "/reports/manager-statistics?from=2026-09-01&to=2026-09-03";

  assert.equal((await fetch(base + path)).status, 401);
  assert.equal((await fetch(base + path, { headers: auth(admin, "ADMIN") })).status, 403);
  assert.equal((await fetch(base + path, { headers: auth(cashier, "CASHIER") })).status, 403);
  const response = await fetch(base + path, { headers: auth(manager, "MANAGER") });
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.deepEqual(data.kpis, {
    netSales: 47000,
    originalSales: 60000,
    returnedAmount: 13000,
    returnPercentage: 21.67,
    transactions: 5,
    averageTicket: 9400,
    unitsSold: 8,
    productsSold: 2,
  });
  assert.equal(data.channels.find((item) => item.channel === "ONLINE").amount, 22000);
  assert.equal(data.topProducts[0].productName, "Martillo estadístico");
  assert.equal(data.lowStock.count, 2);
  assert.deepEqual(data.lowStock.products.map((product) => product.name), ["Broca estadística", "Martillo estadístico"]);

  assert.equal((await fetch(`${base}/reports/manager-statistics?from=2026-09-04&to=2026-09-03`, { headers: auth(manager, "MANAGER") })).status, 400);
  assert.equal((await fetch(`${base}/reports/manager-statistics?from=2025-01-01&to=2026-09-03`, { headers: auth(manager, "MANAGER") })).status, 400);
  console.log("PASS endpoint estadísticas exclusivo MANAGER y cálculos sobre PostgreSQL aislado");

  if (process.env.MANAGER_STATISTICS_VISUAL === "true") {
    console.log(JSON.stringify({
      url: base,
      manager: manager.correo,
      password: "Manager-Statistics-2026!",
    }));
    console.log("Servidor visual temporal activo. Presione Ctrl+C para retirarlo.");
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  if (pool) await pool.end();
  await adminConnection.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminConnection.end();
}

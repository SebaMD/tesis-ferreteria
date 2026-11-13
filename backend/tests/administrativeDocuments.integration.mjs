// Solo un clúster descartable creado expresamente para esta suite. Nunca usa la BD normal.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const root = new URL(process.env.ADMIN_DOCUMENTS_TEST_DATABASE_URL || "http://missing");
assert.equal(root.protocol, "postgresql:");
assert.equal(root.hostname, "127.0.0.1");
assert.equal(root.port, "55446");
const admin = new pg.Client({ connectionString: root.href });
await admin.connect();
const directory = (await admin.query("SHOW data_directory")).rows[0].data_directory.replaceAll("\\", "/");
assert.match(directory, /\/fyf-admin-docs-audit-[a-f0-9]+\/data$/);
const name = `fyf_admin_documents_${randomBytes(6).toString("hex")}`;
let created = false, pool, server, applicationDb;
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const target = new URL(root); target.pathname = `/${name}`;
  pool = new pg.Pool({ connectionString: target.href });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query("INSERT INTO roles(name) VALUES ('ADMIN'),('MANAGER'),('CASHIER'),('WAREHOUSE'),('CLIENT') ON CONFLICT DO NOTHING");
  const roles = Object.fromEntries((await pool.query("SELECT id,name FROM roles")).rows.map(r => [r.name, r.id]));
  const users = {};
  for (const [i, role] of Object.keys(roles).entries()) users[role] = (await pool.query(
    "INSERT INTO users(role_id,rut,names,surnames,correo,password,email_verified_at,phone) VALUES ($1,$2,$3,'Prueba',$4,'unused',NOW(),'+56911111111') RETURNING id",
    [roles[role], `${10000000 + i}-1`, role, `${role.toLowerCase()}@example.test`])).rows[0].id;
  const category = (await pool.query("INSERT INTO categories(name) VALUES ('Documentos de prueba') RETURNING id")).rows[0].id;
  const product = (await pool.query("INSERT INTO products(category_id,name,price,unit_measure,current_stock) VALUES ($1,'Producto Ñandú',99999,'unidad',30) RETURNING id", [category])).rows[0].id;
  const promotion = (await pool.query("INSERT INTO promotions(name,type,percentage) VALUES ('Histórica','PERCENTAGE_DISCOUNT',20) RETURNING id")).rows[0].id;
  const sale = (await pool.query("INSERT INTO sales(user_id,payment_method,total,status) VALUES ($1,'efectivo',3000,'PARTIALLY_RETURNED') RETURNING id", [users.CASHIER])).rows[0].id;
  await pool.query("INSERT INTO sale_details(sale_id,product_id,quantity,returned_quantity,unit_price,subtotal) VALUES ($1,$2,3,1,1000,3000)", [sale, product]);
  const request = (await pool.query("INSERT INTO sale_cancellation_requests(sale_id,requested_by,reviewed_by,reason,status,reviewed_at) VALUES ($1,$2,$3,'Producto devuelto','APPROVED',NOW()) RETURNING id", [sale, users.CASHIER, users.ADMIN])).rows[0].id;
  await pool.query("INSERT INTO sale_cancellation_request_items(request_id,product_id,requested_quantity) VALUES ($1,$2,1)", [request, product]);
  const orders = {};
  for (const status of ["PAID", "DELIVERED", "PENDING_PAYMENT", "PAYMENT_REVIEW"]) {
    const isGuest = status === "DELIVERED";
    const id = (await pool.query(`INSERT INTO online_orders(client_id,guest_name,guest_email,guest_phone,guest_session_hash,
      checkout_key,status,total,delivery_type,reservation_expires_at,paid_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,2000,'PICKUP',NOW()+INTERVAL '20 minutes',$8) RETURNING id`,
    [isGuest ? null : users.CLIENT, isGuest ? "Persona Invitada" : null, isGuest ? "guest@example.test" : null,
      isGuest ? "+56922222222" : null, isGuest ? randomBytes(32).toString("hex") : null,
      randomBytes(16).toString("hex"), status, status === "PENDING_PAYMENT" ? null : new Date()])).rows[0].id;
    orders[status] = id;
    await pool.query(`INSERT INTO online_order_items(order_id,product_id,quantity,unit_price,subtotal,discount_amount,
      promotion_id,promotion_type_snapshot,promotion_name_snapshot,promotion_value_snapshot)
      VALUES ($1,$2,2,1250,2000,500,$3,'PERCENTAGE_DISCOUNT','Histórica',20)`, [id, product, promotion]);
    await pool.query("INSERT INTO online_payments(order_id,buy_order,session_id,token,amount,status,authorization_code) VALUES ($1,$2,'SECRET-SESSION',$3,2000,'AUTHORIZED','654321')", [id, `OK-${id}`, `SECRET-TOKEN-${id}`]);
    // Un intento fallido más reciente nunca debe aparecer en la ficha.
    await pool.query("INSERT INTO online_payments(order_id,buy_order,session_id,amount,status) VALUES ($1,$2,'SECRET-FAILED',2000,'FAILED')", [id, `FAILED-${id}`]);
  }
  const before = (await pool.query("SELECT current_stock FROM products WHERE id=$1", [product])).rows[0].current_stock;
  const movementsBefore = Number((await pool.query("SELECT count(*) FROM inventory_movements")).rows[0].count);
  process.env.DATABASE_URL = target.href;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const get = (path, role) => fetch(url + path, { headers: role ? { Authorization: `Bearer ${jwt.sign({ id: users[role], authVersion: 1 }, process.env.SESSION_SECRET)}` } : {} });
  for (const role of ["ADMIN", "MANAGER", "CASHIER"]) {
    const response = await get(`/sales/${sale}/summary`, role);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  }
  for (const role of ["WAREHOUSE", "CLIENT", undefined]) assert.equal((await get(`/sales/${sale}/summary`, role)).status, role ? 403 : 401);
  assert.equal((await get("/sales/not-an-id/summary", "ADMIN")).status, 400);
  assert.equal((await get("/sales/999999/summary", "ADMIN")).status, 404);
  for (const role of ["ADMIN", "MANAGER"]) {
    for (const [status, id] of Object.entries(orders)) {
      const response = await get(`/order-logistics/online/${id}/administrative-summary`, role);
      assert.equal(response.status, 200);
      const data = (await response.json()).data;
      assert.equal(data.paymentConfirmed, ["PAID", "DELIVERED"].includes(status));
      assert.equal(data.items[0].unitPrice, "1250.00");
      assert.equal(data.items[0].discountAmount, "500.00");
      assert.equal(data.buyer.type, status === "DELIVERED" ? "GUEST" : "CLIENT");
      assert.ok(data.buyer.phone);
      assert.equal(data.authorizedPayment?.buyOrder ?? null, data.paymentConfirmed ? `OK-${id}` : null);
      assert.doesNotMatch(JSON.stringify(data), /SECRET|FAILED-|guestSessionHash|guestDeviceHash|sessionId|redirectUrl/);
    }
  }
  for (const role of ["WAREHOUSE", "CASHIER", "CLIENT", undefined]) assert.equal((await get(`/order-logistics/online/${orders.PAID}/administrative-summary`, role)).status, role ? 403 : 401);
  for (const id of ["invalid", "999999"]) assert.equal((await get(`/order-logistics/online/${id}/administrative-summary`, "ADMIN")).status, id === "invalid" ? 400 : 404);
  const warehouse = await get(`/order-logistics/online/${orders.PAID}`, "WAREHOUSE");
  assert.equal(warehouse.status, 200);
  assert.doesNotMatch(JSON.stringify(await warehouse.json()), /654321|buyOrder|authorizationCode|SECRET/);
  assert.equal((await pool.query("SELECT current_stock FROM products WHERE id=$1", [product])).rows[0].current_stock, before);
  assert.equal(Number((await pool.query("SELECT count(*) FROM inventory_movements")).rows[0].count), movementsBefore);
  assert.equal((await pool.query("SELECT returned_quantity FROM sale_details WHERE sale_id=$1", [sale])).rows[0].returned_quantity, 1);
  console.log("PASS integración aislada: PDF, ADMIN/MANAGER, roles rechazados, pago pendiente/revisión, snapshots, privacidad y ausencia de escrituras de stock/devoluciones");
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}

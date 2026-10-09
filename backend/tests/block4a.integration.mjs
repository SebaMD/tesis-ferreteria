// Run after npm run build against an isolated local PostgreSQL cluster only:
// BLOCK4A_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres node tests/block4a.integration.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const adminUrl = new URL(process.env.BLOCK4A_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(adminUrl.hostname) && adminUrl.port === "55439",
  "Use the isolated local test cluster on port 55439",
);
const databaseName = `fyf_block4a_${randomBytes(4).toString("hex")}`;
const visualMode = process.env.BLOCK4A_VISUAL_SERVER === "1";
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
let pool;
let server;
let applicationDb;
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  pool = new pg.Pool({ connectionString: databaseUrl.href });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });

  const roleId = (await pool.query("SELECT id FROM roles WHERE name = 'CLIENT'")).rows[0].id;
  const passwordHash = await bcrypt.hash("Block4A-Test-2026!", 4);
  const userRows = (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES
      ($1,'11111111-1','Clienta Ángela','Propietaria','angela@example.test',$2),
      ($1,'22222222-2','Cliente Bruno','Ajeno','bruno@example.test',$2)
    RETURNING id,correo
  `, [roleId, passwordHash])).rows;
  const [clientA, clientB] = userRows;
  const categoryId = (await pool.query("INSERT INTO categories(name) VALUES ('Herramientas') RETURNING id")).rows[0].id;
  const productId = (await pool.query(`
    INSERT INTO products(category_id,name,price,unit_measure,current_stock)
    VALUES ($1,'Taladro inalámbrico Ñandú',12990,'unidad',10)
    RETURNING id
  `, [categoryId])).rows[0].id;

  const guestDeviceA = randomBytes(32).toString("base64url");
  const guestDeviceB = randomBytes(32).toString("base64url");
  const guestDeviceHashA = createHash("sha256").update(guestDeviceA).digest("hex");
  const guestDeviceHashB = createHash("sha256").update(guestDeviceB).digest("hex");
  const guestSessionHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 20 * 60_000);

  const insertOrder = async ({ clientId = null, status, guest = null }) => {
    const result = await pool.query(`
      INSERT INTO online_orders(
        client_id,guest_name,guest_email,guest_phone,guest_session_hash,guest_device_hash,
        checkout_key,status,total,delivery_type,reservation_expires_at,paid_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,25980,'PICKUP',$9,$10)
      RETURNING id
    `, [
      clientId,
      guest?.name ?? null,
      guest?.email ?? null,
      guest?.phone ?? null,
      guest?.sessionHash ?? null,
      guest?.deviceHash ?? null,
      randomBytes(16).toString("hex"),
      status,
      expires,
      status === "PAID" ? now : null,
    ]);
    const orderId = result.rows[0].id;
    await pool.query(`
      INSERT INTO online_order_items(order_id,product_id,quantity,unit_price,subtotal)
      VALUES ($1,$2,2,12990,25980)
    `, [orderId, productId]);
    return orderId;
  };

  const clientAOrder = await insertOrder({ clientId: clientA.id, status: "PAID" });
  const clientBOrder = await insertOrder({ clientId: clientB.id, status: "PAID" });
  const clientFailedOrder = await insertOrder({ clientId: clientA.id, status: "PAYMENT_FAILED" });
  const guestAOrder = await insertOrder({
    status: "PAID",
    guest: { name: "Invitada Alicia", email: "alicia@example.test", phone: "+56911111111", sessionHash: guestSessionHash, deviceHash: guestDeviceHashA },
  });
  const guestBOrder = await insertOrder({
    status: "PAID",
    guest: { name: "Invitado Benjamín", email: "benjamin@example.test", phone: "+56922222222", sessionHash: createHash("sha256").update(randomBytes(32)).digest("hex"), deviceHash: guestDeviceHashB },
  });
  const visualGuestOrder = await insertOrder({
    status: "PAID",
    guest: { name: "Invitada Visual", email: "visual@example.test", phone: "+56933333333", sessionHash: createHash("sha256").update(randomBytes(32)).digest("hex"), deviceHash: null },
  });

  const guestTokenA = randomBytes(32).toString("base64url");
  await pool.query(`
    INSERT INTO guest_order_access_tokens(order_id,token_hash,expires_at)
    VALUES ($1,$2,$3)
  `, [guestAOrder, createHash("sha256").update(guestTokenA).digest("hex"), new Date(now.getTime() + 90 * 86_400_000)]);
  const visualGuestToken = randomBytes(32).toString("base64url");
  await pool.query(`
    INSERT INTO guest_order_access_tokens(order_id,token_hash,expires_at)
    VALUES ($1,$2,$3)
  `, [visualGuestOrder, createHash("sha256").update(visualGuestToken).digest("hex"), new Date(now.getTime() + 90 * 86_400_000)]);

  process.env.DATABASE_URL = databaseUrl.href;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(visualMode ? 3000 : 0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const auth = (user) => `Bearer ${jwt.sign({
    id: user.id,
    correo: user.correo,
    rut: "test",
    roleId,
    role: "CLIENT",
    status: "ACTIVE",
  }, process.env.SESSION_SECRET)}`;
  const clientAToken = auth(clientA).slice("Bearer ".length);

  const request = (path, options = {}) => fetch(base + path, options);
  const assertPdf = async (response, orderId) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-disposition"), new RegExp(`comprobante-P-${String(orderId).padStart(6, "0")}\\.pdf`));
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  };

  await assertPdf(await request(`/online-orders/${clientAOrder}/receipt`, { headers: { Authorization: auth(clientA) } }), clientAOrder);
  assert.equal((await request(`/online-orders/${clientBOrder}/receipt`, { headers: { Authorization: auth(clientA) } })).status, 404);
  assert.equal((await request(`/online-orders/${clientFailedOrder}/receipt`, { headers: { Authorization: auth(clientA) } })).status, 409);
  assert.equal((await request(`/online-orders/${clientAOrder}/receipt`)).status, 401);
  console.log("PASS PDF CLIENT propio/ajeno/sin sesión y pedido no pagado");

  assert.equal((await request(`/online-orders/${clientFailedOrder}/archive`, {
    method: "PATCH",
    headers: { Authorization: auth(clientA) },
  })).status, 200);
  const hiddenOrders = (await (await request("/online-orders", { headers: { Authorization: auth(clientA) } })).json()).data;
  assert.equal(hiddenOrders.some((order) => order.id === clientFailedOrder), false);
  assert.equal((await request(`/online-orders/${clientFailedOrder}/restore`, {
    method: "PATCH",
    headers: { Authorization: auth(clientB) },
  })).status, 404);
  assert.equal((await request(`/online-orders/${clientFailedOrder}/restore`, {
    method: "PATCH",
    headers: { Authorization: auth(clientA) },
  })).status, 200);
  const restoredOrders = (await (await request("/online-orders", { headers: { Authorization: auth(clientA) } })).json()).data;
  assert.equal(restoredOrders.some((order) => order.id === clientFailedOrder), true);
  assert.equal((await request(`/online-orders/${clientFailedOrder}/restore`, {
    method: "PATCH",
    headers: { Authorization: auth(clientA) },
  })).status, 404);
  console.log("PASS ocultar/restaurar persistente, propietario y acción única");

  await assertPdf(await request("/online-orders/guest/order/receipt", { headers: { "X-Guest-Order-Token": guestTokenA } }), guestAOrder);
  assert.equal((await request("/online-orders/guest/order/receipt", { headers: { "X-Guest-Order-Token": randomBytes(32).toString("base64url") } })).status, 404);
  assert.equal((await request(`/online-orders/guest/order/receipt?folio=P-${guestAOrder}`)).status, 400);
  assert.equal((await request(`/online-orders/guest/order/receipt?email=alicia@example.test`)).status, 400);
  const tokenAIgnoringForeignId = await request(`/online-orders/guest/order/receipt?orderId=${guestBOrder}`, { headers: { "X-Guest-Order-Token": guestTokenA } });
  await assertPdf(tokenAIgnoringForeignId, guestAOrder);
  console.log("PASS token guest válido/inválido; folio/email/orderId no autorizan ni seleccionan otro pedido");

  await assertPdf(await request(`/online-orders/guest/device-orders/${guestAOrder}/receipt`, { headers: { Cookie: `fyf_guest_device=${guestDeviceA}` } }), guestAOrder);
  assert.equal((await request(`/online-orders/guest/device-orders/${guestBOrder}/receipt`, { headers: { Cookie: `fyf_guest_device=${guestDeviceA}` } })).status, 404);
  assert.equal((await request(`/online-orders/guest/device-orders/${guestAOrder}/receipt`)).status, 404);
  console.log("PASS cookie HttpOnly de dispositivo limita la descarga a sus propios pedidos");
  if (visualMode) {
    console.log(`VISUAL API http://127.0.0.1:3000 CLIENT_EMAIL=angela@example.test CLIENT_PASSWORD=Block4A-Test-2026! CLIENT_TOKEN=${clientAToken} CLIENT_ORDER=${clientAOrder} GUEST_TOKEN=${visualGuestToken}`);
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
}

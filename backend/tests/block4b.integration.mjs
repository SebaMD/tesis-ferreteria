// Run after npm run build against the isolated PostgreSQL cluster on port 55440:
// BLOCK4B_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55440/postgres node tests/block4b.integration.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const adminUrl = new URL(process.env.BLOCK4B_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(adminUrl.hostname) && adminUrl.port === "55440",
  "Use the isolated local test cluster on port 55440",
);

const databaseName = `fyf_block4b_${randomBytes(4).toString("hex")}`;
const uploadsRoot = resolve("tmp", "block4b-uploads", databaseName);
const visualMode = process.env.BLOCK4B_VISUAL_SERVER === "1";
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
  for (const role of ["CLIENT", "WAREHOUSE", "ADMIN", "MANAGER", "CASHIER"]) assert.ok(roles[role]);

  const passwordHash = await bcrypt.hash("Block4B-Test-2026!", 4);
  const insertUser = async (role, rut, names, correo) => (await pool.query(`
    INSERT INTO users(role_id,rut,names,surnames,correo,password)
    VALUES ($1,$2,$3,'Pruebas',$4,$5)
    RETURNING id,correo,rut
  `, [roles[role], rut, names, correo, passwordHash])).rows[0];

  const warehouseA = await insertUser("WAREHOUSE", "11111111-1", "Bodeguera Alicia", "warehouse-a@example.test");
  const warehouseB = await insertUser("WAREHOUSE", "22222222-2", "Bodeguero Bruno", "warehouse-b@example.test");
  const adminUser = await insertUser("ADMIN", "33333333-3", "Administradora Ana", "admin@example.test");
  const managerUser = await insertUser("MANAGER", "44444444-4", "Gerente Gabriel", "manager@example.test");
  const cashier = await insertUser("CASHIER", "55555555-5", "Cajera Carla", "cashier@example.test");
  const clientA = await insertUser("CLIENT", "66666666-6", "Clienta Cecilia", "client-a@example.test");
  const clientB = await insertUser("CLIENT", "77777777-7", "Cliente Diego", "client-b@example.test");

  const categoryId = (await pool.query("INSERT INTO categories(name) VALUES ('Privacidad logística') RETURNING id")).rows[0].id;
  const productId = (await pool.query(`
    INSERT INTO products(category_id,name,price,unit_measure,current_stock)
    VALUES ($1,'Taladro Ñandú de prueba',12990,'unidad',100)
    RETURNING id
  `, [categoryId])).rows[0].id;
  if (visualMode) {
    await pool.query(`
      INSERT INTO products(category_id,name,price,unit_measure,current_stock)
      SELECT $1, 'Producto visual ' || value, 1000 + value * 125, 'unidad', 15
      FROM generate_series(1,35) AS value
    `, [categoryId]);
  }

  const guestDeviceA = randomBytes(32).toString("base64url");
  const guestDeviceB = randomBytes(32).toString("base64url");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const expires = new Date(Date.now() + 20 * 60_000);
  const now = new Date();

  const insertOrder = async ({
    clientId = null,
    status = "PAID",
    deliveryType = "DELIVERY",
    preparationStartedBy = null,
    deliveryStartedBy = null,
    guestDeviceHash = null,
    imagePath = null,
    address = "Pasaje Confidencial 742",
  } = {}) => {
    const guest = clientId === null;
    const result = await pool.query(`
      INSERT INTO online_orders(
        client_id,guest_name,guest_email,guest_phone,guest_session_hash,guest_device_hash,
        checkout_key,status,total,delivery_type,delivery_recipient_name,delivery_phone,
        delivery_address,delivery_commune,delivery_reference,delivery_latitude,delivery_longitude,
        reservation_expires_at,paid_at,preparation_started_by,preparation_started_at,
        delivery_started_by,delivery_started_at,delivered_by,delivered_at,
        received_by_name,received_by_rut,delivery_proof_image_path
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,12990,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
      ) RETURNING id
    `, [
      clientId,
      guest ? "Invitada Gabriela" : null,
      guest ? "guest-private@example.test" : null,
      guest ? "+56911112222" : null,
      guest ? hash(randomBytes(32)) : null,
      guest ? guestDeviceHash : null,
      randomBytes(16).toString("hex"),
      status,
      deliveryType,
      deliveryType === "DELIVERY" ? "Receptora Reservada" : null,
      deliveryType === "DELIVERY" ? "+56987654321" : null,
      deliveryType === "DELIVERY" ? address : null,
      deliveryType === "DELIVERY" ? "Santa Juana" : null,
      deliveryType === "DELIVERY" ? "Portón privado" : null,
      deliveryType === "DELIVERY" ? -37.17 : null,
      deliveryType === "DELIVERY" ? -72.94 : null,
      expires,
      now,
      preparationStartedBy,
      preparationStartedBy ? now : null,
      deliveryStartedBy,
      deliveryStartedBy ? now : null,
      status === "DELIVERED" ? (deliveryStartedBy || warehouseB.id) : null,
      status === "DELIVERED" ? now : null,
      status === "DELIVERED" ? "Persona Receptora" : null,
      status === "DELIVERED" ? "88888888-8" : null,
      imagePath,
    ]);
    const orderId = result.rows[0].id;
    await pool.query(`
      INSERT INTO online_order_items(order_id,product_id,quantity,unit_price,subtotal)
      VALUES ($1,$2,1,12990,12990)
    `, [orderId, productId]);
    return orderId;
  };

  const paidOrder = await insertOrder({ clientId: clientA.id });
  await insertOrder({ clientId: clientA.id, status: "PAYMENT_FAILED", deliveryType: "PICKUP" });
  const preparingOrder = await insertOrder({ clientId: clientA.id, status: "PREPARING", preparationStartedBy: warehouseA.id });
  const readyOrder = await insertOrder({ clientId: clientA.id, status: "READY_FOR_DELIVERY", preparationStartedBy: warehouseA.id });
  const outOrder = await insertOrder({ clientId: clientA.id, status: "OUT_FOR_DELIVERY", preparationStartedBy: warehouseA.id, deliveryStartedBy: warehouseB.id });

  const proofRelative = (id) => `deliveries/online/${id}/evidence.png`;
  const deliveredClientA = await insertOrder({ clientId: clientA.id, status: "DELIVERED", deliveryStartedBy: warehouseB.id });
  const deliveredClientB = await insertOrder({ clientId: clientB.id, status: "DELIVERED", deliveryStartedBy: warehouseB.id });
  const guestDeliveredA = await insertOrder({ status: "DELIVERED", deliveryStartedBy: warehouseB.id, guestDeviceHash: hash(guestDeviceA) });
  const guestDeliveredB = await insertOrder({ status: "DELIVERED", deliveryStartedBy: warehouseB.id, guestDeviceHash: hash(guestDeviceB) });
  const pickupDelivered = await insertOrder({ clientId: clientA.id, status: "DELIVERED", deliveryType: "PICKUP" });
  const nonDeliveredWithPath = await insertOrder({ clientId: clientA.id, status: "READY_FOR_DELIVERY" });
  const manipulatedPathOrder = await insertOrder({ clientId: clientA.id, status: "DELIVERED", deliveryStartedBy: warehouseB.id });
  const missingFileOrder = await insertOrder({ clientId: clientA.id, status: "DELIVERED", deliveryStartedBy: warehouseB.id });
  const invalidMimeOrder = await insertOrder({ clientId: clientA.id, status: "DELIVERED", deliveryStartedBy: warehouseB.id });

  const imageOrders = [deliveredClientA, deliveredClientB, guestDeliveredA, guestDeliveredB, nonDeliveredWithPath];
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  for (const orderId of imageOrders) {
    const relative = proofRelative(orderId);
    const absolute = resolve(uploadsRoot, ...relative.split("/"));
    await mkdir(resolve(absolute, ".."), { recursive: true });
    await writeFile(absolute, tinyPng);
    await pool.query("UPDATE online_orders SET delivery_proof_image_path=$1 WHERE id=$2", [relative, orderId]);
  }
  await pool.query(
    "UPDATE online_orders SET delivery_proof_image_path=$1 WHERE id=$2",
    [`deliveries/online/${manipulatedPathOrder}/../${deliveredClientA}/evidence.png`, manipulatedPathOrder],
  );
  await pool.query(
    "UPDATE online_orders SET delivery_proof_image_path=$1 WHERE id=$2",
    [proofRelative(missingFileOrder), missingFileOrder],
  );
  await pool.query(
    "UPDATE online_orders SET delivery_proof_image_path=$1 WHERE id=$2",
    [`deliveries/online/${invalidMimeOrder}/evidence.txt`, invalidMimeOrder],
  );

  const guestTokenA = randomBytes(32).toString("base64url");
  const guestTokenB = randomBytes(32).toString("base64url");
  await pool.query(`
    INSERT INTO guest_order_access_tokens(order_id,token_hash,expires_at)
    VALUES ($1,$2,$5),($3,$4,$5)
  `, [guestDeliveredA, hash(guestTokenA), guestDeliveredB, hash(guestTokenB), new Date(Date.now() + 90 * 86_400_000)]);

  const saleId = (await pool.query(`
    INSERT INTO sales(user_id,payment_method,total) VALUES ($1,'CASH',12990) RETURNING id
  `, [cashier.id])).rows[0].id;
  await pool.query(`INSERT INTO sale_details(sale_id,product_id,quantity,unit_price,subtotal) VALUES ($1,$2,1,12990,12990)`, [saleId, productId]);
  await pool.query(`
    INSERT INTO sale_deliveries(sale_id,status,recipient_name,recipient_rut,phone,address,commune,reference)
    VALUES ($1,'PAID','Cliente POS Privado','99999999-9','+56999999999','Calle POS Privada 99','Santa Juana','Referencia POS')
  `, [saleId]);

  process.env.DATABASE_URL = databaseUrl.href;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.UPLOADS_ROOT = uploadsRoot;
  process.env.MAIL_ENABLED = "false";
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(visualMode ? 3000 : 0, "127.0.0.1");
  await new Promise((resolveListening) => server.once("listening", resolveListening));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const bearer = (user, role) => `Bearer ${jwt.sign({
    id: user.id,
    correo: user.correo,
    rut: user.rut,
    roleId: roles[role],
    role,
    status: "ACTIVE",
  }, process.env.SESSION_SECRET)}`;
  const authHeaders = {
    warehouseA: { Authorization: bearer(warehouseA, "WAREHOUSE") },
    warehouseB: { Authorization: bearer(warehouseB, "WAREHOUSE") },
    admin: { Authorization: bearer(adminUser, "ADMIN") },
    manager: { Authorization: bearer(managerUser, "MANAGER") },
    clientA: { Authorization: bearer(clientA, "CLIENT") },
    clientB: { Authorization: bearer(clientB, "CLIENT") },
  };
  const request = (path, options = {}) => fetch(base + path, options);
  const jsonData = async (response) => (await response.json()).data;

  const warehouseList = await jsonData(await request("/order-logistics", { headers: authHeaders.warehouseA }));
  assert.ok(warehouseList.length >= 5);
  for (const item of warehouseList) {
    for (const field of ["customerEmail", "customerPhone", "customerRut", "deliveryAddress", "deliveryPhone", "deliveryReference"]) {
      assert.equal(Object.hasOwn(item, field), false, `${field} no debe filtrarse en listado WAREHOUSE`);
    }
  }
  assert.equal((await jsonData(await request("/order-logistics?search=client-a%40example.test", { headers: authHeaders.warehouseA }))).length, 0);
  assert.ok((await jsonData(await request("/order-logistics?search=client-a%40example.test", { headers: authHeaders.admin }))).length > 0);
  assert.equal((await jsonData(await request("/order-logistics?search=Calle%20POS%20Privada", { headers: authHeaders.warehouseA }))).length, 0);
  assert.ok((await jsonData(await request("/order-logistics?search=Calle%20POS%20Privada", { headers: authHeaders.manager }))).length > 0);

  const mineA = await jsonData(await request("/order-logistics?scope=MINE", { headers: authHeaders.warehouseA }));
  const mineB = await jsonData(await request("/order-logistics?scope=MINE", { headers: authHeaders.warehouseB }));
  assert.ok(mineA.some((item) => item.id === preparingOrder && item.origin === "ONLINE"));
  for (const item of mineA) {
    assert.equal(Object.hasOwn(item, "deliveryAddress"), false);
    assert.equal(Object.hasOwn(item, "deliveryPhone"), false);
  }
  const assignedMine = mineB.find((item) => item.id === outOrder && item.origin === "ONLINE");
  assert.equal(assignedMine?.deliveryAddress, "Pasaje Confidencial 742");
  assert.equal(assignedMine?.deliveryPhone, "+56987654321");

  const paidWarehouseView = await jsonData(await request(`/order-logistics/online/${paidOrder}`, { headers: authHeaders.warehouseA }));
  assert.equal(Object.hasOwn(paidWarehouseView, "deliveryAddress"), false);
  assert.deepEqual(paidWarehouseView.availableDocuments, ["PREPARATION_LABEL"]);
  const readyWarehouseView = await jsonData(await request(`/order-logistics/online/${readyOrder}`, { headers: authHeaders.warehouseA }));
  assert.equal(Object.hasOwn(readyWarehouseView, "deliveryAddress"), false);
  const assignedView = await jsonData(await request(`/order-logistics/online/${outOrder}`, { headers: authHeaders.warehouseB }));
  assert.equal(assignedView.deliveryAddress, "Pasaje Confidencial 742");
  assert.equal(assignedView.deliveryPhone, "+56987654321");
  const unassignedView = await jsonData(await request(`/order-logistics/online/${outOrder}`, { headers: authHeaders.warehouseA }));
  assert.equal(Object.hasOwn(unassignedView, "deliveryAddress"), false);
  assert.equal(Object.hasOwn(unassignedView, "deliveryPhone"), false);
  for (const headers of [authHeaders.admin, authHeaders.manager]) {
    const view = await jsonData(await request(`/order-logistics/online/${readyOrder}`, { headers }));
    assert.equal(view.deliveryAddress, "Pasaje Confidencial 742");
    assert.equal(view.customerEmail, "client-a@example.test");
  }
  console.log("PASS privacidad en list/detail/search para WAREHOUSE, ADMIN y MANAGER, incluyendo venta POS");

  const assertPdf = async (response, filenamePattern) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-disposition"), filenamePattern);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  };

  await assertPdf(
    await request(`/order-logistics/online/${paidOrder}/preparation-label`, { headers: authHeaders.warehouseA }),
    /etiqueta-preparacion-P-/,
  );
  await assertPdf(
    await request(`/order-logistics/online/${preparingOrder}/preparation-label`, { headers: authHeaders.warehouseA }),
    /etiqueta-preparacion-P-/,
  );
  assert.equal((await request(`/order-logistics/online/${preparingOrder}/preparation-label`, { headers: authHeaders.warehouseB })).status, 403);
  await assertPdf(
    await request(`/order-logistics/online/${outOrder}/dispatch-label`, { headers: authHeaders.warehouseB }),
    /etiqueta-despacho-P-/,
  );
  assert.equal((await request(`/order-logistics/online/${outOrder}/dispatch-label`, { headers: authHeaders.warehouseA })).status, 403);
  await assertPdf(await request(`/order-logistics/online/${outOrder}/dispatch-label`, { headers: authHeaders.admin }), /etiqueta-despacho-P-/);
  await assertPdf(await request(`/order-logistics/online/${outOrder}/dispatch-label`, { headers: authHeaders.manager }), /etiqueta-despacho-P-/);
  console.log("PASS autorización de etiquetas de preparación y despacho");

  const assertImage = async (response) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  };

  await assertImage(await request(`/online-orders/${deliveredClientA}/delivery-proof`, { headers: authHeaders.clientA }));
  assert.equal((await request(`/online-orders/${deliveredClientB}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  await assertImage(await request(`/online-orders/${deliveredClientB}/delivery-proof`, { headers: authHeaders.clientB }));
  await assertImage(await request("/online-orders/guest/order/delivery-proof", { headers: { "X-Guest-Order-Token": guestTokenA } }));
  assert.equal((await request("/online-orders/guest/order/delivery-proof", { headers: { "X-Guest-Order-Token": randomBytes(32).toString("base64url") } })).status, 404);
  await assertImage(await request(`/online-orders/guest/device-orders/${guestDeliveredA}/delivery-proof`, { headers: { Cookie: `fyf_guest_device=${guestDeviceA}` } }));
  assert.equal((await request(`/online-orders/guest/device-orders/${guestDeliveredB}/delivery-proof`, { headers: { Cookie: `fyf_guest_device=${guestDeviceA}` } })).status, 404);
  assert.equal((await request(`/online-orders/${pickupDelivered}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  assert.equal((await request(`/online-orders/${nonDeliveredWithPath}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  assert.equal((await request(`/online-orders/${manipulatedPathOrder}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  assert.equal((await request(`/online-orders/${missingFileOrder}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  assert.equal((await request(`/online-orders/${invalidMimeOrder}/delivery-proof`, { headers: authHeaders.clientA })).status, 404);
  assert.equal((await request(`/uploads/deliveries/online/${deliveredClientA}/evidence.png`)).status, 404);
  await assertImage(await request(`/order-logistics/online/${deliveredClientA}/delivery-proof`, { headers: authHeaders.admin }));
  await assertImage(await request(`/order-logistics/online/${deliveredClientA}/delivery-proof`, { headers: authHeaders.manager }));
  assert.equal((await request(`/order-logistics/online/${deliveredClientA}/delivery-proof`, { headers: authHeaders.warehouseB })).status, 403);
  console.log("PASS evidencia CLIENT/guest/dispositivo, estados, path traversal y almacenamiento privado");

  if (visualMode) {
    console.log(`VISUAL API http://127.0.0.1:3000 CLIENT=${clientA.correo} WAREHOUSE=${warehouseB.correo} ADMIN=${adminUser.correo} PASSWORD=Block4B-Test-2026! GUEST_TOKEN=${guestTokenA} GUEST_DEVICE=${guestDeviceA}`);
    await new Promise((resolveSignal) => {
      process.once("SIGINT", resolveSignal);
      process.once("SIGTERM", resolveSignal);
    });
  }
} finally {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  if (applicationDb) await applicationDb.$client.end();
  if (pool) await pool.end();
  await adminConnection.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminConnection.end();
  await rm(uploadsRoot, { recursive: true, force: true });
}

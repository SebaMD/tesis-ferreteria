import assert from "node:assert/strict";
import { initializeTestDelivery, acceptTestQuote } from "./helpers/deliveryQuote.mjs";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const root = new URL(process.env.FAMILY_TEST_DATABASE_URL || "http://missing");
assert.equal(root.hostname, "127.0.0.1"); assert.equal(root.port, "55444");
const admin = new pg.Client({ connectionString: root.href });
const name = `fyf_seed_demo_${randomBytes(8).toString("hex")}`;
const oldMigrations = await mkdtemp(path.join(tmpdir(), "fyf-families-migrations-"));
let pool, server, applicationDb, created = false;
await admin.connect();
try {
  assert.match((await admin.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/"), /\/fyf-seed-audit-[a-f0-9]+\/data$/);
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const target = new URL(root); target.pathname = `/${name}`;
  pool = new pg.Pool({ connectionString: target.href });
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const entries = journal.entries.filter((e) => e.idx < 27);
  assert.equal(entries.length, 27);
  await mkdir(path.join(oldMigrations, "meta"));
  await writeFile(path.join(oldMigrations, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const e of entries) await copyFile(`drizzle/${e.tag}.sql`, path.join(oldMigrations, `${e.tag}.sql`));
  await migrate(drizzle(pool), { migrationsFolder: oldMigrations });
  const category = (await pool.query("insert into categories(name) values ('Histórica') returning id")).rows[0].id;
  const old = (await pool.query("insert into products(category_id,name,price,current_stock,unit_measure) values ($1,'Artículo conservado',12345,37,'unidad') returning *", [category])).rows[0];
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const upgraded = (await pool.query("select * from products where id=$1", [old.id])).rows[0];
  const { family_id, variant_key, ...unchanged } = upgraded;
  assert.deepEqual(unchanged, old); assert.equal(family_id, null); assert.equal(variant_key, null);
  console.log("PASS upgrade desde 27 migraciones conserva todas las columnas/IDs/stock originales");
  // Legacy fixture stays; seed must not overwrite it. Fresh second database for demo.
  await pool.end(); pool = null;
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  pool = new pg.Pool({ connectionString: target.href });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const env = { ...process.env, DATABASE_URL: target.href, SEED_DEMO_DATA: "true", NODE_ENV: "test", WEBPAY_ENVIRONMENT: "integration", MAIL_ENABLED: "false", SESSION_SECRET: randomBytes(32).toString("hex"), EMAIL_VERIFICATION_SECRET: randomBytes(32).toString("hex"), LOGISTICS_QR_SECRET: randomBytes(32).toString("hex") };
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], { env, stdio: "inherit", windowsHide: true });
  Object.assign(process.env, env);
  const snapshot = async () => {
    const result = {};
    for (const { table_name: table } of (await pool.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows) {
      result[table] = (await pool.query(`select row_to_json(t) as row from ${table} t order by row_to_json(t)::text`)).rows;
    } return result;
  };
  const frozen = await snapshot();
  assert.equal(frozen.product_families.length, 19); assert.equal(frozen.product_family_events.length, 71);
  assert.equal(frozen.products.filter((r) => r.row.family_id === null).length, 25);
  execFileSync(process.execPath, ["--import", "tsx", "src/db/associateDemoFamilies.ts"], { env: { ...env, ASSOCIATE_DEMO_FAMILIES: "true" }, stdio: "inherit", windowsHide: true });
  assert.deepEqual(await snapshot(), frozen);
  console.log("PASS 19 familias / 71 variantes / 25 simples y asociación repetida sin escrituras");
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = Object.fromEntries((await pool.query("select u.id,r.name from users u join roles r on r.id=u.role_id where u.status='ACTIVE' order by u.id desc")).rows.map((r) => [r.name, r.id]));
  const request = async (method, route, body, role, expected = 200) => {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: users[role] }, env.SESSION_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json(); assert.equal(response.status, expected, JSON.stringify(payload)); return payload.data;
  };
  await request("GET", "/product-families", null, null, 401);
  for (const role of ["MANAGER", "WAREHOUSE", "CASHIER"]) await request("GET", "/product-families", null, role, 403);
  const categoryId = frozen.categories[0].row.id;
  const body = { name: "Familia de prueba", categoryId, brand: "Prueba", attributes: [
    { name: "Color", options: [{ label: "Blanco" }, { label: "Negro" }] },
    { name: "Tamaño", options: [{ label: "Pequeño" }, { label: "Grande" }] },
  ] };
  const family = await request("POST", "/product-families", body, "ADMIN", 201);
  const options = family.attributes.map((a) => a.options[0].id);
  const productBody = { categoryId, brand: "Prueba", name: "Producto prueba blanco pequeño", price: 990, unitMeasure: "unidad", familyId: family.id, variantOptionIds: options };
  const sku = await request("POST", "/products", productBody, "ADMIN", 201);
  assert.equal(sku.currentStock, 0); assert.equal(sku.familyId, family.id);
  await request("POST", "/products", { ...productBody, name: "Duplicada" }, "ADMIN", 409);
  await request("POST", "/products", { ...productBody, name: "Incompleta", variantOptionIds: options.slice(0, 1) }, "ADMIN", 400);
  await request("POST", "/products", { ...productBody, name: "Ajena", variantOptionIds: [options[0], 9999999] }, "ADMIN", 400);
  await request("POST", "/products", { ...productBody, name: "Marca ajena", brand: "Otra" }, "ADMIN", 409);
  const edited = await request("PATCH", `/products/${sku.id}`, { price: 1990, minimumStock: 3, barcode: "9900000000001" }, "ADMIN");
  assert.equal(edited.price, "1990.00");
  const unavailableCard = (await request("GET", "/catalog/products?search=Familia%20de%20prueba")).items[0];
  assert.equal(unavailableCard.onlineVariantCount, 0); assert.equal(unavailableCard.onlineFromPrice, null);
  assert.deepEqual(unavailableCard.attributeNames, ["Color", "Tamaño"]);
  const exact = await request("GET", "/products/barcode/9900000000001", null, "CASHIER"); assert.equal(exact.id, sku.id);
  const newFamily = await request("PATCH", `/product-families/${family.id}`, { ...body, attributes: family.attributes.map((a, i) => ({ id: a.id, name: a.name, options: a.options.map((o) => ({ id: o.id, label: o.label })).concat(i === 0 ? [{ label: "Rojo" }] : []) })) }, "ADMIN");
  assert.equal(newFamily.attributes[0].options.length, 3);
  await request("POST", "/products", { ...productBody, name: "Artículo sin atributo en el nombre", variantOptionIds: [newFamily.attributes[0].options.find((o) => o.label === "Rojo").id, options[1]] }, "ADMIN", 201);
  assert.ok((await request("GET", "/catalog/products?search=Rojo")).items.some((p) => p.kind === "family" && p.id === family.id && p.variantCount === 1));
  const historySku = frozen.products.find((r) => r.row.family_id !== null).row;
  await request("PATCH", `/products/${historySku.id}`, { familyId: null, variantOptionIds: [] }, "ADMIN", 409);
  await request("PATCH", `/products/${historySku.id}`, { name: "Otro artículo" }, "ADMIN", 409);
  await assert.rejects(pool.query("update products set variant_key='999999' where id=$1", [sku.id]), /noncanonical/);
  await assert.rejects(pool.query("update product_variant_values set option_id=999999 where product_id=$1", [sku.id]), /foreign key/);
  console.log("PASS permisos, variantes genéricas, duplicados, opciones ajenas, edición, barcode y protección histórica");
  const page1 = await request("GET", "/catalog/products?limit=20"); const page2 = await request("GET", "/catalog/products?limit=20&page=2");
  assert.equal(page1.totalItems, 44); assert.equal(page1.totalPages, 3);
  const keys = [...page1.items, ...page2.items].map((p) => `${p.kind}:${p.id}`); assert.equal(new Set(keys).size, keys.length);
  const paint = await request("GET", "/catalog/products?search=blanco%20mate"); assert.equal(paint.totalItems, 1); assert.equal(paint.items[0].kind, "family");
  const detail = await request("GET", `/catalog/families/${paint.items[0].id}`); assert.equal(detail.variants.length, 10);
  assert.ok(detail.variants.every((v) => v.variantValues.length === 1)); assert.ok(detail.variants.some((v) => v.availableStock === 0));
  const brushes = (await request("GET", "/product-families", null, "ADMIN")).find((f) => f.name.includes("EMTOP línea EPBH"));
  const inactive = (await request("GET", `/catalog/families/${brushes.id}`)).variants.find((v) => !v.status);
  assert.ok(inactive); assert.equal(inactive.price, undefined); assert.equal(inactive.barcode, undefined);
  const mesh = (await request("GET", "/product-families", null, "ADMIN")).find((f) => f.name === "Malla Rashel 80% sombra");
  assert.equal((await request("GET", `/catalog/families/${mesh.id}`)).variants.filter((v) => v.inStoreOnly).length, 3);
  console.log("PASS agrupación antes de paginar, búsqueda por variante, conteos y estados públicos sin datos administrativos");
  // No operational changes from family CRUD/read paths; only new test product metadata.
  for (const table of ["sales", "sale_details", "inventory_movements", "sale_cancellation_requests", "sale_cancellation_request_items", "online_orders", "online_payments"]) {
    assert.deepEqual((await snapshot())[table], frozen[table], table);
  }
  const after = await pool.query("select row_to_json(p) as row from products p where id=any($1) order by id", [frozen.products.map((r) => r.row.id)]);
  const originals = frozen.products.map((r) => r.row).sort((a, b) => a.id - b.id);
  assert.deepEqual(after.rows.map((r) => r.row), originals);
  console.log("PASS productos previos, importes, stock, inventario, ventas y devoluciones intactos");
  const sku2 = await request("POST", "/products", { ...productBody, name: "Producto prueba negro grande", price: 2990, barcode: "9900000000002", variantOptionIds: family.attributes.map((a) => a.options[1].id) }, "ADMIN", 201);
  for (const p of [sku, sku2]) await request("POST", "/inventory", { productId: p.id, movementType: "ENTRY", quantity: 30, reason: "Prueba aislada de variantes" }, "ADMIN", 201);
  const onlineCard = (await request("GET", "/catalog/products?search=Familia%20de%20prueba")).items[0];
  assert.equal(onlineCard.onlineVariantCount, 2);
  assert.equal(Number(onlineCard.onlineFromPrice), 1990); assert.equal(Number(onlineCard.onlineMaxPrice), 2990);
  // The cheaper red SKU has zero stock and must not provide the advertised price.
  assert.equal(Number(onlineCard.fromPrice), 990);
  assert.equal(onlineCard.representativeProductId, sku.id);
  await request("PATCH", `/products/${sku2.id}`, { inStoreOnly: true }, "ADMIN");
  const singleOnline = (await request("GET", "/catalog/products?search=Familia%20de%20prueba")).items[0];
  assert.equal(singleOnline.onlineVariantCount, 1);
  assert.equal(Number(singleOnline.onlineFromPrice), Number(singleOnline.onlineMaxPrice));
  await request("PATCH", `/products/${sku2.id}`, { inStoreOnly: false }, "ADMIN");
  console.log("PASS precio y número de opciones públicas excluyen agotadas y Solo presencial, sin alterar filtros ni paginación");
  const sale = await request("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId: sku.id, quantity: 2 }, { productId: sku2.id, quantity: 1 }] }, "CASHIER", 201);
  const stockOf = async (id) => (await pool.query("select current_stock from products where id=$1", [id])).rows[0].current_stock;
  assert.equal(await stockOf(sku.id), 28); assert.equal(await stockOf(sku2.id), 29);
  assert.equal((await request("GET", "/products/barcode/9900000000002", null, "CASHIER")).id, sku2.id);
  const returned = await request("POST", `/sales/${sale.id}/returns`, { reason: "Devolución aislada de una variante", details: [{ productId: sku.id, quantity: 1 }] }, "ADMIN");
  assert.equal(await stockOf(sku.id), 29); assert.equal(await stockOf(sku2.id), 29);
  await request("PATCH", `/sales/cancellation-requests/${returned.cancellationRequest.id}/undo`, {}, "ADMIN");
  assert.equal(await stockOf(sku.id), 28); assert.equal(await stockOf(sku2.id), 29);
  console.log("PASS POS por ID/barcode y devolución/reversión modifican solo la variante exacta");
  const client = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,email_verified_at) values ((select id from roles where name='CLIENT'),'11222333-4','Cliente','Prueba','variant-client@example.test','unused',now()) returning id")).rows[0];
  users.CLIENT = client.id;
  const sdk = (await import("transbank-sdk")).default;
  const transactions = new Map();
  sdk.WebpayPlus.Transaction.prototype.create = async (buyOrder, sessionId, amount) => {
    const token = `variant-webpay-${transactions.size + 1}`;
    transactions.set(token, { buy_order: buyOrder, session_id: sessionId, amount });
    return { token, url: "https://webpay.example.test/pay" };
  };
  sdk.WebpayPlus.Transaction.prototype.status = async (token) => ({ ...transactions.get(token), status: "INITIALIZED", response_code: -2 });
  sdk.WebpayPlus.Transaction.prototype.commit = async (token) => ({ ...transactions.get(token), status: "AUTHORIZED", response_code: 0, authorization_code: "123456", payment_type_code: "VD", transaction_date: new Date().toISOString() });
  await request("POST", "/promotions", { name: "2x1 aislado por variante", type: "BUY_2_PAY_1", isActive: true, percentage: null, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), productIds: [sku.id, sku2.id], categoryIds: [] }, "ADMIN", 201);
  const offers = await request("GET", "/catalog/products?offers=true");
  assert.equal(offers.items.find((p) => p.kind === "family" && p.id === family.id).variantCount, 2);
  assert.equal(offers.items.find((p) => p.kind === "family" && p.id === family.id).hasOffers, true);
  assert.equal(offers.items.find((p) => p.kind === "family" && p.id === family.id).onlineHasOffers, true);
  await initializeTestDelivery(users.ADMIN);
  const checkout = await request("POST", "/online-orders/checkout", await acceptTestQuote(base, { checkoutKey: "variant-checkout-001", items: [{ productId: sku.id, quantity: 1 }, { productId: sku2.id, quantity: 1 }], deliveryType: "PICKUP", saveDeliveryAddress: false }), "CLIENT", 201);
  assert.equal(checkout.total, 4980); // no 2x1 across colors/sizes
  const snapshotItems = async () => (await pool.query("select row_to_json(i) as row from online_order_items i where order_id=$1 order by product_id", [checkout.orderId])).rows;
  const orderItems = await snapshotItems(); assert.equal(orderItems.length, 2);
  assert.deepEqual(orderItems.map((r) => r.row.product_id), [sku.id, sku2.id]);
  assert.equal(await stockOf(sku.id), 28); assert.equal(await stockOf(sku2.id), 29);
  for (const id of [sku.id, sku2.id]) assert.equal((await request("GET", `/catalog/products/${id}`)).reservedQuantity, 1);
  const callback = async (token, cancel = false) => fetch(base + "/online-orders/payments/webpay/return", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(cancel ? { TBK_TOKEN: token, TBK_ORDEN_COMPRA: transactions.get(token).buy_order, TBK_ID_SESION: transactions.get(token).session_id } : { token_ws: token }) });
  assert.equal((await callback(checkout.token, true)).status, 303);
  const retried = await request("POST", `/online-orders/${checkout.orderId}/retry-payment`, {}, "CLIENT");
  assert.notEqual(retried.token, checkout.token); assert.deepEqual(await snapshotItems(), orderItems);
  assert.equal((await callback(retried.token)).status, 303);
  assert.equal(await stockOf(sku.id), 27); assert.equal(await stockOf(sku2.id), 28);
  await callback(retried.token); assert.equal(await stockOf(sku.id), 27); assert.equal(await stockOf(sku2.id), 28);
  assert.equal((await pool.query("select status from online_orders where id=$1", [checkout.orderId])).rows[0].status, "PAID");
  console.log("PASS carrito con dos variantes, 2x1 independiente, reservas, snapshots, cancelación, nuevo token y pago idempotente");
  const device = randomBytes(32).toString("base64url");
  const guestOrder = (await pool.query(`insert into online_orders(guest_name,guest_email,guest_phone,guest_session_hash,guest_device_hash,checkout_key,status,total,delivery_type,reservation_expires_at)
    values ('Invitado QA','variant-guest@example.test','+56911111111',$1,$2,$3,'CANCELLED',1990,'PICKUP',now()-interval '1 hour') returning id`,
    [createHash("sha256").update(randomBytes(32)).digest("hex"), createHash("sha256").update(device).digest("hex"), randomBytes(16).toString("hex")])).rows[0];
  await pool.query("insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values ($1,$2,1,1990,1990)", [guestOrder.id, sku.id]);
  const guestItems = async () => (await pool.query("select row_to_json(i) as row from online_order_items i where order_id=$1", [guestOrder.id])).rows;
  const guestBefore = await guestItems();
  const retryGuest = async (cookie) => fetch(base + `/online-orders/guest/device-orders/${guestOrder.id}/retry-payment`, { method: "POST", headers: { Cookie: `fyf_guest_device=${cookie}`, "Content-Type": "application/json" } });
  assert.equal((await retryGuest(randomBytes(32).toString("base64url"))).status, 404);
  const guestRetry = await retryGuest(device); assert.equal(guestRetry.status, 200, await guestRetry.clone().text());
  assert.deepEqual(await guestItems(), guestBefore); assert.equal(await stockOf(sku.id), 27);
  await callback((await guestRetry.json()).data.token, true);
  const transactionCount = transactions.size;
  await request("PATCH", `/products/${sku.id}`, { inStoreOnly: true }, "ADMIN");
  for (const state of ["CANCELLED", "PAYMENT_FAILED", "EXPIRED"]) {
    await pool.query("update online_orders set status=$2 where id=$1", [guestOrder.id, state]);
    assert.equal((await retryGuest(device)).status, 409);
    assert.deepEqual(await guestItems(), guestBefore);
    assert.equal(transactions.size, transactionCount);
  }
  assert.equal(await stockOf(sku.id), 27);
  await request("PATCH", `/products/${sku.id}`, { inStoreOnly: false }, "ADMIN");
  console.log("PASS Invitado con variante: dispositivo ajeno rechazado, reintento nuevo y snapshots/stock conservados; Solo presencial bloquea los tres estados");
  const historicalSimple = frozen.products.find((r) => r.row.family_id === null && r.row.brand === null).row;
  const historicalFamily = await request("POST", "/product-families", { name: "Compatibilidad histórica", categoryId: historicalSimple.category_id, brand: null, attributes: [{ name: "Presentación", options: [{ label: "Artículo original" }] }] }, "ADMIN", 201);
  const classification = { familyId: historicalFamily.id, variantOptionIds: [historicalFamily.attributes[0].options[0].id] };
  await request("PATCH", `/products/${historicalSimple.id}`, classification, "ADMIN", 400);
  await request("PATCH", `/products/${historicalSimple.id}`, { ...classification, associationReason: "Clasificación comprobada sin cambiar el artículo original" }, "ADMIN");
  const classified = (await pool.query("select row_to_json(p) as row from products p where id=$1", [historicalSimple.id])).rows[0].row;
  const withoutFamily = ({ family_id: _family, variant_key: _key, ...other }) => other;
  assert.deepEqual(withoutFamily(classified), withoutFamily(historicalSimple));
  await request("PATCH", `/products/${historicalSimple.id}`, { ...classification, associationReason: "Repetición sin cambios" }, "ADMIN");
  assert.equal((await pool.query("select count(*)::int as n from product_family_events where product_id=$1", [historicalSimple.id])).rows[0].n, 1);
  console.log("PASS primera asociación histórica requiere motivo, conserva todos los datos anteriores y no duplica auditoría");
  if (process.env.FAMILY_VISUAL_SERVER === "1") {
    console.log(`FAMILY_VISUAL_API=${base} — solo datos descartables; presione Enter para detener y limpiar`);
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdin.pause();
  }
} finally {
  if (server) await new Promise((r) => server.close(r)); await applicationDb?.$client.end(); await pool?.end();
  if (created) await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end(); await rm(oldMigrations, { recursive: true });
}

// PROMOTIONS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55445/postgres node tests/promotions.integration.mjs
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const rootUrl = new URL(process.env.PROMOTIONS_TEST_DATABASE_URL || "http://missing");
assert.ok(
  ["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "55445",
  "Use the isolated PostgreSQL cluster on port 55445",
);

const suffix = randomBytes(4).toString("hex");
const databaseNames = [`fyf_promotions_upgrade_${suffix}`, `fyf_promotions_clean_${suffix}`];
const previousMigrations = await mkdtemp(path.join(tmpdir(), "fyf-promotions-migrations-"));
const admin = new pg.Client({ connectionString: rootUrl.href });
let server;
let applicationDb;
let cleanPool;

function databaseUrl(name) {
  const value = new URL(rootUrl);
  value.pathname = `/${name}`;
  return value.href;
}

async function createDatabase(name) {
  await admin.query(`CREATE DATABASE "${name}"`);
}

async function seedRolesAndUsers(pool) {
  await pool.query(`
    INSERT INTO roles(name,description) VALUES
      ('ADMIN','Administrador'),('MANAGER','Gerente'),('CASHIER','Cajero'),
      ('WAREHOUSE','Bodeguero'),('CLIENT','Cliente')
    ON CONFLICT(name) DO NOTHING
  `);
  const rows = [];
  for (const [role, rut, email] of [
    ["ADMIN", "11111111-1", "promo-admin@example.test"],
    ["MANAGER", "22222222-2", "promo-manager@example.test"],
    ["CASHIER", "33333333-3", "promo-cashier@example.test"],
    ["WAREHOUSE", "44444444-4", "promo-warehouse@example.test"],
    ["CLIENT", "55555555-5", "promo-client@example.test"],
  ]) {
    const row = (await pool.query(`
      INSERT INTO users(role_id,rut,names,surnames,correo,email_verified_at,password,status)
      VALUES ((SELECT id FROM roles WHERE name=$1),$2,$1,'Promociones',$3,now(),'hash','ACTIVE')
      RETURNING id
    `, [role, rut, email])).rows[0];
    rows.push([role, row]);
  }
  return Object.fromEntries(rows);
}

function promotion(overrides = {}) {
  const now = Date.now();
  return {
    name: "Promocion porcentual",
    type: "PERCENTAGE_DISCOUNT",
    isActive: true,
    percentage: 20,
    startsAt: new Date(now - 3_600_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

await admin.connect();
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const previousEntries = journal.entries.filter((entry) => entry.idx <= 23);
  assert.equal(journal.entries.find((entry) => entry.idx === 24)?.tag, "0024_lean_kate_bishop");
  await mkdir(path.join(previousMigrations, "meta"));
  await writeFile(
    path.join(previousMigrations, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: previousEntries }, null, 2),
  );
  for (const entry of previousEntries) {
    await copyFile(`drizzle/${entry.tag}.sql`, path.join(previousMigrations, `${entry.tag}.sql`));
  }

  await createDatabase(databaseNames[0]);
  const upgradePool = new pg.Pool({ connectionString: databaseUrl(databaseNames[0]) });
  await migrate(drizzle(upgradePool), { migrationsFolder: previousMigrations });
  const historicalUsers = await seedRolesAndUsers(upgradePool);
  const historicalCategory = (await upgradePool.query("INSERT INTO categories(name) VALUES ('Historica') RETURNING id")).rows[0].id;
  const historicalProduct = (await upgradePool.query(`
    INSERT INTO products(category_id,name,price,unit_measure,current_stock,status)
    VALUES ($1,'Producto historico',3990,'unidad',10,true) RETURNING id
  `, [historicalCategory])).rows[0].id;
  const historicalOrder = (await upgradePool.query(`
    INSERT INTO online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at,paid_at)
    VALUES ($1,'historical-promo-0001','PAID',7980,'PICKUP',now()+interval '15 minutes',now()) RETURNING id
  `, [historicalUsers.CLIENT.id])).rows[0].id;
  await upgradePool.query(`
    INSERT INTO online_order_items(order_id,product_id,quantity,unit_price,subtotal)
    VALUES ($1,$2,2,3990,7980)
  `, [historicalOrder, historicalProduct]);
  await migrate(drizzle(upgradePool), { migrationsFolder: "drizzle" });
  const historical = (await upgradePool.query("SELECT * FROM online_order_items WHERE order_id=$1", [historicalOrder])).rows[0];
  assert.equal(historical.discount_amount, "0.00");
  assert.equal(historical.promotion_id, null);
  assert.equal(historical.subtotal, "7980.00");
  await upgradePool.end();
  console.log("PASS migration 0023 -> latest preserves historical orders without recalculation");

  await createDatabase(databaseNames[1]);
  cleanPool = new pg.Pool({ connectionString: databaseUrl(databaseNames[1]) });
  await migrate(drizzle(cleanPool), { migrationsFolder: "drizzle" });
  assert.equal(
    (await cleanPool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0].count,
    String(journal.entries.length),
  );
  const users = await seedRolesAndUsers(cleanPool);
  const categories = (await cleanPool.query(`
    INSERT INTO categories(name) VALUES ('Herramientas'),('Tornillos'),('Pinturas') RETURNING id,name
  `)).rows;
  const categoryId = (name) => categories.find((item) => item.name === name).id;
  const products = (await cleanPool.query(`
    INSERT INTO products(category_id,name,brand,price,unit_measure,current_stock,minimum_stock,status)
    VALUES
      ($1,'Taladro promocional','Marca A',10000,'unidad',100,5,true),
      ($2,'Tornillo promocional','Marca B',5000,'unidad',100,5,true),
      ($3,'Pintura sin oferta','Marca C',9000,'unidad',100,5,true)
    RETURNING id,name
  `, [categoryId("Herramientas"), categoryId("Tornillos"), categoryId("Pinturas")])).rows;
  const productId = (name) => products.find((item) => item.name === name).id;
  console.log("PASS clean migrations 0000 -> latest create promotion schema");

  process.env.DATABASE_URL = databaseUrl(databaseNames[1]);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.EMAIL_VERIFICATION_SECRET = randomBytes(32).toString("hex");
  process.env.LOGISTICS_QR_SECRET = randomBytes(32).toString("hex");
  process.env.MAIL_ENABLED = "false";
  const transbankSdk = (await import("transbank-sdk")).default;
  const webpayAmounts = [];
  transbankSdk.WebpayPlus.Transaction.prototype.create = async (buyOrder, sessionId, amount) => {
    webpayAmounts.push(Number(amount));
    return { token: `promo-webpay-${webpayAmounts.length}`, url: "https://webpay.example.test/pay" };
  };
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = (role) => jwt.sign({ id: users[role].id }, process.env.SESSION_SECRET);
  const request = async (method, route, { role, body } = {}, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(role ? { Authorization: `Bearer ${token(role)}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(payload)}`);
    return payload;
  };

  await request("GET", "/promotions", {}, 401);
  for (const role of ["CASHIER", "WAREHOUSE", "CLIENT"]) {
    await request("GET", "/promotions", { role }, 403);
    await request("POST", "/promotions", { role, body: promotion({ productIds: [products[0].id] }) }, 403);
  }
  const targets = (await request("GET", "/promotions/targets", { role: "MANAGER" })).data;
  assert.equal(targets.products.length, 3);
  assert.equal(targets.categories.length, 3);

  const percentBody = promotion({ productIds: [productId("Taladro promocional")] });
  const percent = (await request("POST", "/promotions", { role: "ADMIN", body: percentBody }, 201)).data;
  assert.equal(percent.status, "ACTIVE");
  assert.equal(percent.percentage, 20);

  for (const invalid of [
    promotion({ productIds: [], categoryIds: [] }),
    promotion({ productIds: [productId("Taladro promocional")], percentage: 0 }),
    promotion({ productIds: [productId("Taladro promocional")], percentage: 100 }),
    promotion({ productIds: [productId("Taladro promocional")], endsAt: percentBody.startsAt }),
  ]) {
    await request("POST", "/promotions", { role: "MANAGER", body: invalid }, 400);
  }

  await request("POST", "/promotions", {
    role: "MANAGER",
    body: promotion({ name: "Conflicto producto", productIds: [productId("Taladro promocional")] }),
  }, 409);
  await request("POST", "/promotions", {
    role: "MANAGER",
    body: promotion({ name: "Conflicto categoria", categoryIds: [categoryId("Herramientas")] }),
  }, 409);
  await request("POST", "/promotions", {
    role: "MANAGER",
    body: promotion({
      name: "Target redundante",
      productIds: [productId("Taladro promocional")],
      categoryIds: [categoryId("Herramientas")],
    }),
  }, 409);

  const adjacent = (await request("POST", "/promotions", {
    role: "MANAGER",
    body: promotion({
      name: "Intervalo adyacente",
      startsAt: percentBody.endsAt,
      endsAt: new Date(new Date(percentBody.endsAt).getTime() + 3_600_000).toISOString(),
      productIds: [productId("Taladro promocional")],
    }),
  }, 201)).data;
  assert.equal(adjacent.status, "SCHEDULED");

  const twoForOne = (await request("POST", "/promotions", {
    role: "MANAGER",
    body: promotion({
      name: "Dos por uno tornillos",
      type: "BUY_2_PAY_1",
      percentage: null,
      productIds: [],
      categoryIds: [categoryId("Tornillos")],
    }),
  }, 201)).data;
  await request("POST", "/promotions", {
    role: "ADMIN",
    body: promotion({
      name: "Categoria repetida",
      type: "BUY_2_PAY_1",
      percentage: null,
      categoryIds: [categoryId("Tornillos")],
    }),
  }, 409);
  const inactiveConflict = (await request("POST", "/promotions", {
    role: "ADMIN",
    body: promotion({ name: "Inactiva conflictiva", isActive: false, productIds: [productId("Taladro promocional")] }),
  }, 201)).data;
  await request("PATCH", `/promotions/${inactiveConflict.id}/status`, {
    role: "ADMIN", body: { isActive: true },
  }, 409);
  console.log("PASS ADMIN/MANAGER permissions, validation and half-open product/category conflict policy");

  let catalog = (await request("GET", "/catalog/products?offers=true&sort=price-asc")).data;
  assert.equal(catalog.totalItems, 2);
  assert.deepEqual(catalog.items.map((item) => item.name), ["Tornillo promocional", "Taladro promocional"]);
  const taladro = catalog.items.find((item) => item.id === productId("Taladro promocional"));
  const tornillo = catalog.items.find((item) => item.id === productId("Tornillo promocional"));
  assert.equal(taladro.promotionalPrice, "8000.00");
  assert.equal(taladro.promotion.label, "-20%");
  assert.equal(tornillo.promotionalPrice, null);
  assert.equal(tornillo.promotion.label, "2x1");
  assert.equal((await request("GET", `/catalog/products/${taladro.id}`)).data.promotionalPrice, "8000.00");
  assert.equal((await request("GET", "/catalog/products?offers=true&search=taladro&limit=20")).data.totalItems, 1);
  assert.equal((await request("GET", `/catalog/products?offers=true&categoryId=${categoryId("Tornillos")}`)).data.totalItems, 1);
  assert.equal((await request("GET", "/catalog/products?offers=true&page=5&limit=20")).data.page, 1);
  const percentageOnly = (await request("GET", "/catalog/products?promotionTypes=PERCENTAGE_DISCOUNT")).data;
  assert.equal(percentageOnly.totalItems, 1);
  assert.equal(percentageOnly.items[0].promotion.type, "PERCENTAGE_DISCOUNT");
  const twoForOneOnly = (await request("GET", "/catalog/products?promotionTypes=BUY_2_PAY_1")).data;
  assert.equal(twoForOneOnly.totalItems, 1);
  assert.equal(twoForOneOnly.items[0].promotion.type, "BUY_2_PAY_1");
  const bothPromotionTypes = (await request("GET", "/catalog/products?promotionTypes=PERCENTAGE_DISCOUNT,BUY_2_PAY_1&page=5&limit=20")).data;
  assert.equal(bothPromotionTypes.totalItems, 2);
  assert.equal(bothPromotionTypes.page, 1);
  await request("GET", "/catalog/products?promotionTypes=UNKNOWN", {}, 400);
  console.log("PASS catalog offer types, filtered totals, public DTO and percentage/base price ordering");

  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { categoryId: categoryId("Tornillos") },
  }, 409);
  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { status: false },
  });
  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { categoryId: categoryId("Tornillos") },
  });
  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { status: true },
  }, 409);
  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { categoryId: categoryId("Herramientas") },
  });
  await request("PATCH", `/products/${productId("Taladro promocional")}`, {
    role: "ADMIN", body: { status: true },
  });
  console.log("PASS product category changes and reactivation cannot introduce promotion overlap");

  const manipulated = {
    checkoutKey: "promotion-manipulated-01",
    items: [{ productId: taladro.id, quantity: 2, promotionalPrice: 1 }],
    deliveryType: "PICKUP",
    saveDeliveryAddress: false,
    total: 1,
  };
  await request("POST", "/online-orders/checkout", { role: "CLIENT", body: manipulated }, 400);
  const checkoutBody = {
    checkoutKey: "promotion-checkout-0001",
    items: [
      { productId: taladro.id, quantity: 2 },
      { productId: tornillo.id, quantity: 3 },
    ],
    deliveryType: "PICKUP",
    saveDeliveryAddress: false,
  };
  const checkout = (await request("POST", "/online-orders/checkout", {
    role: "CLIENT", body: checkoutBody,
  }, 201)).data;
  assert.equal(checkout.total, 26000);
  assert.equal(webpayAmounts.at(-1), 26000);
  const storedItems = (await cleanPool.query(`
    SELECT product_id,quantity,unit_price,subtotal,discount_amount,promotion_id,
      promotion_type_snapshot,promotion_name_snapshot,promotion_value_snapshot
    FROM online_order_items WHERE order_id=$1 ORDER BY product_id
  `, [checkout.orderId])).rows;
  const storedPercent = storedItems.find((item) => item.product_id === taladro.id);
  const storedTwoForOne = storedItems.find((item) => item.product_id === tornillo.id);
  assert.deepEqual({
    quantity: storedPercent.quantity,
    unitPrice: storedPercent.unit_price,
    subtotal: storedPercent.subtotal,
    discount: storedPercent.discount_amount,
    type: storedPercent.promotion_type_snapshot,
    value: storedPercent.promotion_value_snapshot,
  }, { quantity: 2, unitPrice: "10000.00", subtotal: "16000.00", discount: "4000.00", type: "PERCENTAGE_DISCOUNT", value: 20 });
  assert.deepEqual({
    quantity: storedTwoForOne.quantity,
    unitPrice: storedTwoForOne.unit_price,
    subtotal: storedTwoForOne.subtotal,
    discount: storedTwoForOne.discount_amount,
    type: storedTwoForOne.promotion_type_snapshot,
  }, { quantity: 3, unitPrice: "5000.00", subtotal: "10000.00", discount: "5000.00", type: "BUY_2_PAY_1" });
  assert.equal((await cleanPool.query("SELECT total FROM online_orders WHERE id=$1", [checkout.orderId])).rows[0].total, "26000.00");
  assert.equal((await cleanPool.query("SELECT amount FROM online_payments WHERE order_id=$1", [checkout.orderId])).rows[0].amount, "26000.00");
  assert.deepEqual(storedItems.map((item) => item.quantity), [2, 3]);

  await request("PATCH", `/promotions/${percent.id}/status`, { role: "MANAGER", body: { isActive: false } });
  await request("PATCH", `/promotions/${twoForOne.id}/status`, { role: "ADMIN", body: { isActive: false } });
  await cleanPool.query("UPDATE online_orders SET status='CANCELLED' WHERE id=$1", [checkout.orderId]);
  await cleanPool.query("UPDATE online_payments SET status='FAILED' WHERE order_id=$1", [checkout.orderId]);
  const frozen = (await request("POST", `/online-orders/${checkout.orderId}/retry-payment`, {
    role: "CLIENT", body: {},
  })).data;
  assert.equal(frozen.orderId, checkout.orderId);
  assert.equal(frozen.total, 26000);
  assert.equal(webpayAmounts.at(-1), 26000);
  assert.equal((await cleanPool.query("SELECT count(*) FROM online_order_items WHERE order_id=$1", [checkout.orderId])).rows[0].count, "2");
  await request("DELETE", `/promotions/${percent.id}`, { role: "ADMIN" }, 409);
  await request("DELETE", `/promotions/${twoForOne.id}`, { role: "MANAGER" }, 409);
  await request("DELETE", `/promotions/${adjacent.id}`, { role: "MANAGER" });
  console.log("PASS checkout ignores client money, freezes snapshots, preserves physical quantity and Webpay amount");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (applicationDb?.$client) await applicationDb.$client.end();
  if (cleanPool) await cleanPool.end().catch(() => undefined);
  await rm(previousMigrations, { recursive: true, force: true });
  for (const name of databaseNames) {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
  }
  await admin.end();
}

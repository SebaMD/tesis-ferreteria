import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import jwt from "jsonwebtoken";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = new URL(process.env.DELIVERY_TEST_DATABASE_URL || "http://missing");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55446" && url.pathname === "/postgres", "Only the isolated delivery cluster on 55446 is permitted");
const pool = new pg.Pool({ connectionString: url.href });
const folder = await mkdtemp(path.join(tmpdir(), "fyf-delivery-migrations-"));
let server, applicationDb;
const hash = value => createHash("sha256").update(value).digest("hex");
try {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  assert.equal(journal.entries.length, 31);
  assert.ok(journal.entries[30].when > journal.entries[29].when);
  await mkdir(path.join(folder, "meta"));
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 30) }));
  for (const e of journal.entries.slice(0, 30)) await copyFile(`drizzle/${e.tag}.sql`, path.join(folder, `${e.tag}.sql`));
  await migrate(drizzle(pool), { migrationsFolder: folder });
  const users = {};
  for (const [i, role] of ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"].entries()) {
    await pool.query("insert into roles(name) values($1) on conflict do nothing", [role]);
    users[role] = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values ((select id from roles where name=$1),$2,$1,'Prueba',$3,'unused','ACTIVE',now()) returning id", [role, `${10000000 + i}-0`, `${role.toLowerCase()}@example.test`])).rows[0].id;
  }
  const category = (await pool.query("insert into categories(name) values('Categoría aislada') returning id")).rows[0].id;
  const products = [];
  for (const [name, price] of [["Artículo de prueba A", 10000], ["Artículo de prueba B", 5000]]) products.push((await pool.query("insert into products(category_id,name,price,unit_measure,current_stock,barcode) values($1,$2,$3,'unidad',100,$4) returning *", [category, name, price, `test-${products.length}`])).rows[0]);
  const legacy = (await pool.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,'legacy-delivery-order-001','CANCELLED',10000,'PICKUP',now()) returning *", [users.CLIENT])).rows[0];
  await pool.query("insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,$2,1,10000,10000)", [legacy.id, products[0].id]);
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const upgraded = (await pool.query("select * from online_orders where id=$1", [legacy.id])).rows[0];
  for (const [k,v] of Object.entries(legacy)) assert.deepEqual(upgraded[k], v);
  assert.equal(upgraded.delivery_fee, null); assert.equal(upgraded.delivery_policy_revision_id, null);
  // Clean install in a second database, no business fixtures or seed.
  await pool.query("create database fyf_delivery_clean");
  const cleanUrl = new URL(url); cleanUrl.pathname = "/fyf_delivery_clean";
  const clean = new pg.Pool({ connectionString: cleanUrl.href });
  try { await migrate(drizzle(clean), { migrationsFolder: "drizzle" }); assert.equal((await clean.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count, "31"); } finally { await clean.end(); }
  console.log("PASS 31 migrations clean + upgrade + replay, legacy total untouched and no artificial DEMO association");

  Object.assign(process.env, { DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), EMAIL_VERIFICATION_SECRET: randomBytes(32).toString("hex"), LOGISTICS_QR_SECRET: randomBytes(32).toString("hex"), MAIL_ENABLED: "false", WEBPAY_ENVIRONMENT: "integration", NODE_ENV: "test" });
  const sdk = (await import("transbank-sdk")).default;
  const transactions = new Map();
  sdk.WebpayPlus.Transaction.prototype.create = async (buyOrder, sessionId, amount) => {
    const token = `delivery-test-${transactions.size + 1}`; transactions.set(token, { buy_order: buyOrder, session_id: sessionId, amount });
    return { token, url: "https://webpay.example.test/pay" };
  };
  sdk.WebpayPlus.Transaction.prototype.status = async token => ({ ...transactions.get(token), status: "INITIALIZED", response_code: -2 });
  sdk.WebpayPlus.Transaction.prototype.commit = async token => ({ ...transactions.get(token), status: "AUTHORIZED", response_code: 0, authorization_code: "123456", payment_type_code: "VD", transaction_date: new Date().toISOString() });
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(process.env.DELIVERY_VISUAL_TEST === "1" ? 5188 : 0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, route, body, role, expected = 200, extraHeaders = {}) => {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: users[role] }, process.env.SESSION_SECRET)}` } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); assert.equal(response.status, expected, `${method} ${route}: ${text}`);
    return { data: JSON.parse(text).data, headers: response.headers };
  };
  const items = [{ productId: products[0].id, quantity: 1 }];
  const quote = async (deliveryType = "DELIVERY", selected = items) => (await call("POST", "/online-orders/quote", { items: selected, deliveryType, deliveryCommune: deliveryType === "DELIVERY" ? "Santa Juana" : null })).data;
  const policyBody = { expectedRevisionId: null, pickupEnabled: true, deliveryEnabled: true, flatFee: 3000, minimumProductsTotal: null, freeShippingFrom: null, isDemo: true };
  await call("POST", "/online-orders/quote", { items, deliveryType: "PICKUP" }, null, 503);
  await call("GET", "/delivery-settings", null, null, 401);
  await call("PUT", "/delivery-settings", policyBody, null, 401);
  for (const role of ["CASHIER", "WAREHOUSE", "CLIENT"]) { await call("GET", "/delivery-settings", null, role, 403); await call("PUT", "/delivery-settings", policyBody, role, 403); }
  assert.equal((await call("GET", "/delivery-settings", null, "MANAGER")).data, null);
  let policy = (await call("PUT", "/delivery-settings", policyBody, "ADMIN")).data;
  assert.equal(policy.createdBy, users.ADMIN);
  const save = async (values, role = "ADMIN") => { policy = (await call("PUT", "/delivery-settings", { ...policyBody, expectedRevisionId: policy.id, ...values }, role)).data; return policy; };
  const firstRevision = (await pool.query("select * from delivery_policy_revisions where id=$1", [policy.id])).rows[0];
  await save({ flatFee: 3500 }, "MANAGER");
  assert.equal(policy.createdBy, users.MANAGER);
  assert.equal(policy.version, firstRevision.version + 1);
  for (const role of ["ADMIN", "MANAGER"]) {
    const current = (await call("GET", "/delivery-settings", null, role)).data;
    assert.equal(current.id, policy.id); assert.equal(current.createdBy, users.MANAGER);
    assert.equal(current.responsible, "MANAGER Prueba");
  }
  assert.equal((await quote()).total, "13500.00");
  assert.deepEqual((await pool.query("select * from delivery_policy_revisions where id=$1", [firstRevision.id])).rows[0], firstRevision);
  await call("PUT", "/delivery-settings", { ...policyBody, expectedRevisionId: policy.id, flatFee: -1 }, "MANAGER", 400);
  await call("PUT", "/delivery-settings", { ...policyBody, expectedRevisionId: policy.id, createdBy: users.ADMIN }, "MANAGER", 400);
  await save({ flatFee: 3000 });
  const pickup = await quote("PICKUP"); assert.equal(pickup.deliveryFee, "0.00"); assert.equal(pickup.total, "10000.00");
  const initialQuote = await quote(); assert.equal(initialQuote.total, "13000.00"); assert.equal(initialQuote.isDemo, true);
  assert.equal((await pool.query("select count(*) from online_orders")).rows[0].count, "1"); assert.equal(transactions.size, 0);
  await call("POST", "/online-orders/quote", { items, deliveryType: "DELIVERY", deliveryCommune: "Otra comuna" }, null, 400);
  for (const extra of [{ total: 1 }, { deliveryFee: 0 }, { items: [{ ...items[0], unitPrice: 1 }] }]) await call("POST", "/online-orders/quote", { items, deliveryType: "PICKUP", ...extra }, null, 400);
  const delivery = { deliveryType: "DELIVERY", deliveryRecipientName: "Comprador Demo", deliveryPhone: "+56911111111", deliveryAddress: "Dirección de prueba", deliveryCommune: "Santa Juana", saveDeliveryAddress: false };
  const checkout = { ...delivery, checkoutKey: "delivery-checkout-000001", items, quoteFingerprint: initialQuote.quoteFingerprint };
  await call("POST", "/online-orders/checkout", { ...checkout, total: 1 }, "CLIENT", 400);
  await save({ flatFee: 4000 });
  await call("POST", "/online-orders/checkout", checkout, "CLIENT", 409);
  assert.equal(transactions.size, 0); assert.equal((await pool.query("select count(*) from online_orders")).rows[0].count, "1");
  const racingBody = { ...policyBody, expectedRevisionId: policy.id };
  const revisionsBeforeRace = (await pool.query("select * from delivery_policy_revisions order by id")).rows;
  const raceRoles = ["ADMIN", "MANAGER"];
  const race = await Promise.all(raceRoles.map(role => fetch(base + "/delivery-settings", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: users[role] }, process.env.SESSION_SECRET)}` }, body: JSON.stringify(racingBody) })));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const winningRole = raceRoles[race.findIndex(r => r.status === 200)];
  policy = (await call("GET", "/delivery-settings", null, "MANAGER")).data;
  assert.equal(policy.createdBy, users[winningRole]);
  const revisionsAfterRace = (await pool.query("select * from delivery_policy_revisions order by id")).rows;
  assert.equal(revisionsAfterRace.length, revisionsBeforeRace.length + 1);
  assert.deepEqual(revisionsAfterRace.slice(0, -1), revisionsBeforeRace);
  await assert.rejects(pool.query("update delivery_policy_revisions set flat_fee=1 where id=$1", [policy.id]), /inmutables/);
  await assert.rejects(pool.query("delete from delivery_policy_revisions where id=$1", [policy.id]), /inmutables/);
  console.log("PASS ADMIN/MANAGER settings + responsible actor, other roles/guest denied GET/PUT, immutable revisions, cross-role concurrency, missing policy, no writes on quote or stale checkout, API money manipulation blocked");
  await save({ deliveryEnabled: false }); await call("POST", "/online-orders/quote", { items, deliveryType: "DELIVERY", deliveryCommune: "Santa Juana" }, null, 409);
  await save({ pickupEnabled: false }); await call("POST", "/online-orders/quote", { items, deliveryType: "PICKUP" }, null, 409);
  await save({ minimumProductsTotal: 15000 }); await call("POST", "/online-orders/quote", { items, deliveryType: "DELIVERY", deliveryCommune: "Santa Juana" }, null, 409);
  await save({ freeShippingFrom: 10000 }); assert.equal((await quote()).deliveryFee, "0.00");
  await save({ freeShippingFrom: null }); assert.equal((await quote()).deliveryFee, "3000.00");
  await call("POST", "/promotions", { name: "Descuento aislado", type: "PERCENTAGE_DISCOUNT", percentage: 20, isActive: true, startsAt: new Date(Date.now()-3600000).toISOString(), endsAt: null, productIds: [products[0].id], categoryIds: [] }, "ADMIN", 201);
  await save({ freeShippingFrom: 9000 }); const discounted = await quote(); assert.equal(discounted.productsNet, "8000.00"); assert.equal(discounted.deliveryFee, "3000.00");
  await save({ minimumProductsTotal: 9000 }); await call("POST", "/online-orders/quote", { items, deliveryType: "DELIVERY", deliveryCommune: "Santa Juana" }, null, 409);
  await save({});
  const quoted = await quote();
  await pool.query("update products set price=11000 where id=$1", [products[0].id]);
  await call("POST", "/online-orders/checkout", { ...checkout, quoteFingerprint: quoted.quoteFingerprint }, "CLIENT", 409);
  await pool.query("update products set price=10000 where id=$1", [products[0].id]);
  const payment = (await call("POST", "/online-orders/checkout", { ...checkout, quoteFingerprint: (await quote()).quoteFingerprint }, "CLIENT", 201)).data;
  assert.equal(payment.total, 11000); assert.equal(transactions.get(payment.token).amount, 11000);
  const snapshot = async () => (await pool.query("select total,products_subtotal,products_discount_total,delivery_fee,delivery_policy_revision_id,delivery_fee_reason from online_orders where id=$1", [payment.orderId])).rows[0];
  const frozen = await snapshot(); assert.equal(frozen.delivery_fee, "3000.00");
  assert.equal((await pool.query("select current_stock from products where id=$1", [products[0].id])).rows[0].current_stock, 100);
  await assert.rejects(pool.query("update online_orders set total=1 where id=$1", [payment.orderId]), /inmutables/);
  const callback = async (token, cancel = false) => fetch(base + "/online-orders/payments/webpay/return", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(cancel ? { TBK_TOKEN: token, TBK_ORDEN_COMPRA: transactions.get(token).buy_order, TBK_ID_SESION: transactions.get(token).session_id } : { token_ws: token }) });
  await callback(payment.token, true);
  await save({ flatFee: 9000 });
  for (const status of ["CANCELLED", "PAYMENT_FAILED", "EXPIRED"]) {
    await pool.query("update online_orders set status=$1 where id=$2", [status, payment.orderId]);
    await pool.query("update online_payments set status='FAILED' where order_id=$1", [payment.orderId]);
    const retry = (await call("POST", `/online-orders/${payment.orderId}/retry-payment`, {}, "CLIENT")).data;
    assert.equal(retry.total, 11000); assert.notEqual(retry.token, payment.token); assert.deepEqual(await snapshot(), frozen);
    await callback(retry.token, true);
  }
  const retry = (await call("POST", `/online-orders/${payment.orderId}/retry-payment`, {}, "CLIENT")).data;
  await callback(retry.token); await callback(retry.token);
  assert.equal((await pool.query("select current_stock from products where id=$1", [products[0].id])).rows[0].current_stock, 99);
  assert.equal((await pool.query("select count(*) from inventory_movements where online_order_id=$1", [payment.orderId])).rows[0].count, "1");
  const historical = (await call("GET", `/online-orders/${payment.orderId}`, null, "CLIENT")).data;
  assert.equal(historical.deliveryFee, "3000.00"); assert.equal(historical.total, "11000.00");
  const adminModel = (await call("GET", `/order-logistics/online/${payment.orderId}/administrative-summary`, null, "MANAGER")).data;
  assert.equal(adminModel.deliveryFee, "3000.00"); assert.equal(adminModel.paymentConfirmed, true);
  await call("GET", `/order-logistics/online/${payment.orderId}/administrative-summary`, null, "WAREHOUSE", 403);
  const { buildOrderCommercialModel } = await import("../dist/modules/onlineOrders/orderCommercialModel.js");
  const { renderPurchaseConfirmedMail } = await import("../dist/modules/notifications/purchaseConfirmedMail.js");
  const { renderOrderReceiptPdf } = await import("../dist/modules/onlineOrders/orderReceiptPdf.js");
  const model = buildOrderCommercialModel({ ...historical, createdAt: new Date(historical.createdAt), paidAt: new Date(historical.paidAt) });
  assert.match(renderPurchaseConfirmedMail(model).text, /despacho.*\$3\.000/i); assert.match(renderPurchaseConfirmedMail(model).html, /DEMO/);
  const pdf = await renderOrderReceiptPdf(model); assert.equal(pdf.subarray(0,5).toString(), "%PDF-");
  if (process.env.DELIVERY_PDF_OUTPUT) {
    await mkdir(path.dirname(process.env.DELIVERY_PDF_OUTPUT), { recursive: true });
    await writeFile(process.env.DELIVERY_PDF_OUTPUT, pdf);
    const many = { ...model, baseSubtotal: (Number(model.baseSubtotal) * 65).toFixed(2), totalDiscount: (Number(model.totalDiscount) * 65).toFixed(2),
      productsNet: (Number(model.productsNet) * 65).toFixed(2), total: (Number(model.productsNet) * 65 + Number(model.deliveryFee)).toFixed(2),
      items: Array.from({ length: 65 }, (_, index) => ({ ...model.items[0], productId: index + 1, productName: `Artículo de demostración con descripción extensa ${index + 1}` })) };
    await writeFile(process.env.DELIVERY_PDF_OUTPUT.replace(/\.pdf$/, "-multipage.pdf"), await renderOrderReceiptPdf(many));
  }
  const legacyRead = (await call("GET", `/online-orders/${legacy.id}`, null, "CLIENT")).data;
  assert.equal(buildOrderCommercialModel(legacyRead).deliveryFee, null);
  console.log("PASS thresholds after discounts, price changes, historical fee across cancelled/failed/expired retries, duplicate callback and stock idempotency, receipts/email/admin amounts");

  const session = randomBytes(32).toString("base64url");
  const challenge = (await pool.query("insert into email_verification_challenges(email,purpose,guest_session_hash,pin_hash,expires_at,last_sent_at,verified_at) values ('guest@example.test','GUEST_CHECKOUT',$1,$2,now()+interval '1 hour',now(),now()) returning id", [hash(session), hash("pin")])).rows[0].id;
  const guest = (await call("POST", "/online-orders/guest/checkout", { ...delivery, checkoutKey: "delivery-guest-000001", items, quoteFingerprint: (await quote()).quoteFingerprint,
    guestName: "Comprador Invitado", guestEmail: "guest@example.test", guestEmailConfirmation: "guest@example.test", guestPhone: "+56911111111", emailVerificationChallengeId: challenge }, null, 201, { "X-Guest-Session": session }));
  const cookie = guest.headers.get("set-cookie").split(";")[0];
  await callback(guest.data.token, true); await save({ flatFee: 1000 });
  await call("POST", `/online-orders/guest/device-orders/${guest.data.orderId}/retry-payment`, {}, null, 404);
  const guestRetry = (await call("POST", `/online-orders/guest/device-orders/${guest.data.orderId}/retry-payment`, {}, null, 200, { Cookie: cookie })).data;
  assert.equal(guestRetry.total, 17000);
  await callback(guestRetry.token); await callback(guestRetry.token);
  const now = new Date(), from = new Date(now); from.setHours(0,0,0,0); const to = new Date(from); to.setDate(to.getDate()+1);
  const { getManagerStatisticsService } = await import("../dist/modules/reports/managerStatistics.service.js");
  const stats = await getManagerStatisticsService({ from, toExclusive: to, fromLabel: "today", toLabel: "today" });
  assert.equal(stats.kpis.productsIncome, 16000); assert.equal(stats.kpis.deliveryIncome, 12000); assert.equal(stats.kpis.totalCollected, 28000);
  assert.equal(stats.kpis.unitsSold, 2); assert.equal(stats.topProducts[0].revenue, 16000);
  // 2x1 still applies per concrete product, never to delivery.
  await call("POST", "/promotions", { name: "2x1 aislado", type: "BUY_2_PAY_1", percentage: null, isActive: true, startsAt: new Date(Date.now()-3600000).toISOString(), endsAt: null, productIds: [products[1].id], categoryIds: [] }, "ADMIN", 201);
  const two = await quote("DELIVERY", [{ productId: products[1].id, quantity: 3 }]); assert.equal(two.productsNet, "10000.00"); assert.equal(two.total, "11000.00");
  const pick = await quote("PICKUP");
  const pickupPayment = (await call("POST", "/online-orders/checkout", { checkoutKey: "delivery-pickup-000001", items, deliveryType: "PICKUP", quoteFingerprint: pick.quoteFingerprint }, "CLIENT", 201)).data;
  assert.equal(pickupPayment.total, 8000);
  const pickupRow = (await pool.query("select delivery_fee,delivery_fee_reason from online_orders where id=$1", [pickupPayment.orderId])).rows[0];
  assert.deepEqual(pickupRow, { delivery_fee: "0.00", delivery_fee_reason: "PICKUP" });
  await callback(pickupPayment.token, true);
  const beforeRejected = transactions.size;
  for (const change of ["in_store_only=true", "status=false", "current_stock=0"]) {
    await pool.query(`update products set ${change} where id=$1`, [products[1].id]);
    await call("POST", "/online-orders/quote", { items: [{ productId: products[1].id, quantity: 1 }], deliveryType: "PICKUP" }, null, 409);
    await pool.query("update products set in_store_only=false,status=true,current_stock=100 where id=$1", [products[1].id]);
  }
  assert.equal(transactions.size, beforeRejected);
  console.log("PASS guest verified checkout/device protection/historical retry, products + delivery statistics separated, 2x1 remains per SKU");
  if (process.env.DELIVERY_VISUAL_TEST === "1") {
    const bcrypt = (await import("bcrypt")).default;
    await pool.query("update users set password=$1 where id=any($2::integer[])", [await bcrypt.hash("DemoReview#2026", 4), [users.ADMIN, users.CLIENT]]);
    await save({ flatFee: 3000 });
    console.log("VISUAL isolated API ready on 5188; admin@example.test / client@example.test; synthetic password DemoReview#2026; auto-stop in 5 minutes");
    await new Promise(resolve => { const timer = setTimeout(resolve, 300000); process.once("SIGINT", () => { clearTimeout(timer); resolve(); }); });
  }
} finally {
  if (server) await new Promise(r => server.close(r));
  if (applicationDb) await applicationDb.$client.end();
  await pool.end();
  await rm(folder, { recursive: true, force: true });
}

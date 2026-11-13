// Disposable cluster only. This suite never invokes seed or reads the local DB.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const root = new URL(process.env.FAMILY_TEST_DATABASE_URL || "http://missing");
assert.equal(root.hostname, "127.0.0.1"); assert.equal(root.port, "55444");
const control = new pg.Client({ connectionString: root.href });
const name = `fyf_family_administration_${randomBytes(8).toString("hex")}`;
let pool, server, applicationDb, created = false;
await control.connect();
try {
  assert.match((await control.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/"), /\/fyf-seed-audit-[a-f0-9]+\/data$/);
  await control.query(`CREATE DATABASE "${name}"`); created = true;
  const target = new URL(root); target.pathname = `/${name}`;
  pool = new pg.Pool({ connectionString: target.href });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const migrationFiles = readMigrationFiles({ migrationsFolder: "drizzle" });
  assert.equal((await pool.query("select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1")).rows[0].created_at, String(migrationFiles.at(-1).folderMillis));
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n, migrationFiles.length);
  Object.assign(process.env, { DATABASE_URL: target.href, NODE_ENV: "test", MAIL_ENABLED: "false", WEBPAY_ENVIRONMENT: "integration",
    SESSION_SECRET: randomBytes(32).toString("hex"), EMAIL_VERIFICATION_SECRET: randomBytes(32).toString("hex"), LOGISTICS_QR_SECRET: randomBytes(32).toString("hex") });
  const users = {};
  for (const [i, role] of ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"].entries()) {
    await pool.query("insert into roles(name) values ($1) on conflict(name) do nothing", [role]);
    const roleId = (await pool.query("select id from roles where name=$1", [role])).rows[0].id;
    users[role] = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,email_verified_at) values ($1,$2,'QA','Familias',$3,'unused',now()) returning id", [roleId, `1000000${i}-0`, `family-${role.toLowerCase()}@example.test`])).rows[0].id;
  }
  const categoryId = (await pool.query("insert into categories(name) values ('Categoría aislada') returning id")).rows[0].id;
  const { default: app } = await import("../dist/app.js");
  applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  await (await import("../dist/modules/deliverySettings/deliverySettings.service.js")).saveDeliverySettings(users.ADMIN, {
    expectedRevisionId: null, pickupEnabled: true, deliveryEnabled: true, flatFee: 3000, minimumProductsTotal: null, freeShippingFrom: null, isDemo: true,
  });
  const request = async (method, route, body, role = "ADMIN", expected = 200) => {
    if (method === "POST" && route === "/online-orders/checkout" && expected === 201) {
      const q = await fetch(base + "/online-orders/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: body.items, deliveryType: body.deliveryType }) });
      assert.equal(q.status, 200); body = { ...body, quoteFingerprint: (await q.json()).data.quoteFingerprint };
    }
    const res = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: users[role] }, process.env.SESSION_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await res.json(); assert.equal(res.status, expected, JSON.stringify(payload)); return payload;
  };
  let sequence = 0;
  const createFamily = async () => (await request("POST", "/product-families", { name: `Familia aislada ${++sequence}`, categoryId, attributes: [{ name: "Color", options: [{ label: "Verde" }, { label: "Negro" }] }, { name: "Medida", options: [{ label: "Grande" }] }] }, "ADMIN", 201)).data;
  const createProduct = async () => (await request("POST", "/products", { name: `Producto aislado ${++sequence}`, categoryId, price: 1990, unitMeasure: "unidad" }, "ADMIN", 201)).data;
  const list = async () => (await request("GET", "/product-families")).data;
  const archive = (family, role = "ADMIN", expected = 200) => request("POST", "/product-families/" + family.id + "/archive", { confirmed: true, expectedUpdatedAt: family.updatedAt }, role, expected);
  const reactivate = (family, role = "ADMIN", expected = 200) => request("POST", "/product-families/" + family.id + "/reactivate", { confirmed: true, expectedUpdatedAt: family.updatedAt }, role, expected);
  const snapshot = async () => {
    const state = {};
    for (const table of ["products", "product_families", "family_attributes", "family_attribute_options", "product_family_events", "product_variant_values"]) state[table] = (await pool.query("select row_to_json(t) row from " + table + " t order by row_to_json(t)::text")).rows;
    return state;
  };
  const empty = await createFamily();
  assert.equal(empty.management.state, "EMPTY"); assert.equal(empty.management.canArchive, true);
  let before = await snapshot();
  await request("DELETE", "/product-families/" + empty.id, null, null, 401);
  for (const role of ["MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"]) {
    await request("DELETE", "/product-families/" + empty.id, null, role, 403);
    await archive(empty, role, 403); await reactivate(empty, role, 403);
  }
  await archive(empty, null, 401); await reactivate(empty, null, 401);
  for (const id of [empty.id, "0", "invalid", "9999999"]) await request("DELETE", "/product-families/" + id, null, "ADMIN", 405);
  assert.deepEqual(await snapshot(), before);
  await request("POST", "/product-families/0/archive", { confirmed: true, expectedUpdatedAt: empty.updatedAt }, "ADMIN", 400);
  await request("POST", "/product-families/9999999/archive", { confirmed: true, expectedUpdatedAt: empty.updatedAt }, "ADMIN", 404);
  for (const body of [{}, { confirmed: false, expectedUpdatedAt: empty.updatedAt }, { confirmed: true, expectedUpdatedAt: "invalid" }, { confirmed: true, expectedUpdatedAt: empty.updatedAt, archivedAt: null }]) {
    await request("POST", "/product-families/" + empty.id + "/archive", body, "ADMIN", 400);
  }
  await assert.rejects(pool.query("insert into product_family_events(product_id,family_id,user_id,previous,next,reason) values (null,null,$1,'{}','{}','Invalid audit')", [users.ADMIN]), /subject_check/);
  const rawFamily = async (id) => (await pool.query("select * from product_families where id=$1", [id])).rows[0];
  const familyDefinition = ({ archived_at, updated_at, ...row }) => row;
  const familyEvents = async (id) => (await pool.query("select * from product_family_events where family_id=$1 order by id", [id])).rows;
  let archivedEmpty = (await archive(empty)).data;
  assert.equal(archivedEmpty.management.state, "ARCHIVED"); assert.ok(archivedEmpty.archivedAt);
  assert.equal((await familyEvents(empty.id)).length, 1);
  const restoredEmpty = (await reactivate(archivedEmpty)).data;
  assert.equal(restoredEmpty.management.state, "EMPTY"); assert.equal(restoredEmpty.archivedAt, null);
  assert.deepEqual(restoredEmpty.attributes, empty.attributes);
  assert.equal((await familyEvents(empty.id)).length, 2);
  console.log("PASS eliminación física retirada de la API, permisos ADMIN, confirmación y archivado/reactivación de familia nueva sin perder definiciones");

  const retained = await createFamily();
  const product = await createProduct();
  const classification = { familyId: retained.id, variantOptionIds: retained.attributes.map((a) => a.options[0].id) };
  await request("PATCH", "/products/" + product.id, classification);
  let current = (await list()).find((f) => f.id === retained.id);
  assert.equal(current.management.state, "IN_USE"); assert.equal(current.management.memberCount, 1);
  before = await snapshot();
  const blocked = await archive(current, "ADMIN", 409); assert.match(blocked.message, /procedimiento seguro/);
  assert.deepEqual(await snapshot(), before);
  await request("PATCH", "/products/" + product.id, { status: false });
  await archive(current, "ADMIN", 409);
  await request("PATCH", "/products/" + product.id, { familyId: null, variantOptionIds: [] }, "ADMIN", 409);
  await request("POST", "/product-families/variants/" + product.id + "/detach", { expectedFamilyId: retained.id,
    expectedOptionIds: classification.variantOptionIds, reason: "Clasificación administrativa de prueba", confirmed: true });
  current = (await list()).find((f) => f.id === retained.id);
  assert.equal(current.management.state, "EMPTY"); assert.equal(current.management.hasProductHistory, true);
  assert.equal(current.management.memberCount, 0); assert.equal(current.archivedAt, null);
  const definitionBefore = await rawFamily(retained.id);
  const oldEvents = await familyEvents(retained.id);
  const productBefore = (await pool.query("select * from products where id=$1", [product.id])).rows[0];
  const archived = (await archive(current)).data;
  assert.equal(archived.management.state, "ARCHIVED");
  assert.deepEqual(familyDefinition(await rawFamily(retained.id)), familyDefinition(definitionBefore));
  assert.deepEqual(archived.attributes, current.attributes);
  const allEvents = await familyEvents(retained.id);
  assert.deepEqual(allEvents.slice(0, -1), oldEvents);
  assert.equal(allEvents.at(-1).product_id, null); assert.equal(allEvents.at(-1).user_id, users.ADMIN);
  assert.equal(allEvents.at(-1).next.operation, "ARCHIVE");
  assert.equal(allEvents.at(-1).previous.archivedAt, null);
  await archive(current, "ADMIN", 409);
  await request("PATCH", "/products/" + product.id, { ...classification, associationReason: "No reactivar automáticamente" }, "ADMIN", 409);
  await request("POST", "/products", { name: "No debe crearse en familia archivada", categoryId, price: 100, unitMeasure: "unidad", ...classification }, "ADMIN", 409);
  await request("GET", "/catalog/families/" + retained.id, null, null, 404);
  await request("PATCH", "/product-families/" + retained.id, { name: retained.name, categoryId,
    attributes: retained.attributes.map((a) => ({ id: a.id, name: a.name, options: a.options.map((o) => ({ id: o.id, label: o.label })) })) }, "ADMIN", 409);
  const restored = (await reactivate(archived)).data;
  assert.equal(restored.management.state, "EMPTY"); assert.equal(restored.management.memberCount, 0);
  assert.deepEqual(restored.attributes, retained.attributes);
  assert.deepEqual((await pool.query("select * from products where id=$1", [product.id])).rows[0], productBefore);
  assert.equal((await familyEvents(retained.id)).at(-1).next.operation, "REACTIVATE");
  assert.equal((await familyEvents(retained.id)).at(-1).product_id, null);
  console.log("PASS vacío con historial archivado/reactivado: auditoría previa intacta, sin asociaciones recuperadas ni cambios de productos; archivado rechaza miembros incluso inactivos");

  for (const reference of ["previous", "next", "fk"]) {
    const family = await createFamily();
    await pool.query("insert into product_family_events(product_id,family_id,user_id,previous,next,reason) values ($1,$2,$3,$4,$5,'Referencia histórica aislada')", [product.id, reference === "fk" ? family.id : null, users.ADMIN, JSON.stringify(reference === "previous" ? { familyId: family.id } : {}), JSON.stringify(reference === "next" ? { familyId: family.id } : {})]);
    const original = (await pool.query("select * from product_family_events order by id")).rows;
    const state = (await list()).find((f) => f.id === family.id);
    assert.equal(state.management.hasProductHistory, true);
    const archivedReference = (await archive(state)).data;
    assert.deepEqual((await pool.query("select * from product_family_events order by id")).rows.slice(0, -1), original);
    await reactivate(archivedReference);
  }
  console.log("PASS referencias históricas por FK y JSON conservadas, sin borrado de auditorías");

  const waitForLocks = async (count) => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const { n } = (await pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event='advisory'")).rows[0];
      if (n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("La petición no esperó el bloqueo transaccional");
  };
  const queueRace = async (associateFirst) => {
    const family = await createFamily(); const sku = await createProduct();
    const lock = await pool.connect();
    let archival, association;
    try {
      await lock.query("begin"); await lock.query("select pg_advisory_xact_lock(hashtext('fyf-product-families'))");
      const associate = () => request("PATCH", "/products/" + sku.id, { familyId: family.id, variantOptionIds: family.attributes.map((a) => a.options[0].id) }, "ADMIN", associateFirst ? 200 : 409);
      const archiveFamily = () => archive(family, "ADMIN", associateFirst ? 409 : 200);
      if (associateFirst) association = associate(); else archival = archiveFamily();
      await waitForLocks(1);
      if (associateFirst) archival = archiveFamily(); else association = associate();
      await waitForLocks(2); await lock.query("commit");
      await Promise.all([archival, association]);
      const member = (await pool.query("select family_id from products where id=$1", [sku.id])).rows[0];
      assert.equal(member.family_id, associateFirst ? family.id : null);
      assert.equal(Boolean((await rawFamily(family.id)).archived_at), !associateFirst);
    } finally { await lock.query("rollback"); lock.release(); }
  };
  await queueRace(true); await queueRace(false);
  const double = await createFamily();
  const doubles = await Promise.all([200, 409].map(() => fetch(base + "/product-families/" + double.id + "/archive", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + jwt.sign({ id: users.ADMIN }, process.env.SESSION_SECRET) }, body: JSON.stringify({ confirmed: true, expectedUpdatedAt: double.updatedAt }) })));
  assert.deepEqual(doubles.map((res) => res.status).sort(), [200, 409]);
  assert.equal((await familyEvents(double.id)).length, 1);
  for (const table of ["sales", "sale_details", "online_orders", "online_payments", "inventory_movements", "sale_cancellation_requests"]) assert.equal((await pool.query("select count(*)::int n from " + table)).rows[0].n, 0);
  console.log("PASS concurrencia asociación/archivado en ambos órdenes y confirmación doble sin auditorías duplicadas; sin seed ni operaciones comerciales");

  // Exercise real local services against disposable fixtures, never seed or the habitual database.
  const detachableFamily = await createFamily();
  const first = await createProduct();
  const second = await createProduct();
  const initialOptions = detachableFamily.attributes.map((a) => a.options[0].id);
  await request("PATCH", `/products/${first.id}`, { familyId: detachableFamily.id, variantOptionIds: initialOptions, barcode: "990123450001" });
  await request("PATCH", `/products/${second.id}`, { familyId: detachableFamily.id,
    variantOptionIds: [detachableFamily.attributes[0].options[1].id, initialOptions[1]] });
  const detachRoute = `/product-families/variants/${first.id}/detach`;
  const detachBody = { expectedFamilyId: detachableFamily.id, expectedOptionIds: initialOptions,
    reason: "El mismo artículo se administrará como producto simple", confirmed: true };
  await request("POST", detachRoute, detachBody, null, 401);
  for (const role of ["MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"]) await request("POST", detachRoute, detachBody, role, 403);
  for (const body of [{ ...detachBody, confirmed: false }, { ...detachBody, reason: "" }, { ...detachBody, price: 1 },
    { ...detachBody, expectedOptionIds: [initialOptions[0], initialOptions[0]] }]) await request("POST", detachRoute, body, "ADMIN", 400);
  await request("POST", detachRoute, { ...detachBody, expectedOptionIds: [999999] }, "ADMIN", 409);
  const rawProduct = async (id) => (await pool.query("select * from products where id=$1", [id])).rows[0];
  const commercial = ({ family_id, variant_key, ...row }) => row;
  const auditRows = async (id) => (await pool.query("select * from product_family_events where product_id=$1 order by id", [id])).rows;
  const firstBefore = await rawProduct(first.id);
  const firstAuditCount = (await auditRows(first.id)).length;
  await request("POST", detachRoute, detachBody);
  assert.deepEqual(commercial(await rawProduct(first.id)), commercial(firstBefore));
  assert.equal((await rawProduct(first.id)).family_id, null);
  assert.equal((await pool.query("select count(*)::int n from product_variant_values where product_id=$1", [first.id])).rows[0].n, 0);
  const audit = await auditRows(first.id);
  assert.equal(audit.length, firstAuditCount + 1);
  assert.equal(audit.at(-1).family_id, detachableFamily.id); assert.equal(audit.at(-1).user_id, users.ADMIN);
  assert.equal(audit.at(-1).reason, detachBody.reason); assert.equal(audit.at(-1).previous.familyName, detachableFamily.name);
  assert.deepEqual(audit.at(-1).previous.attributes.map((a) => a.optionId), initialOptions);
  assert.deepEqual(audit.at(-1).previous.attributes.map((a) => a.label), ["Verde", "Grande"]);
  assert.equal(audit.at(-1).next.operation, "DETACH");
  await request("POST", detachRoute, detachBody, "ADMIN", 409);
  assert.equal((await auditRows(first.id)).length, audit.length);
  console.log("PASS desvinculación sin historial: confirmación/motivo, permisos, todos los datos comerciales intactos y una sola auditoría completa");

  // First assignment is still permitted. It is then protected by real sale/order/movement history.
  await request("PATCH", `/products/${first.id}`, { familyId: detachableFamily.id, variantOptionIds: initialOptions });
  await request("POST", "/inventory", { productId: first.id, movementType: "ENTRY", quantity: 20, reason: "Inventario aislado para comprobar historial" }, "ADMIN", 201);
  const sale = (await request("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId: first.id, quantity: 2 }] }, "CASHIER", 201)).data;
  await request("POST", `/sales/${sale.id}/returns`, { reason: "Devolución parcial aislada", details: [{ productId: first.id, quantity: 1 }] }, "ADMIN");
  const promotion = (await request("POST", "/promotions", { name: "Promoción aislada de desvinculación", type: "BUY_2_PAY_1", isActive: true,
    percentage: null, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), productIds: [first.id], categoryIds: [] }, "ADMIN", 201)).data;
  assert.ok(promotion.id);
  const sdk = (await import("transbank-sdk")).default;
  let webpayCalls = 0;
  sdk.WebpayPlus.Transaction.prototype.create = async (buyOrder, sessionId, amount) => {
    webpayCalls++; return { token: `isolated-detach-${webpayCalls}`, url: "https://webpay.example.test/pay", buyOrder, sessionId, amount };
  };
  const checkout = (await request("POST", "/online-orders/checkout", { checkoutKey: "isolated-detach-checkout-001", items: [{ productId: first.id, quantity: 2 }], deliveryType: "PICKUP", saveDeliveryAddress: false }, "CLIENT", 201)).data;
  assert.ok(checkout.orderId);
  const stableTables = ["sales", "sale_details", "sale_cancellation_requests", "sale_cancellation_request_items", "inventory_movements", "online_orders", "online_order_items", "online_payments", "promotions", "promotion_products", "product_images"];
  const operations = async () => Object.fromEntries(await Promise.all(stableTables.map(async (table) => [table, (await pool.query(`select row_to_json(t) row from ${table} t order by row_to_json(t)::text`)).rows])));
  const stable = await operations();
  const historicalProduct = await rawProduct(first.id);
  const availableBefore = (await request("GET", `/products/${first.id}`)).data;
  const protectedCount = (await auditRows(first.id)).length;
  await request("PATCH", `/products/${first.id}`, { name: "Otro artículo" }, "ADMIN", 409);
  await request("PATCH", `/products/${first.id}`, { familyId: detachableFamily.id, variantOptionIds: [detachableFamily.attributes[0].options[1].id, initialOptions[1]] }, "ADMIN", 409);
  await assert.rejects(pool.query("update products set family_id=null,variant_key=null where id=$1", [first.id]), /transactional ADMIN audit/);
  assert.deepEqual(await rawProduct(first.id), historicalProduct);
  // Concurrent confirmations: one commit, one controlled stale-state rejection, never duplicate audit.
  const confirmations = await Promise.all([200, 409].map(() => fetch(base + detachRoute, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: users.ADMIN }, process.env.SESSION_SECRET)}` }, body: JSON.stringify(detachBody) })));
  assert.deepEqual(confirmations.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await auditRows(first.id)).length, protectedCount + 1);
  assert.deepEqual(commercial(await rawProduct(first.id)), commercial(historicalProduct));
  assert.deepEqual(await operations(), stable);
  const availableAfter = (await request("GET", `/products/${first.id}`)).data;
  assert.equal(availableAfter.availableStock, availableBefore.availableStock);
  assert.equal(availableAfter.reservedQuantity, availableBefore.reservedQuantity); assert.equal(webpayCalls, 1);
  assert.equal((await request("GET", "/products/barcode/990123450001", null, "CASHIER")).data.id, first.id);
  assert.equal((await request("GET", `/catalog/products/${first.id}`, null, null)).data.id, first.id);
  assert.equal((await request("GET", `/catalog/families/${detachableFamily.id}`, null, null)).data.variants.some((p) => p.id === first.id), false);
  await request("PATCH", `/products/${first.id}`, { brand: "Otra marca" }, "ADMIN", 409);
  const wrongFamily = await createFamily();
  await request("PATCH", `/products/${first.id}`, { familyId: wrongFamily.id, variantOptionIds: wrongFamily.attributes.map((a) => a.options[0].id), associationReason: "Intento de identidad diferente" }, "ADMIN", 409);
  await request("PATCH", `/products/${first.id}`, { familyId: detachableFamily.id,
    variantOptionIds: [detachableFamily.attributes[0].options[1].id, initialOptions[1]], associationReason: "Intento de combinación diferente" }, "ADMIN", 409);
  await request("PATCH", `/products/${first.id}`, { familyId: detachableFamily.id, variantOptionIds: initialOptions,
    associationReason: "Recuperar exactamente la agrupación original" });
  await request("POST", detachRoute, detachBody);
  assert.deepEqual(await operations(), stable);
  console.log("PASS desvinculación con historial: ventas/devoluciones, reservas, Webpay simulado, snapshots, promociones, stock y barcode intactos; sin vía indirecta para cambiar identidad");

  await request("POST", `/product-families/variants/${second.id}/detach`, { ...detachBody,
    expectedOptionIds: [detachableFamily.attributes[0].options[1].id, initialOptions[1]] });
  const emptyWithHistory = (await list()).find((f) => f.id === detachableFamily.id);
  assert.equal(emptyWithHistory.management.memberCount, 0); assert.equal(emptyWithHistory.management.hasProductHistory, true);
  await request("DELETE", `/product-families/${detachableFamily.id}`, null, "ADMIN", 405);
  await request("PATCH", `/product-families/${detachableFamily.id}`, { name: detachableFamily.name, categoryId, attributes: detachableFamily.attributes.map((a) => ({ id: a.id, name: a.name + " diferente", options: a.options.map((o) => ({ id: o.id, label: o.label })) })) }, "ADMIN", 409);
  const allFamilies = await list();
  for (const family of allFamilies) assert.equal(family.management.state, family.archivedAt ? "ARCHIVED" : family.management.memberCount > 0 ? "IN_USE" : "EMPTY");
  const archivedHistorical = (await archive(emptyWithHistory)).data;
  assert.deepEqual(await operations(), stable);
  await reactivate(archivedHistorical);
  assert.deepEqual(await operations(), stable);
  console.log("PASS tres estados mutuamente excluyentes, auditoría y operaciones intactas al archivar/reactivar después de desvincular");
  if (process.env.FAMILY_ADMIN_VISUAL_SERVER === "1") {
    const { default: bcrypt } = await import("bcrypt");
    await pool.query("update users set password=$1 where id=$2", [await bcrypt.hash("FamilyQA123.", 10), users.ADMIN]);
    const visualFamily = await createFamily();
    const visualProducts = [await createProduct(), await createProduct()];
    for (const [index, sku] of visualProducts.entries()) await request("PATCH", `/products/${sku.id}`, {
      familyId: visualFamily.id, variantOptionIds: [visualFamily.attributes[0].options[index].id, visualFamily.attributes[1].options[0].id] });
    await request("POST", "/inventory", { productId: visualProducts[0].id, movementType: "ENTRY", quantity: 3, reason: "Historial de revisión visual aislada" }, "ADMIN", 201);
    console.log(`FAMILY_ADMIN_VISUAL_API=${base} FAMILY=${visualFamily.name} PRODUCTS=${JSON.stringify(visualProducts.map((p) => ({ id: p.id, name: p.name })))}`);
    // Test-only lifecycle endpoint, never registered by the production app.
    await new Promise((resolve) => app.post("/__family-admin-test/stop", (_req, res) => { res.sendStatus(204); resolve(); }));
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await applicationDb?.$client.end(); await pool?.end();
  if (created) await control.query(`DROP DATABASE "${name}"`);
  await control.end();
}

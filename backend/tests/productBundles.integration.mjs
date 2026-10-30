import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const url = new URL(process.env.BUNDLE_TEST_DATABASE_URL || "http://missing");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55447"); assert.equal(url.pathname, "/postgres");
const pool = new pg.Pool({ connectionString: url.href });
const dataDirectory = (await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/");
assert.match(dataDirectory, /\/fyf-bundle-test-[^/]+\/data$/);
const uploads = await mkdtemp(path.join(path.dirname(dataDirectory), "uploads-"));
let server, applicationDb;
try {
  if (process.env.BUNDLE_TEST_SCHEMA_READY !== "1") await (await import("./commercialHistory.integration.mjs")).testCommercialHistoryMigration(pool, url, dataDirectory);
  if (process.env.BUNDLE_TEST_SCHEMA_READY === "1") {
    assert.equal((await pool.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count, "43");
  } else await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  Object.assign(process.env, { DATABASE_URL: url.href, UPLOADS_ROOT: uploads, SESSION_SECRET: randomBytes(32).toString("hex"), EMAIL_VERIFICATION_SECRET: randomBytes(32).toString("hex"), LOGISTICS_QR_SECRET: randomBytes(32).toString("hex"), MAIL_ENABLED: "false", WEBPAY_ENVIRONMENT: "integration", NODE_ENV: "test" });
  const users = {}, password = await bcrypt.hash("IsolatedBundle2026!", 10);
  for (const [index, role] of ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"].entries()) {
    await pool.query("insert into roles(name) values($1) on conflict do nothing", [role]);
    users[role] = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) values ((select id from roles where name=$1),$2,$1,'Prueba',$3,$4,'ACTIVE',now()) returning id", [role, `${10000000 + index}-0`, `${role.toLowerCase()}@example.test`, password])).rows[0].id;
  }
  const categoryId = (await pool.query("insert into categories(name) values('Pruebas de variantes') returning id")).rows[0].id;
  const { default: app } = await import("../dist/app.js"); applicationDb = (await import("../dist/db/index.js")).db;
  server = app.listen(process.env.BUNDLE_VISUAL_TEST === "1" ? 5188 : 0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, route, body, role, expected = 200, imageBody = false, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { "Content-Type": imageBody ? "application/vnd.fyf.product-bundle+json" : "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: users[role] }, process.env.SESSION_SECRET)}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    if (Array.isArray(expected)) { assert.ok(expected.includes(response.status), `${method} ${route}: ${text}`); return {status:response.status,data:JSON.parse(text).data}; }
    assert.equal(response.status, expected, `${method} ${route}: ${text}`); return JSON.parse(text).data;
  };
  const body = () => ({ operationKey: randomUUID(), family: { name: `Pinturas ${randomUUID().slice(0, 5)}`, categoryId, brand: "Prueba", description: "Solo datos aislados", attributes: [{ name: "Color", options: [{ label: "Rojo" }, { label: "Azul" }] }, { name: "Presentación", options: [{ label: "1 L" }, { label: "2 L" }] }] }, unitMeasure: "unidad", variants: [{ name: `Rojo ${randomUUID()}`, selections: [0, 0], price: 1000, initialStock: 10, barcode: "99110001" }, { name: `Azul ${randomUUID()}`, selections: [1, 1], price: 2000, initialStock: 20, barcode: "99110002" }] });
  const tables = ["products", "product_families", "family_attributes", "family_attribute_options", "product_variant_values", "product_family_events", "inventory_movements", "product_images", "sales", "sale_details", "online_orders", "online_order_items"];
  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async t => [t, (await pool.query(`select row_to_json(t) r from ${t} t order by row_to_json(t)::text`)).rows])));
  const beforeOversized = await snapshot();
  const oversized = await fetch(base + "/product-families/bundle", {
    method: "POST",
    headers: { "Content-Type": "application/vnd.fyf.product-bundle+json", Authorization: `Bearer ${jwt.sign({ id: users.ADMIN }, process.env.SESSION_SECRET)}` },
    body: "x".repeat(22 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).message, /22 MB/);
  assert.deepEqual(await snapshot(), beforeOversized);
  assert.equal((await readdir(uploads, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).length, 0);
  console.log("PASS oversized bundle returns HTTP 413 without products, stock, audit or image writes");
  for (const role of [null, "MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"]) {
    await call("POST", "/product-families/bundle", body(), role, role ? 403 : 401);
    await call("GET", "/product-families/1/bundle", null, role, role ? 403 : 401);
    await call("GET", `/product-families/operations/${randomUUID()}`, null, role, role ? 403 : 401);
  }
  const simple = await call("POST", "/products", { categoryId, name: "Simple conservado", price: 990, unitMeasure: "unidad" }, "ADMIN", 201);
  const before = await snapshot(), payload = body();
  const [first, replay] = await Promise.all([call("POST", "/product-families/bundle", payload, "ADMIN"), call("POST", "/product-families/bundle", payload, "ADMIN")]);
  assert.deepEqual(first.productIds, replay.productIds); assert.notEqual(first.replayed, replay.replayed);
  const saved = await snapshot(); assert.equal(saved.products.length, 3); assert.equal(saved.inventory_movements.length, 2);
  for (const [i, id] of first.productIds.entries()) {
    const p = saved.products.find(p => p.r.id === id).r, m = saved.inventory_movements.find(m => m.r.product_id === id).r;
    assert.equal(p.current_stock, payload.variants[i].initialStock); assert.equal(m.quantity, p.current_stock); assert.equal(m.movement_type, "ENTRY"); assert.equal(m.user_id, users.ADMIN);
  }
  assert.deepEqual(saved.products.find(p => p.r.id === simple.id), before.products[0]);
  assert.deepEqual(await call("GET", `/product-families/operations/${payload.operationKey}`, null, "ADMIN"), { familyId: first.familyId, productIds: first.productIds });
  await call("POST", "/product-families/bundle", { ...payload, variants: payload.variants.map(v => ({ ...v, price: 5555 })) }, "ADMIN", 409);
  assert.deepEqual(await snapshot(), saved);
  console.log("PASS ADMIN only, simple products, concrete IDs, atomic ENTRY stock, simultaneous retry and durable recovery without duplicates");

  const invalid = body(); invalid.variants[1].selections = [0, 0]; await call("POST", "/product-families/bundle", invalid, "ADMIN", 400);
  const foreignBarcode = body(); foreignBarcode.variants[0].barcode = "99110001"; await call("POST", "/product-families/bundle", foreignBarcode, "ADMIN", 409);
  // Force a failure after the first product, movement and image were already inserted.
  await pool.query("create function fail_bundle_entry() returns trigger language plpgsql as $$ begin if NEW.reason like 'Stock inicial:%' and NEW.quantity=777 then raise exception 'isolated injected failure'; end if; return NEW; end $$; create trigger fail_bundle_entry before insert on inventory_movements for each row execute function fail_bundle_entry()");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII=";
  const failed = body(); failed.variants.forEach((v, i) => { v.barcode = null; v.imageIndexes = [0]; if (i) v.initialStock = 777; }); failed.images = [{ mimeType: "image/png", data: png, authorized: true }];
  await call("POST", "/product-families/bundle", failed, "ADMIN", 500, true);
  assert.deepEqual(await snapshot(), saved);
  assert.equal((await readdir(uploads, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).length, 0);
  await pool.query("drop trigger fail_bundle_entry on inventory_movements; drop function fail_bundle_entry()");
  console.log("PASS duplicate validation, collision rollback, injected intermediate failure rolls back family/products/ENTRY/audit/images and removes files");

  const imagesBody = body(); imagesBody.variants.forEach(v => { v.barcode = null; v.imageIndexes = [0]; }); imagesBody.images = [{ mimeType: "image/png", data: png, authorized: true }];
  const imageResult = await call("POST", "/product-families/bundle", imagesBody, "ADMIN", 200, true);
  const pics = (await pool.query("select * from product_images order by id")).rows;
  assert.equal(pics.length, 2); assert.notEqual(pics[0].image_path, pics[1].image_path);
  await call("DELETE", `/products/${pics[0].product_id}/images/${pics[0].id}`, null, "ADMIN");
  assert.ok((await readFile(path.join(uploads, pics[1].image_path))).length > 0);
  const unauthImage = body(); unauthImage.images = [{ ...imagesBody.images[0], authorized: false }]; await call("POST", "/product-families/bundle", unauthImage, "ADMIN", 400);
  console.log("PASS explicit image authorization, separate physical copies; deleting one image does not break another SKU");

  let bundle = await call("GET", `/product-families/${first.familyId}/bundle`, null, "ADMIN");
  assert.ok(bundle.variants.every(p => p.hasHistory));
  const edit = b => ({ operationKey: randomUUID(), familyId: first.familyId, expectedRevision: b.revision, family: { ...payload.family, attributes: b.family.attributes.map(a => ({ id: a.id, name: a.name, options: a.options.map(o => ({ id: o.id, label: o.label })) })) }, unitMeasure: "unidad", variants: b.variants.map(v => ({ id: v.id, name: v.name, price: Number(v.price), barcode: v.barcode, minimumStock: v.minimumStock, status: v.status, inStoreOnly: v.inStoreOnly, selections: b.family.attributes.map(a => a.options.findIndex(o => v.variantOptionIds.includes(o.id))) })) });
  const identity = edit(bundle); identity.variants[0].name = "Otro artículo"; await call("POST", "/product-families/bundle", identity, "ADMIN", 409);
  const directStock = edit(bundle); directStock.variants[0].initialStock = 100; await call("POST", "/product-families/bundle", directStock, "ADMIN", 400);
  const protectedBefore = await snapshot();
  for (const change of [
    b => { b.family.brand = "Otra marca"; },
    b => { b.family.categoryId = categoryId + 1; },
    b => { b.family.attributes.push({name:"Medida",options:[{label:"Única"}]});b.variants.forEach(v=>v.selections.push(0)); },
  ]) {
    const incompatible=edit(bundle);change(incompatible);
    await call("POST", "/product-families/bundle", incompatible, "ADMIN", 409);
    assert.deepEqual(await snapshot(),protectedBefore);
  }
  const update = edit(bundle); update.variants[0].price = 1500; update.family.attributes[0].options.push({ label: "Verde" }); update.variants.push({ name: "Verde nuevo 1 L", price: 1800, selections: [2, 0], initialStock: 7 });
  const updated = await call("POST", "/product-families/bundle", update, "ADMIN");
  assert.deepEqual(updated.productIds.slice(0, 2), first.productIds); assert.equal(updated.productIds.length, 3);
  await call("POST", "/product-families/bundle", { ...edit(bundle), operationKey: randomUUID() }, "ADMIN", 409);
  for (const [i, id] of first.productIds.entries()) assert.equal((await pool.query("select current_stock from products where id=$1", [id])).rows[0].current_stock, payload.variants[i].initialStock);
  console.log("PASS central price editing/new variants, optimistic concurrency, historical identity protection and no direct stock writes");

  const familyId = first.familyId, ids = updated.productIds;
  const page = await call("GET", `/catalog/products?search=${encodeURIComponent(payload.family.name)}&limit=20`);
  assert.equal(page.totalItems, 1); assert.equal(page.items[0].variants.length, 3);
  const filtered = await call("GET", "/catalog/products?search=Verde&limit=20"); assert.deepEqual(filtered.items.find(f => f.id === familyId).variants.map(v => v.id), [ids[2]]);
  const byPrice = await call("GET", `/catalog/products?search=${encodeURIComponent(payload.family.name)}&maxPrice=1600`); assert.deepEqual(byPrice.items[0].variants.map(v => v.id), [ids[0]]);
  await call("PATCH", `/products/${ids[1]}`, { status: false }, "ADMIN");
  assert.ok(!(await call("GET", `/catalog/products?search=${encodeURIComponent(payload.family.name)}`)).items[0].variants.some(v => v.id === ids[1]));
  await call("PATCH", `/products/${ids[1]}`, { status: true, inStoreOnly: true }, "ADMIN");
  assert.equal((await call("GET", `/catalog/products?search=${encodeURIComponent(payload.family.name)}`)).items[0].variants.find(v => v.id === ids[1]).inStoreOnly, true);
  await call("PATCH", `/products/${ids[1]}`, { inStoreOnly: false }, "ADMIN");
  const barcode = await call("GET", `/products/barcode/99110001`, null, "CASHIER"); assert.equal(barcode.id, ids[0]);
  const sale = await call("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId: ids[0], quantity: 2 }, { productId: ids[1], quantity: 1 }] }, "CASHIER", 201);
  const returned = await call("POST", `/sales/${sale.id}/returns`, { reason: "Prueba de devolución por variante", details: [{ productId: ids[0], quantity: 1 }] }, "ADMIN");
  await call("PATCH", `/sales/cancellation-requests/${returned.cancellationRequest.id}/undo`, {}, "ADMIN");
  assert.deepEqual((await pool.query("select product_id,quantity from sale_details where sale_id=$1 order by product_id", [sale.id])).rows, [{ product_id: ids[0], quantity: 2 }, { product_id: ids[1], quantity: 1 }]);
  console.log("PASS filtered options, grouping before pagination, inactive/in-store variants, exact barcode POS, sales and partial return/reversal per product");

  for (let i = 0; i < 21; i++) await pool.query("insert into products(category_id,name,price,unit_measure) values($1,$2,100,'unidad')", [categoryId, `Paginación aislada ${i}`]);
  const firstPage = await call("GET", "/catalog/products?limit=20&page=1");
  const secondPage = await call("GET", "/catalog/products?limit=20&page=2");
  assert.equal(firstPage.items.length, 20); assert.equal(firstPage.totalPages, 2);
  const groups = [...firstPage.items, ...secondPage.items].map(p => `${p.kind}:${p.id}`);
  assert.equal(new Set(groups).size, firstPage.totalItems); assert.equal(groups.filter(g => g === `family:${familyId}`).length, 1);
  const sdk = (await import("transbank-sdk")).default, transactions = new Map();
  sdk.WebpayPlus.Transaction.prototype.create = async (buyOrder, sessionId, amount) => {
    const token = `bundle-simulated-${transactions.size + 1}`; transactions.set(token, { buy_order: buyOrder, session_id: sessionId, amount }); return { token, url: "https://webpay.example.test/pay" };
  };
  sdk.WebpayPlus.Transaction.prototype.status = async token => ({ ...transactions.get(token), status: "INITIALIZED", response_code: -2 });
  sdk.WebpayPlus.Transaction.prototype.commit = async token => ({ ...transactions.get(token), status: "AUTHORIZED", response_code: 0, authorization_code: "123456", payment_type_code: "VD", transaction_date: new Date().toISOString() });
  await call("PUT", "/delivery-settings", { expectedRevisionId: null, pickupEnabled: true, deliveryEnabled: true, flatFee: 3000, minimumProductsTotal: null, freeShippingFrom: null, isDemo: true }, "ADMIN");
  await call("POST", "/promotions", { name: "2x1 por variante aislada", type: "BUY_2_PAY_1", isActive: true, percentage: null, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), productIds: ids.slice(0, 2), categoryIds: [] }, "MANAGER", 201);
  const items = ids.slice(0, 2).map(productId => ({ productId, quantity: 1 }));
  const quote = await call("POST", "/online-orders/quote", { items, deliveryType: "PICKUP" });
  assert.equal(Number(quote.total), 3500); // Different colors never form a shared 2x1 pair.
  const beforeStock = (await pool.query("select id,current_stock from products where id=any($1) order by id", [ids.slice(0, 2)])).rows;
  const order = await call("POST", "/online-orders/checkout", { items, deliveryType: "PICKUP", checkoutKey: randomUUID(), quoteFingerprint: quote.quoteFingerprint }, "CLIENT", 201);
  assert.equal(order.total, 3500); assert.equal(transactions.get(order.token).amount, 3500);
  for (const id of ids.slice(0, 2)) assert.equal((await call("GET", `/catalog/products/${id}`)).reservedQuantity, 1);
  assert.deepEqual((await pool.query("select id,current_stock from products where id=any($1) order by id", [ids.slice(0, 2)])).rows, beforeStock);
  const itemSnapshot = (await pool.query("select * from online_order_items where order_id=$1 order by product_id", [order.orderId])).rows;
  assert.deepEqual(itemSnapshot.map(i => i.product_id), ids.slice(0, 2));
  const callback = async (token, cancel = false) => fetch(base + "/online-orders/payments/webpay/return", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(cancel ? { TBK_TOKEN: token, TBK_ORDEN_COMPRA: transactions.get(token).buy_order, TBK_ID_SESION: transactions.get(token).session_id } : { token_ws: token }) });
  await callback(order.token, true);
  const retry = await call("POST", `/online-orders/${order.orderId}/retry-payment`, {}, "CLIENT");
  assert.notEqual(retry.token, order.token); assert.equal(transactions.get(retry.token).amount, order.total);
  await callback(retry.token); await callback(retry.token);
  for (const p of beforeStock) assert.equal((await pool.query("select current_stock from products where id=$1", [p.id])).rows[0].current_stock, p.current_stock - 1);
  assert.deepEqual((await pool.query("select * from online_order_items where order_id=$1 order by product_id", [order.orderId])).rows, itemSnapshot);
  console.log("PASS multi-page grouped catalog, two-variant cart, per-SKU 2x1, independent reserves, historical retry and duplicate Webpay simulated callback");

  // Lifecycle on an empty historical family preserves all commercial references.
  const frozenCommercial = (await snapshot());
  bundle = await call("GET", `/product-families/${imageResult.familyId}/bundle`, null, "ADMIN");
  for (const v of bundle.variants) await call("POST", `/product-families/variants/${v.id}/detach`, { expectedFamilyId: v.familyId, expectedOptionIds: v.variantOptionIds, reason: "Clasificación administrativa aislada", confirmed: true }, "ADMIN");
  let empty = (await call("GET", "/product-families", null, "ADMIN")).find(f => f.id === imageResult.familyId);
  assert.equal(empty.management.state, "EMPTY"); assert.equal(empty.management.canArchive, true);
  await call("POST", `/product-families/${empty.id}/archive`, { confirmed: true, expectedUpdatedAt: empty.updatedAt }, "ADMIN");
  empty = (await call("GET", "/product-families", null, "ADMIN")).find(f => f.id === empty.id); assert.ok(empty.archivedAt);
  await call("POST", `/product-families/${empty.id}/reactivate`, { confirmed: true, expectedUpdatedAt: empty.updatedAt }, "ADMIN");
  assert.equal((await pool.query("select count(*) from products where family_id=$1", [empty.id])).rows[0].count, "0");
  await call("DELETE", `/product-families/${empty.id}`, null, "ADMIN", 405);
  const inUse = (await call("GET", "/product-families", null, "ADMIN")).find(f => f.id === familyId);
  await call("POST", `/product-families/${familyId}/archive`, { confirmed: true, expectedUpdatedAt: inUse.updatedAt }, "ADMIN", 409);
  const afterLifecycle = await snapshot();
  for (const t of ["sales", "sale_details", "online_orders", "online_order_items", "inventory_movements"]) assert.deepEqual(afterLifecycle[t], frozenCommercial[t]);
  const durableReplay = await call("POST", "/product-families/bundle", payload, "ADMIN");
  assert.equal(durableReplay.replayed, true); assert.deepEqual(durableReplay.productIds, first.productIds);
  assert.deepEqual(await snapshot(), afterLifecycle);
  assert.equal((await pool.query("select count(*) from product_family_events where next->>'operationKey'=$1", [payload.operationKey])).rows[0].count, "1");
  console.log("PASS safe historical detach, archive/reactivate preserve audit and commercial data, no automatic reassociation and no physical deletion");
  if (process.env.BUNDLE_TEST_SCHEMA_READY === "1") {
    bundle = await call("GET", `/product-families/${first.familyId}/bundle`, null, "ADMIN");
    const reordered = edit(bundle);
    const optionIdsBefore = bundle.variants.map(v => [...v.variantOptionIds].sort((a,b)=>a-b));
    reordered.family.attributes[0].options.reverse();
    reordered.variants.forEach((v,i) => { v.selections[0] = reordered.family.attributes[0].options.findIndex(o => bundle.variants[i].variantOptionIds.includes(o.id)); });
    await call("POST", "/product-families/bundle", reordered, "ADMIN");
    const afterReorder = await call("GET", `/product-families/${first.familyId}/bundle`, null, "ADMIN");
    assert.deepEqual(afterReorder.variants.map(v => [...v.variantOptionIds].sort((a,b)=>a-b)), optionIdsBefore);
    const quoteInput={items,deliveryType:"PICKUP"};
    const unchangedCommercial = await snapshot();
    const qa = await call("POST", "/online-orders/quote", quoteInput);
    const settings = await call("GET", "/delivery-settings", null, "MANAGER");
    await call("PUT", "/delivery-settings", { expectedRevisionId: settings.id, deliveryEnabled: settings.deliveryEnabled, flatFee: Number(settings.flatFee), freeShippingFrom: settings.freeShippingFrom === null ? null : Number(settings.freeShippingFrom), isDemo: settings.isDemo }, "MANAGER");
    const qb = await call("POST", "/online-orders/quote", quoteInput);
    assert.notEqual(qa.quoteFingerprint,qb.quoteFingerprint); assert.equal(qa.commercialSignature,qb.commercialSignature);
    const changedQuantity = await call("POST", "/online-orders/quote", { ...quoteInput, items:[{...items[0],quantity:2},items[1]] });
    assert.notEqual(qb.commercialSignature,changedQuantity.commercialSignature);
    assert.deepEqual(await snapshot(),unchangedCommercial);
    const attemptsBefore=(await pool.query("select count(*) from online_payments")).rows[0].count;
    await call("POST", "/online-orders/checkout", {...quoteInput,checkoutKey:randomUUID(),quoteFingerprint:qa.quoteFingerprint}, "CLIENT",409);
    assert.equal((await pool.query("select count(*) from online_payments")).rows[0].count, attemptsBefore);
    console.log("PASS Parte A: stable option reordering, equivalent policy revision, authoritative per-item signature, read-only quotes, stale fingerprint creates no payment");
  }
  await (await import("./productConversion.integration.mjs")).testProductConversion({pool,call,categoryId,simple,users,snapshot,apiBase:base});
  await (await import("./variantStatus.integration.mjs")).testVariantStatus({pool,call,body,snapshot});
  await (await import("./manualDelivery.integration.mjs")).testManualDelivery({pool,call,base,users,snapshot,transactions,productId:ids[0]});
  await (await import("./unifiedCreation.integration.mjs")).testUnifiedCreation({pool,call,body,snapshot,users});
  await (await import("./unifiedEditing.integration.mjs")).testUnifiedEditing({pool,call,body,snapshot,uploads,users});
  await (await import("./productAttributeRename.integration.mjs")).testProductAttributeRename({pool,call,body,snapshot,users});
  await (await import("./commercialHistory.integration.mjs")).testCommercialHistory({pool,call,body,users,transactions,base});
  await (await import("./productNameCorrection.integration.mjs")).testProductNameCorrection({pool,call,body,users,base});
  await (await import("./familyCategory.integration.mjs")).testFamilyCategory({pool,call,body,users});
  await (await import("./familyDimension.integration.mjs")).testFamilyDimension({pool,call,body,users});
  await (await import("./familyBrand.integration.mjs")).testFamilyBrand({pool,call,body,users});
  await (await import("./familyOptionLabel.integration.mjs")).testFamilyOptionLabel({pool,call,body,users});
  await (await import("./productClassification.integration.mjs")).testProductClassification({pool,call,body,users,base});
  await (await import("./familyDeactivation.integration.mjs")).testFamilyDeactivation({pool,call,body,users});
  await (await import("./attributeMeasurements.integration.mjs")).testAttributeMeasurements({pool,call,body,users,base});
  if (process.env.BUNDLE_VISUAL_TEST === "1") {
    console.log("VISUAL isolated API ready 127.0.0.1:5188; login admin@example.test / IsolatedBundle2026!");
    if (process.env.BUNDLE_VISUAL_STOP_FILE) console.log(`VISUAL_STOP_FILE ${process.env.BUNDLE_VISUAL_STOP_FILE}`);
    await new Promise(resolve => {
      const done=()=>{clearInterval(poll);clearTimeout(timer);resolve();};
      const poll=setInterval(()=>{if(process.env.BUNDLE_VISUAL_STOP_FILE&&existsSync(process.env.BUNDLE_VISUAL_STOP_FILE))done();},500);
      const timer=setTimeout(done,900000);
    });
  }
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (applicationDb) await applicationDb.$client.end();
  await pool.end();
  if (!path.basename(uploads).startsWith("uploads-") || path.dirname(path.resolve(uploads)) !== path.resolve(path.dirname(dataDirectory))) throw new Error("Unsafe upload cleanup");
  await rm(uploads, { recursive: true, force: true });
}

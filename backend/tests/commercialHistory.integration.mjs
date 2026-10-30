import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function testCommercialHistoryMigration(pool, url, dataDirectory) {
  assert.equal(url.port, "55447"); assert.match(dataDirectory, /\/fyf-bundle-test-[^/]+\/data$/);
  const name = `history_upgrade_${randomUUID().replaceAll("-", "")}`;
  const folder = path.join(path.dirname(dataDirectory), "history-previous-schema");
  await pool.query(`create database "${name}"`);
  const isolated = new URL(url); isolated.pathname = `/${name}`;
  const legacy = new pg.Pool({ connectionString: isolated.href });
  try {
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    assert.equal(journal.entries.at(-1).tag, "0042_delivery_notice_image");
    await mkdir(path.join(folder, "meta"), { recursive: true });
    await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 33) }));
    for (const entry of journal.entries.slice(0, 33)) await copyFile(`drizzle/${entry.tag}.sql`, path.join(folder, `${entry.tag}.sql`));
    await migrate(drizzle(legacy), { migrationsFolder: folder });
    assert.equal((await legacy.query("select to_regclass('commercial_identity_snapshots') name")).rows[0].name, null);
    const role = (await legacy.query("insert into roles(name) values('ADMIN') returning id")).rows[0].id;
    const user = (await legacy.query("insert into users(role_id,rut,names,surnames,correo,password,status) values($1,'10999999-0','Historia','Prueba','history@example.test','unused','ACTIVE') returning id", [role])).rows[0].id;
    const category = (await legacy.query("insert into categories(name) values('Categoría de referencia') returning id")).rows[0].id;
    const product = (await legacy.query("insert into products(category_id,name,brand,unit_measure,price,current_stock) values($1,'Nombre actual del legado','Marca de referencia','caja',2000,10) returning id", [category])).rows[0].id;
    const sale = (await legacy.query("insert into sales(user_id,payment_method,total) values($1,'efectivo',1000) returning id", [user])).rows[0].id;
    await legacy.query("insert into sale_details(sale_id,product_id,quantity,unit_price,subtotal) values($1,$2,2,500,1000)", [sale, product]);
    const order = (await legacy.query("insert into online_orders(client_id,checkout_key,status,total,delivery_type,reservation_expires_at) values($1,'legacy-history-order','CANCELLED',1500,'PICKUP',now()-interval '1 day') returning id", [user])).rows[0].id;
    await legacy.query("insert into online_order_items(order_id,product_id,quantity,unit_price,subtotal) values($1,$2,1,1500,1500)", [order, product]);
    await legacy.query("insert into inventory_movements(product_id,user_id,movement_type,quantity,reason) values($1,$2,'ENTRY',10,'Referencia aislada anterior')", [product, user]);
    const policy = (await legacy.query("insert into delivery_policy_revisions(version,pickup_enabled,delivery_enabled,flat_fee,is_demo,created_by) values(1,true,false,3000,true,$1) returning id", [user])).rows[0].id;
    const request = (await legacy.query("insert into delivery_quote_requests(client_id,request_key,request_hash,recipient_name,phone,address,commune,policy_revision_id,commercial_snapshot,evaluation_expires_at) values($1,'legacy-history-quote',$2,'Receptor','12345678','Dirección de prueba','Concepción',$3,'{}',now()+interval '72 hours') returning id", [user, "a".repeat(64), policy])).rows[0].id;
    await legacy.query("insert into delivery_quote_items(request_id,product_id,quantity,product_name,unit_measure) values($1,$2,1,'Nombre original comprobado','saco')", [request, product]);
    // A real pre-snapshot family verifies that brand correction preserves LEGACY_REFERENCE.
    const legacyBrand=await legacy.connect();let legacyBrandFamily,legacyBrandProduct;
    try{
      await legacyBrand.query("begin");
      legacyBrandFamily=(await legacyBrand.query("insert into product_families(category_id,name,brand) values($1,'Familia marca legado','Marca legdao') returning id",[category])).rows[0].id;
      const a=(await legacyBrand.query("insert into family_attributes(family_id,name) values($1,'Medida') returning id",[legacyBrandFamily])).rows[0].id;
      const o=(await legacyBrand.query("insert into family_attribute_options(attribute_id,label) values($1,'400 ml') returning id",[a])).rows[0].id;
      legacyBrandProduct=(await legacyBrand.query("insert into products(category_id,family_id,variant_key,name,brand,unit_measure,price) values($1,$2,$3,'SKU marca legado','Marca legdao','unidad',1000) returning id",[category,legacyBrandFamily,String(o)])).rows[0].id;
      await legacyBrand.query("insert into product_variant_values(product_id,family_id,attribute_id,option_id) values($1,$2,$3,$4)",[legacyBrandProduct,legacyBrandFamily,a,o]);
      await legacyBrand.query("insert into inventory_movements(product_id,user_id,movement_type,quantity,reason) values($1,$2,'ENTRY',1,'Captura referencial de prueba')",[legacyBrandProduct,user]);
      await legacyBrand.query("commit");
    }catch(e){await legacyBrand.query("rollback");throw e;}finally{legacyBrand.release();}
    const sources = ["sale_details", "online_order_items", "inventory_movements", "delivery_quote_items", "products", "online_orders"];
    const snapshot = async () => Object.fromEntries(await Promise.all(sources.map(async table => [table, (await legacy.query(`select row_to_json(t) r from ${table} t order by row_to_json(t)::text`)).rows])));
    const before = await snapshot();
    // First upgrade to 0035, so 0036 is also checked with a populated historical family.
    await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 36) }));
    for (const entry of journal.entries.slice(33, 36)) await copyFile(`drizzle/${entry.tag}.sql`, path.join(folder, `${entry.tag}.sql`));
    await migrate(drizzle(legacy), { migrationsFolder: folder });
    await migrate(drizzle(legacy), { migrationsFolder: folder });
    assert.deepEqual(await snapshot(), before);
    const captures = (await legacy.query("select * from commercial_identity_snapshots order by id")).rows;
    assert.equal(captures.length, 5); assert.equal(captures.filter(c => c.origin === "LEGACY_REFERENCE").length, 4);
    const partial = captures.find(c => c.origin === "LEGACY_PARTIAL");
    assert.equal(partial.identity.name, "Nombre original comprobado"); assert.equal(partial.identity.unitMeasure, "saco");
    assert.equal(partial.identity.brand, "Marca de referencia");
    for (const c of captures) assert.ok(c.captured_at);
    await assert.rejects(legacy.query("update commercial_identity_snapshots set origin='ORIGINAL'"), /immutable/);
    const first = captures[0];
    await assert.rejects(legacy.query("delete from commercial_identity_snapshots where id=$1", [first.id]), /immutable/);
    await legacy.query("update products set barcode='123456' where id=$1", [product]);
    assert.deepEqual((await legacy.query("select * from commercial_identity_snapshots order by id")).rows, captures);
    await legacy.query("update sale_details set returned_quantity=1 where sale_id=$1", [sale]);
    assert.equal((await legacy.query("select returned_quantity from sale_details where sale_id=$1", [sale])).rows[0].returned_quantity, 1);
    await assert.rejects(legacy.query("update sale_details set unit_price=999 where sale_id=$1", [sale]), /cannot change/);
    await assert.rejects(legacy.query("update products set name='Nombre no autorizado' where id=$1", [product]), /Name correction requires/);
    await legacy.query("update online_orders set status='DELIVERED' where id=$1",[order]);
    await legacy.query("update delivery_quote_requests set status='CANCELLED',version=version+1 where id=$1",[request]);
    const transaction=await legacy.connect();
    try {
      await transaction.query("begin");
      await transaction.query("insert into product_family_events(product_id,user_id,reason,previous,next) select id,$2,'Corrección descriptiva de referencia',jsonb_build_object('product',to_jsonb(p),'transactionId',pg_current_xact_id()::text),jsonb_build_object('operation','PRODUCT_NAME_CORRECTION','operationKey',$3::text,'requestHash',$4::text,'name','Nombre del legado corregido','revision',(updated_at+interval '1 millisecond')::text) from products p where id=$1",[product,user,randomUUID(),'c'.repeat(64)]);
      await transaction.query("update products set name='Nombre del legado corregido',updated_at=updated_at+interval '1 millisecond' where id=$1",[product]);
      await transaction.query("commit");
    } catch(e) {await transaction.query("rollback");throw e;} finally {transaction.release();}
    assert.deepEqual((await legacy.query("select * from commercial_identity_snapshots order by id")).rows,captures);
    const classification=await legacy.connect();
    try{
      await classification.query("begin");
      const fid=(await classification.query("insert into product_families(category_id,name) values($1,'Familia anterior a 0036') returning id",[category])).rows[0].id;
      const aid=(await classification.query("insert into family_attributes(family_id,name,position) values($1,'Medida',0) returning id",[fid])).rows[0].id;
      const oid=(await classification.query("insert into family_attribute_options(attribute_id,label,position) values($1,'400 ml',0) returning id",[aid])).rows[0].id;
      const pid=(await classification.query("insert into products(category_id,family_id,variant_key,name,unit_measure,price,current_stock) values($1,$2,$3,'Variante histórica anterior a 0036','unidad',1000,2) returning id",[category,fid,String(oid)])).rows[0].id;
      await classification.query("insert into product_variant_values(product_id,family_id,attribute_id,option_id) values($1,$2,$3,$4)",[pid,fid,aid,oid]);
      await classification.query("insert into inventory_movements(product_id,user_id,movement_type,quantity,reason) values($1,$2,'ENTRY',2,'Entrada anterior a ampliación')",[pid,user]);
      await classification.query("commit");
    }catch(e){await classification.query("rollback");throw e;}finally{classification.release();}
    const familyTables=["product_families","family_attributes","family_attribute_options","products","product_variant_values","commercial_identity_snapshots","inventory_movements"];
    const familyState=async()=>Object.fromEntries(await Promise.all(familyTables.map(async table=>[table,(await legacy.query(`select to_jsonb(t) r from ${table} t order by to_jsonb(t)::text`)).rows])));
    await legacy.query("insert into family_attribute_options(attribute_id,label) select id,v.label from family_attributes cross join (values('Duplicada'),('  DUPLICADA  ')) v(label) where family_id=$1",[legacyBrandFamily]);
    const beforeDimensionMigration=await familyState();
    await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,37)}));
    await copyFile("drizzle/0036_controlled_family_dimension.sql",path.join(folder,"0036_controlled_family_dimension.sql"));
    await migrate(drizzle(legacy),{migrationsFolder:folder});
    assert.equal((await legacy.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count,"37");
    assert.equal((await legacy.query("select to_regprocedure('fyf_verify_family_brand_audit()') is not null ready")).rows[0].ready,false);
    assert.deepEqual(await familyState(),beforeDimensionMigration);
    await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,38)}));
    await copyFile("drizzle/0037_controlled_family_brand.sql",path.join(folder,"0037_controlled_family_brand.sql"));
    await migrate(drizzle(legacy),{migrationsFolder:folder});
    assert.equal((await legacy.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count,"38");
    assert.equal((await legacy.query("select to_regprocedure('fyf_verify_option_label_audit()') is not null ready")).rows[0].ready,false);
    // Establish a populated 0040 baseline, then exercise the pending 0041–0042 migrations.
    await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries:journal.entries.slice(0,41)}));
    for(const entry of journal.entries.slice(38,41))await copyFile(`drizzle/${entry.tag}.sql`,path.join(folder,`${entry.tag}.sql`));
    await migrate(drizzle(legacy),{migrationsFolder:folder});assert.deepEqual(await familyState(),beforeDimensionMigration);
    const preMeasurement=await familyState();
    await migrate(drizzle(legacy),{migrationsFolder:"drizzle"});await migrate(drizzle(legacy),{migrationsFolder:"drizzle"});
    const postMeasurement=await familyState();
    for(const row of postMeasurement.family_attributes){assert.equal(row.r.measurement_kind,null);assert.equal(row.r.unit_code,null);delete row.r.measurement_kind;delete row.r.unit_code;}
    assert.deepEqual(postMeasurement,preMeasurement);
    assert.equal((await legacy.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count,"43");
    console.log("PASS 0040→0042 PG16.15: legacy definitions stay text, option labels/IDs/keys/stock and all prior snapshots remain byte-equivalent, replay unchanged");
    assert.equal((await legacy.query("select to_regprocedure('fyf_check_simple_classification(products,products)') is not null ready")).rows[0].ready,true);
    assert.equal((await legacy.query("select to_regprocedure('fyf_verify_option_label_audit()') is not null ready")).rows[0].ready,true);
    assert.equal((await legacy.query("select to_regprocedure('fyf_verify_family_brand_audit()') is not null ready")).rows[0].ready,true);
    const brandCapture=(await legacy.query("select * from commercial_identity_snapshots where product_id=$1",[legacyBrandProduct])).rows;
    const brandTx=await legacy.connect();
    try{
      await brandTx.query("begin");const key=randomUUID(),revision="a".repeat(64);
      const auth=(await brandTx.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,'Corrección descriptiva del legado',jsonb_build_object('state',fyf_dimension_state($1),'revision',$3::text,'transactionId',pg_current_xact_id()::text),jsonb_build_object('operation','FAMILY_BRAND_AUTHORIZATION','operationKey',$4::text,'requestHash',$3::text,'brand','Marca legado')) returning id",[legacyBrandFamily,user,revision,key])).rows[0].id;
      await brandTx.query("update product_families set brand='Marca legado',updated_at=now() where id=$1",[legacyBrandFamily]);
      await brandTx.query("update products set brand='Marca legado',updated_at=now() where family_id=$1",[legacyBrandFamily]);
      await brandTx.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,'Corrección descriptiva del legado',jsonb_build_object('revision',$3::text),jsonb_build_object('operation','FAMILY_BRAND_CORRECTION','operationKey',$4::text,'requestHash',$3::text,'brand','Marca legado','previousBrand','Marca legdao','authorizationId',$5::integer,'productIds',jsonb_build_array($6::integer),'revision',$3::text))",[legacyBrandFamily,user,revision,key,auth,legacyBrandProduct]);
      await brandTx.query("commit");
    }catch(e){await brandTx.query("rollback");throw e;}finally{brandTx.release();}
    assert.deepEqual((await legacy.query("select * from commercial_identity_snapshots where product_id=$1",[legacyBrandProduct])).rows,brandCapture);
    assert.equal(brandCapture[0].origin,"LEGACY_REFERENCE");assert.equal(brandCapture[0].identity.brand,"Marca legdao");
    const oldOption=brandCapture[0].identity.family.attributes[0],labelTx=await legacy.connect();
    try{
      await labelTx.query("begin");const key=randomUUID(),r="b".repeat(64);
      const auth=(await labelTx.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,'Corrección de formato del legado',jsonb_build_object('state',fyf_dimension_state($1),'revision',$3::text,'transactionId',pg_current_xact_id()::text),jsonb_build_object('operation','OPTION_LABEL_AUTHORIZATION','operationKey',$4::text,'requestHash',$3::text,'attributeId',$5::integer,'optionId',$6::integer,'label','400ml','productIds',jsonb_build_array($7::integer))) returning id",[legacyBrandFamily,user,r,key,oldOption.attributeId,oldOption.optionId,legacyBrandProduct])).rows[0].id;
      await labelTx.query("update family_attribute_options set label='400ml' where id=$1",[oldOption.optionId]);
      await labelTx.query("insert into product_family_events(family_id,user_id,reason,previous,next) values($1,$2,'Corrección de formato del legado',jsonb_build_object('revision',$3::text),jsonb_build_object('operation','OPTION_LABEL_CORRECTION','operationKey',$4::text,'requestHash',$3::text,'attributeId',$5::integer,'optionId',$6::integer,'label','400ml','previousLabel','400 ml','productIds',jsonb_build_array($7::integer),'authorizationId',$8::integer,'revision',$3::text))",[legacyBrandFamily,user,r,key,oldOption.attributeId,oldOption.optionId,legacyBrandProduct,auth]);
      await labelTx.query("commit");
    }catch(e){await labelTx.query("rollback");throw e;}finally{labelTx.release();}
    assert.deepEqual((await legacy.query("select * from commercial_identity_snapshots where product_id=$1",[legacyBrandProduct])).rows,brandCapture);
    console.log("PASS 0037→0039 sin modificar etiquetas legadas duplicadas por espacios; corrección auditada conserva LEGACY_REFERENCE, IDs y combinaciones");
    console.log("PASS 0037: marca corregida en familia histórica pre-0033, captura LEGACY_REFERENCE intacta sin fingir ORIGINAL");
    console.log("PASS historial: migración 0032→0033, legado referencial explícito, nombre/unidad comprobados de cotización preservados, replay, filas/importes/fechas intactos y bloqueo de nombre vigente");
    console.log("PASS migración 0035→0036 con familia, atributo, opción, SKU, ENTRY y captura preexistentes intactos; replay sin backfill");
  } finally {
    await legacy.end(); await pool.query(`drop database "${name}"`);
    assert.equal(path.resolve(path.dirname(folder)), path.resolve(path.dirname(dataDirectory)));
    await rm(folder, { recursive: true, force: true });
  }
}

export async function testCommercialHistory({ pool, call, body, users, transactions, base }) {
  const request = body(); request.variants.forEach(v => { v.barcode = null; });
  const created = await call("POST", "/product-families/bundle", request, "ADMIN", 200, true);
  const productId = created.productIds[0];
  const rawProduct = (await pool.query("select * from products where id=$1", [productId])).rows[0];
  const sale = await call("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId, quantity: 2 }] }, "CASHIER", 201);
  const detail = sale.details.find(item => item.productId === productId);
  assert.equal(detail.historicalIdentity.origin, "ORIGINAL"); assert.equal(detail.productName, rawProduct.name);
  assert.equal(detail.historicalIdentity.identity.family.id, created.familyId);
  assert.equal(detail.historicalIdentity.identity.variantKey, rawProduct.variant_key);
  assert.equal(detail.historicalIdentity.identity.family.attributes.length, 2);
  assert.equal(Number(detail.unitPrice), Number(rawProduct.price)); assert.equal(detail.quantity, 2);
  const capturesBefore = (await pool.query("select * from commercial_identity_snapshots where product_id=$1 order by id", [productId])).rows;
  assert.equal(capturesBefore.length, 3); // Initial ENTRY, sale line, sale EXIT.
  users.HISTORY_CLIENT = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'19999999-0','Historial','Cliente','history-client@example.test',password,'ACTIVE',now() from users where id=$1 returning id", [users.CLIENT])).rows[0].id;
  const input = { items: [{ productId, quantity: 1 }], deliveryType: "PICKUP" };
  const quote = await call("POST", "/online-orders/quote", input);
  const order = await call("POST", "/online-orders/checkout", { ...input, checkoutKey: randomUUID(), quoteFingerprint: quote.quoteFingerprint }, "HISTORY_CLIENT", 201);
  let stored = await call("GET", `/online-orders/${order.orderId}`, null, "HISTORY_CLIENT");
  assert.equal(stored.items[0].historicalIdentity.origin, "ORIGINAL"); assert.equal(stored.items[0].productName, rawProduct.name);
  const economic = await pool.query("select total,products_subtotal,products_discount_total,delivery_fee from online_orders where id=$1", [order.orderId]);
  const current = await call("GET", `/product-families/${created.familyId}/bundle`, null, "ADMIN");
  await call("POST", `/product-families/${created.familyId}/attributes/${current.family.attributes[0].id}/rename`, {
    name: "Tono descriptivo", reason: "Corrección descriptiva posterior a la venta", confirmed: true, expectedRevision: current.revision, operationKey: randomUUID() }, "ADMIN");
  // The purpose is to test immutable identity after a permitted catalog edit,
  // not to bypass an operational/retryable order created by this same fixture.
  assert.equal(stored.status, "PENDING_PAYMENT");
  const pendingState = async () => Object.fromEntries(await Promise.all([
    "products", "product_family_events", "commercial_identity_snapshots", "inventory_movements", "online_orders", "online_order_items", "online_payments",
  ].map(async table => [table, (await pool.query(`select to_jsonb(t) r from ${table} t order by to_jsonb(t)::text`)).rows])));
  const beforeBlocked = await pendingState();
  await call("PATCH", `/products/${productId}`, { barcode: "997755332211", description: "No debe aplicarse parcialmente", price: 3456 }, "ADMIN", 409);
  assert.deepEqual(await pendingState(), beforeBlocked);
  const callback = await fetch(`${base}/online-orders/payments/webpay/return`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token_ws: order.token }) });
  assert.equal(callback.status, 303);
  assert.equal(transactions.get(order.token).amount, Number(economic.rows[0].total));
  // A paid but undelivered order remains operational. Complete the simulated
  // pickup through normal APIs, without rewriting SQL states or snapshots.
  await call("PATCH", `/products/${productId}`, { barcode: "997755332211" }, "ADMIN", 409);
  for (const action of ["start-preparation", "finish-preparation"]) await call("POST", `/order-logistics/online/${order.orderId}/${action}`, {}, "WAREHOUSE");
  await call("POST", `/order-logistics/online/${order.orderId}/complete-delivery`, { receiverName: "Receptor de prueba", receiverRut: "11111111-1" }, "WAREHOUSE");
  assert.equal((await call("GET", `/online-orders/${order.orderId}`, null, "HISTORY_CLIENT")).status, "DELIVERED");
  const identityBeforeEdit = (await pool.query("select * from commercial_identity_snapshots where product_id=$1 order by id", [productId])).rows;
  await call("PATCH", `/products/${productId}`, { barcode: "997755332211", description: "Información actualizada del catálogo", price: 3456 }, "ADMIN");
  assert.equal((await pool.query("select barcode from products where id=$1", [productId])).rows[0].barcode, "997755332211");
  assert.deepEqual((await pool.query("select * from commercial_identity_snapshots where product_id=$1 order by id", [productId])).rows, identityBeforeEdit);
  const oldSale = await call("GET", `/sales/${sale.id}`, null, "ADMIN");
  assert.equal(oldSale.details[0].productBarcode, null);
  assert.equal(oldSale.details[0].historicalIdentity.identity.family.attributes[0].name, request.family.attributes[0].name);
  assert.equal(Number(oldSale.details[0].unitPrice), Number(rawProduct.price));
  assert.deepEqual((await pool.query("select total,products_subtotal,products_discount_total,delivery_fee from online_orders where id=$1", [order.orderId])).rows, economic.rows);
  const returnResult = await call("POST", `/sales/${sale.id}/returns`, { reason: "Devolución con identidad conservada", details: [{ productId, quantity: 1 }] }, "ADMIN");
  assert.ok(returnResult);
  assert.equal((await call("GET", `/sales/${sale.id}`, null, "ADMIN")).details[0].returnedQuantity, 1);
  for (const field of [{ name: "Otro nombre" }, { unitMeasure: "caja" }, { brand: "Otro fabricante" }]) await call("PATCH", `/products/${productId}`, field, "ADMIN", 409);
  stored = await call("GET", `/online-orders/${order.orderId}`, null, "HISTORY_CLIENT");
  assert.equal(stored.items[0].productName, rawProduct.name); assert.equal(stored.items[0].historicalIdentity.identity.barcode, null);
  const { getClientOrderReceiptService } = await import("../dist/modules/onlineOrders/onlineOrders.service.js");
  const model = await getClientOrderReceiptService(users.HISTORY_CLIENT, order.orderId);
  assert.equal(model.items[0].identityNote, "Identidad registrada al crear la operación");
  assert.equal(model.items[0].historicalIdentity.identity.family.attributes[0].name, request.family.attributes[0].name);
  const { renderOrderReceiptPdf } = await import("../dist/modules/onlineOrders/orderReceiptPdf.js");
  assert.equal((await renderOrderReceiptPdf(model)).subarray(0, 4).toString(), "%PDF");
  const { buildSaleSummaryModel, renderSaleSummaryPdf } = await import("../dist/modules/sales/saleSummaryPdf.js");
  const { getSaleByIdService } = await import("../dist/modules/sales/sales.service.js");
  const saleModel = buildSaleSummaryModel(await getSaleByIdService(sale.id));
  assert.equal(saleModel.items[0].productName, rawProduct.name);
  assert.equal(saleModel.items[0].identityNote, "Identidad registrada al crear la operación");
  assert.equal((await renderSaleSummaryPdf(saleModel)).subarray(0, 4).toString(), "%PDF");
  const identity = (await pool.query("select * from commercial_identity_snapshots where sale_id=$1", [sale.id])).rows[0];
  await assert.rejects(pool.query("update commercial_identity_snapshots set identity='{}' where id=$1", [identity.id]), /immutable/);
  await assert.rejects(pool.query("update online_order_items set quantity=2,subtotal=unit_price*2 where order_id=$1", [order.orderId]), /cannot change/);
  await assert.rejects(pool.query("update inventory_movements set quantity=999 where product_id=$1", [productId]), /cannot change/);
  await assert.rejects(pool.query("truncate commercial_identity_snapshots"), /immutable/);
  await assert.rejects(pool.query("insert into commercial_identity_snapshots(product_id,sale_id,origin,identity) values($1,$2,'ORIGINAL',$3)", [productId, sale.id, identity.identity]), /must originate/);
  const rowCount = (await pool.query("select count(*)::int n from commercial_identity_snapshots")).rows[0].n;
  const transaction = await pool.connect();
  try {
    await transaction.query("begin");
    await transaction.query("insert into inventory_movements(product_id,user_id,movement_type,quantity,reason) values($1,$2,'ENTRY',1,'Rollback de captura')", [productId, users.ADMIN]);
    await transaction.query("rollback");
  } finally { transaction.release(); }
  assert.equal((await pool.query("select count(*)::int n from commercial_identity_snapshots")).rows[0].n, rowCount);
  // A deliberately failed capture must roll back its complete commercial transaction.
  const tables = ["sales", "sale_details", "inventory_movements", "commercial_identity_snapshots", "products"];
  const beforeFailure = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, (await pool.query(`select row_to_json(t) r from ${table} t order by row_to_json(t)::text`)).rows])));
  const unchanged = await beforeFailure();
  await pool.query(`create function fail_history_capture_test() returns trigger language plpgsql as $$ begin if NEW.sale_id is not null and NEW.product_id=${productId} then raise exception 'deliberate isolated capture failure'; end if; return NEW; end $$; create trigger fail_history_capture_test before insert on commercial_identity_snapshots for each row execute function fail_history_capture_test()`);
  try {
    await call("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId, quantity: 1 }] }, "CASHIER", 500);
    assert.deepEqual(await beforeFailure(), unchanged);
  } finally {
    await pool.query("drop trigger fail_history_capture_test on commercial_identity_snapshots; drop function fail_history_capture_test()");
  }
  console.log("PASS historial: venta/pedido/ENTRY/EXIT capturados, atributos y barcode históricos inalterados, devolución legítima, Webpay simulado, importes/reservas, comprobante, guards y rollback");
}

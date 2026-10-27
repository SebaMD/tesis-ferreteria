import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testProductAttributeRename({ pool, call, body, snapshot, users }) {
  assert.match((await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/"), /\/fyf-bundle-test-[^/]+\/data$/);
  const create = body(); create.variants.forEach(v => { v.barcode = null; });
  create.family.attributes[0] = { name: "Medida", options: [{ label: "200 ml" }, { label: "400 ml" }] };
  create.family.attributes[1].name = "Formato comercial";
  create.images = [{ mimeType: "image/png", authorized: true, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII=" }];
  create.variants.forEach(v => { v.imageIndexes = [0]; });
  const created = await call("POST", "/product-families/bundle", create, "ADMIN", 200, true);
  const id = created.familyId;
  const sale = await call("POST", "/sales", { paymentMethod: "efectivo", details: [{ productId: created.productIds[0], quantity: 2 }] }, "CASHIER", 201);
  await call("POST", `/sales/${sale.id}/returns`, { reason: "Devolución antes de renombrar", details: [{ productId: created.productIds[0], quantity: 1 }] }, "ADMIN");
  await call("POST", "/promotions", { name: `Promoción rename ${randomUUID()}`, type: "PERCENTAGE_DISCOUNT", percentage: 10,
    isActive: true, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), productIds: [created.productIds[0]], categoryIds: [] }, "MANAGER", 201);
  const input = { items: [{ productId: created.productIds[0], quantity: 1 }], deliveryType: "PICKUP" };
  users.RENAME_CLIENT = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'18999999-0','Cliente','Rename','rename-client@example.test',password,'ACTIVE',now() from users where id=$1 returning id", [users.CLIENT])).rows[0].id;
  const quote = await call("POST", "/online-orders/quote", input);
  await call("POST", "/online-orders/checkout", { ...input, checkoutKey: randomUUID(), quoteFingerprint: quote.quoteFingerprint }, "RENAME_CLIENT", 201);
  const get = () => call("GET", `/product-families/${id}/bundle`, null, "ADMIN");
  let bundle = await get(); const attributeId = bundle.family.attributes[0].id;
  const route = `/product-families/${id}/attributes/${attributeId}/rename`;
  const recovery = key => `/product-families/${id}/attributes/${attributeId}/rename-operations/${key}`;
  const rename = (name, revision = bundle.revision) => ({ name, reason: "Corrección descriptiva, sin cambiar las opciones", confirmed: true, expectedRevision: revision, operationKey: randomUUID() });
  const eventRows = async () => (await pool.query("select * from product_family_events order by id")).rows;
  const commercial = async () => Object.fromEntries(await Promise.all(["online_payments", "promotions", "promotion_products", "sale_cancellation_requests", "sale_cancellation_request_items"].map(async table => [table, (await pool.query(`select row_to_json(t) row from ${table} t order by row_to_json(t)::text`)).rows])));
  const commercialBefore = await commercial();
  const stable = await snapshot(), oldEvents = await eventRows(), previous = structuredClone(bundle);
  for (const role of [null, "MANAGER", "WAREHOUSE", "CASHIER", "CLIENT"]) {
    await call("POST", route, rename("Presentación"), role, role ? 403 : 401);
    await call("GET", recovery(randomUUID()), null, role, role ? 403 : 401);
  }
  const service = await import("../dist/modules/productFamilies/productAttributeRename.service.js");
  await assert.rejects(service.renameFamilyAttribute(id, attributeId, rename("Presentación"), users.MANAGER), e => e.statusCode === 403);
  for (const request of [{ ...rename("Presentación"), price: 1 }, { ...rename("Presentación"), confirmed: false }, rename(""),
    rename(" MEDIDA "), rename(" FORMATO   COMERCIAL "), { ...rename("Presentación"), reason: "corto" }, rename("Presentación", "0".repeat(64))]) {
    await call("POST", route, request, "ADMIN", [400, 409]);
  }
  await call("POST", `/product-families/999999/attributes/${attributeId}/rename`, rename("Presentación"), "ADMIN", 404);
  await call("POST", `/product-families/${id}/attributes/999999/rename`, rename("Presentación"), "ADMIN", 404);
  assert.deepEqual(await snapshot(), stable);

  const request = rename("  Presentación   del producto  ");
  const results = await Promise.all([call("POST", route, request, "ADMIN"), call("POST", route, request, "ADMIN")]);
  assert.notEqual(results[0].replayed, results[1].replayed);
  const recovered = await call("GET", recovery(request.operationKey), null, "ADMIN");
  assert.equal(recovered.name, "Presentación del producto"); assert.equal(recovered.previousName, "Medida");
  assert.equal(recovered.replayed, true);
  await call("POST", route, { ...request, name: "Otro nombre" }, "ADMIN", 409);
  bundle = await get(); assert.notEqual(bundle.revision, previous.revision); assert.equal(bundle.revision, recovered.revision);
  assert.equal(bundle.family.attributes[0].id, attributeId);
  assert.deepEqual(bundle.family.attributes[0].options, previous.family.attributes[0].options);
  const identity = variants => variants.map(v => ({ ...v, variantValues: v.variantValues.map(({ attribute, ...value }) => value) }));
  assert.deepEqual(identity(bundle.variants), identity(previous.variants));
  assert.deepEqual(await commercial(), commercialBefore);
  const after = await snapshot();
  for (const table of Object.keys(stable).filter(t => !["product_families", "family_attributes", "product_family_events"].includes(t))) assert.deepEqual(after[table], stable[table], table);
  const audits = await eventRows(); assert.deepEqual(audits.slice(0, -1), oldEvents);
  assert.equal(audits.at(-1).previous.name, "Medida"); assert.equal(audits.at(-1).next.name, recovered.name);
  assert.equal(audits.at(-1).next.attributeId, attributeId); assert.equal(audits.at(-1).user_id, users.ADMIN);
  assert.equal(audits.at(-1).reason, request.reason); assert.ok(audits.at(-1).created_at);
  const catalog = await call("GET", `/catalog/families/${id}`);
  assert.equal(catalog.attributes[0].name, recovered.name);
  assert.ok(catalog.variants.every(v => v.variantValues.find(value => value.attributeId === attributeId).attribute === recovered.name));
  assert.deepEqual(catalog.variants.map(v => v.variantValues.map(value => value.optionId)), bundle.variants.map(v => v.variantOptionIds));
  const administrative = (await call("GET", "/product-families", null, "ADMIN")).find(f => f.id === id);
  assert.equal(administrative.attributes[0].name, recovered.name);
  console.log("PASS renombrado con historial: ID/opciones/variant_key/productos/stock/imágenes/ventas/devoluciones/pedidos intactos; catálogo actualizado; idempotencia y recuperación durable");

  const oldBundlePayload = { operationKey: randomUUID(), familyId: id, expectedRevision: previous.revision,
    family: { name: previous.family.name, categoryId: previous.family.categoryId, brand: previous.family.brand, description: previous.family.description,
      attributes: previous.family.attributes.map(a => ({ id: a.id, name: a.name, options: a.options.map(o => ({ id: o.id, label: o.label })) })) },
    unitMeasure: "unidad", variants: previous.variants.map(v => ({ id: v.id, name: v.name, price: Number(v.price), minimumStock: v.minimumStock,
      barcode: v.barcode, status: v.status, selections: previous.family.attributes.map(a => a.options.findIndex(o => v.variantOptionIds.includes(o.id))) })) };
  await call("POST", "/product-families/bundle", oldBundlePayload, "ADMIN", 409);
  await call("PATCH", `/product-families/${id}`, { ...oldBundlePayload.family }, "ADMIN", 409);
  assert.deepEqual(await snapshot(), after);
  const direct = (await pool.query("insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at) select role_id,'17999999-0','Segundo','Admin','rename-second@example.test',password,'ACTIVE',now() from users where id=$1 returning id", [users.ADMIN])).rows[0];
  users.RENAME_ADMIN = direct.id;
  await call("GET", recovery(request.operationKey), null, "RENAME_ADMIN", 403);
  await call("GET", `/product-families/${id}/attributes/${bundle.family.attributes[1].id}/rename-operations/${request.operationKey}`, null, "ADMIN", 409);
  const foreign = await call("POST", "/product-families", { name: `Ajena ${randomUUID()}`, categoryId: bundle.family.categoryId,
    attributes: [{ name: "Color", options: [{ label: "Azul" }] }] }, "ADMIN", 201);
  await call("POST", `/product-families/${id}/attributes/${foreign.attributes[0].id}/rename`, rename("Nombre ajeno"), "ADMIN", 404);

  const race = await Promise.all(["Presentación", "Volumen"].map(name => call("POST", route, rename(name), "ADMIN", [200, 409])));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]); bundle = await get();
  const rollbackBefore = await snapshot();
  await pool.query("create function fail_attribute_rename() returns trigger language plpgsql as $$ begin if NEW.next->>'operation'='ATTRIBUTE_RENAME' then raise exception 'injected rename audit failure'; end if; return NEW; end $$; create trigger fail_attribute_rename before insert on product_family_events for each row execute function fail_attribute_rename()");
  const failed = rename("Nombre con rollback");
  try {
    await call("POST", route, failed, "ADMIN", 500);
    assert.equal(await call("GET", recovery(failed.operationKey), null, "ADMIN"), null);
    assert.deepEqual(await snapshot(), rollbackBefore);
  } finally { await pool.query("drop trigger fail_attribute_rename on product_family_events; drop function fail_attribute_rename()"); }
  const final = await call("POST", route, failed, "ADMIN");
  assert.equal(final.replayed, false);
  assert.equal((await eventRows()).filter(event => event.next.operationKey === failed.operationKey).length, 1);
  assert.deepEqual(await commercial(), commercialBefore);
  console.log("PASS permisos en servicio/endpoints, nombres inválidos/repetidos, propietario de operación, atributo ajeno, revisión obsoleta, carrera y rollback deliberado de auditoría sin actualización parcial");
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function testUnifiedEditing({ pool, call, body, snapshot, uploads, users }) {
  const directory = (await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/");
  assert.match(directory, /\/fyf-bundle-test-[^/]+\/data$/);
  const png = { mimeType: "image/png", authorized: true, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII=" };
  const create = body(); create.images = [png, png];
  create.variants.forEach(v => { v.barcode = null; v.imageIndexes = [0, 1]; });
  const created = await call("POST", "/product-families/bundle", create, "ADMIN", 200, true);
  const get = () => call("GET", `/product-families/${created.familyId}/bundle`, null, "ADMIN");
  const payload = bundle => ({ operationKey: randomUUID(), familyId: bundle.family.id, expectedRevision: bundle.revision,
    family: { name: bundle.family.name, description: bundle.family.description, categoryId: bundle.family.categoryId, brand: bundle.family.brand,
      attributes: bundle.family.attributes.map(a => ({ id: a.id, name: a.name, options: a.options.map(o => ({ id: o.id, label: o.label })) })) },
    unitMeasure: "unidad", variants: bundle.variants.map(v => ({ id: v.id, name: v.name, price: Number(v.price), barcode: v.barcode,
      description: v.description, unitMeasure: v.unitMeasure, minimumStock: v.minimumStock, status: v.status, inStoreOnly: v.inStoreOnly,
      selections: bundle.family.attributes.map(a => a.options.findIndex(o => v.variantOptionIds.includes(o.id))),
      existingImages: { imageIds: v.images.map(i => i.id), primaryImageId: v.images.find(i => i.isPrimary)?.id ?? null } })) });
  const movements = async () => (await pool.query("select * from inventory_movements where product_id=any($1) order by id", [created.productIds])).rows;
  let bundle = await get(); const before = await snapshot(), originalMovements = await movements();
  const a = bundle.variants[0], b = bundle.variants[1];
  const restrictedChanges = [
    value => { value.family.attributes[0].name = "Nombre nuevo no autorizado"; },
    value => { value.variants[0].selections[0] = 1; },
    value => { value.family.attributes.push({ name: "Tamaño", options: [{ label: "Mediano" }] }); value.variants.forEach(v => v.selections.push(0)); },
    value => { value.family.attributes.pop(); value.variants.forEach(v => v.selections.pop()); },
    value => { value.family.attributes[0].options[0].label = "Valor distinto"; },
    value => { value.family.brand = "Otra marca"; },
    value => { value.family.categoryId += 10000; },
  ];
  for (const mutate of restrictedChanges) {
    const attempt = payload(bundle); mutate(attempt);
    await call("POST", "/product-families/bundle", attempt, "ADMIN", 409);
    assert.deepEqual(await snapshot(), before);
  }
  console.log("PASS family review: rename/value/add/remove dimension, used-option rename, brand and category restrictions retain every ID, image, stock movement and historical relationship");
  const badUnit = payload(bundle); badUnit.variants[0].unitMeasure = "litro";
  badUnit.variants[0].existingImages = { imageIds: [], primaryImageId: null };
  await call("POST", "/product-families/bundle", badUnit, "ADMIN", 409);
  assert.deepEqual(await snapshot(), before);
  for (const image of a.images) assert.ok((await readFile(path.join(uploads, image.imagePath))).length);
  const foreign = payload(bundle); foreign.variants[0].existingImages = { imageIds: [b.images[0].id], primaryImageId: b.images[0].id };
  await call("POST", "/product-families/bundle", foreign, "ADMIN", 409);
  assert.deepEqual(await snapshot(), before);

  // Fail after image metadata has changed on the first row, proving rollback retains its files.
  await pool.query("create function fail_unified_edit() returns trigger language plpgsql as $$ begin if NEW.description='isolated edit failure' then raise exception 'injected unified edit failure'; end if; return NEW; end $$; create trigger fail_unified_edit before update on products for each row execute function fail_unified_edit()");
  const fail = payload(bundle); fail.variants[0].existingImages = { imageIds: [], primaryImageId: null }; fail.variants[1].description = "isolated edit failure";
  await call("POST", "/product-families/bundle", fail, "ADMIN", 500);
  assert.deepEqual(await snapshot(), before);
  for (const image of a.images) assert.ok((await readFile(path.join(uploads, image.imagePath))).length);
  await pool.query("drop trigger fail_unified_edit on products; drop function fail_unified_edit()");

  const change = payload(bundle); change.family.description = "Metadatos generales, sin propagación";
  change.variants[0].description = "Descripción exclusiva de la primera variante";
  change.variants[0].existingImages = { imageIds: [...a.images].reverse().map(i => i.id), primaryImageId: a.images[1].id };
  const responses = await Promise.all([call("POST", "/product-families/bundle", change, "ADMIN"), call("POST", "/product-families/bundle", change, "ADMIN")]);
  assert.deepEqual(responses[0].productIds, responses[1].productIds); assert.notEqual(responses[0].replayed, responses[1].replayed);
  bundle = await get();
  assert.equal(bundle.variants[0].description, change.variants[0].description);
  assert.equal(bundle.variants[1].description, b.description); assert.equal(bundle.variants[1].unitMeasure, b.unitMeasure);
  assert.deepEqual(bundle.variants[0].images.map(i => i.id), change.variants[0].existingImages.imageIds);
  assert.equal(bundle.variants[0].images.find(i => i.isPrimary).id, a.images[1].id);
  assert.deepEqual(await movements(), originalMovements);
  const audit = (await pool.query("select * from product_family_events where next->>'operationKey'=$1", [change.operationKey])).rows;
  assert.equal(audit.length, 1); assert.equal(audit[0].user_id, users.ADMIN);
  assert.equal(audit[0].previous.variants[0].description, a.description);
  assert.equal(audit[0].next.variants[0].description, change.variants[0].description);

  const remove = payload(bundle), removedImage = bundle.variants[0].images[0];
  remove.variants[0].existingImages = { imageIds: [], primaryImageId: null };
  remove.images = [png]; remove.variants[0].imageIndexes = [0];
  await call("POST", "/product-families/bundle", remove, "ADMIN", 200, true);
  await assert.rejects(readFile(path.join(uploads, removedImage.imagePath)), { code: "ENOENT" });
  for (const image of b.images) assert.ok((await readFile(path.join(uploads, image.imagePath))).length);
  const fresh = await get(); assert.equal(fresh.variants[0].images.length, 1); assert.equal(fresh.variants[0].images[0].isPrimary, true);
  await call("POST", "/product-families/bundle", payload(bundle), "ADMIN", 409);
  // A legacy image API update also invalidates the joint editor's revision.
  const stale = payload(fresh);
  await call("PATCH", `/products/${b.id}/images/${b.images[1].id}/primary`, null, "ADMIN");
  await call("POST", "/product-families/bundle", stale, "ADMIN", 409);

  const unused = body(); unused.variants.forEach(v => { v.initialStock = 0; v.barcode = null; });
  const empty = await call("POST", "/product-families/bundle", unused, "ADMIN");
  const emptyBundle = await call("GET", `/product-families/${empty.familyId}/bundle`, null, "ADMIN");
  const unit = payload(emptyBundle); unit.variants[0].unitMeasure = "caja"; unit.variants[0].description = "Datos individuales sin historial";
  await call("POST", "/product-families/bundle", unit, "ADMIN");
  const units = (await pool.query("select unit_measure from products where id=any($1) order by id", [empty.productIds])).rows;
  assert.deepEqual(units.map(v => v.unit_measure), ["caja", "unidad"]);
  assert.equal((await pool.query("select count(*) from inventory_movements where product_id=any($1)", [empty.productIds])).rows[0].count, "0");
  console.log("PASS unified editing: individual description/unit permissions, no common propagation, transactional image order/primary/delete/upload, rollback retains files, stale image API rejected, concurrent idempotent saves and unchanged ENTRY/history");
}

// Called only by seed.integration.mjs after its disposable-cluster checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { demoProducts } from '../dist/db/demo/catalog.js';
import { importDemoImages } from '../dist/db/demo/imageImport.js';

export async function testDemoImages({ pool, root, origin, env, adminToken }) {
  const source = path.join(root, 'image-fixtures');
  await mkdir(source, { recursive: true });
  const articles = [demoProducts[0], demoProducts.find(p => p.supplierCode === 'EPBH25702'), demoProducts.at(-1)];
  const rows = (await pool.query('select id,name,family_id,status from products')).rows;
  const manifest = [];
  for (const [i, article] of articles.entries()) {
    // Synthetic 1px image: NOT a supplier photograph or an authorization grant.
    const buffer = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/a0AAAAASUVORK5CYII=', 'base64'), Buffer.from('SYNTHETIC TEST ONLY ' + i)]);
    await writeFile(path.join(source, `${i}.png`), buffer);
    manifest.push({ productKey: article.key, file: `${i}.png`, sha256: createHash('sha256').update(buffer).digest('hex'),
      sourceDocument: article.source.document, sourcePage: article.source.page, rightsStatus: 'AUTHORIZED', publish: true,
      authorization: { reference: 'Synthetic integration fixture only, not provider permission', scope: 'academic-web' } });
  }
  const save = entries => writeFile(path.join(source, 'extracted-images.json'), JSON.stringify(entries));
  const snapshot = async () => {
    const tables = ['products','product_families','family_attributes','family_attribute_options','product_variant_values','inventory_movements','sales','sale_details','sale_cancellation_requests','commercial_identity_snapshots','product_family_events'];
    return Object.fromEntries(await Promise.all(tables.map(async t => [t, (await pool.query(`select to_jsonb(t) row from ${t} t order by to_jsonb(t)::text`)).rows])));
  };
  const before = await snapshot();
  const pending = await importDemoImages(path.resolve('../docs/seed-catalog-review'), true);
  assert.equal(pending.withImage, 0); assert.equal(pending.results.filter(r => r.result === 'AUTHORIZATION_PENDING').length, 13);
  await save(manifest);
  assert.equal((await importDemoImages(source)).results.filter(r => r.result === 'READY').length, 3);
  assert.equal((await pool.query('select count(*)::int n from product_images')).rows[0].n, 0);
  await pool.query(`create function test_image_failure() returns trigger language plpgsql as $$ begin if (select count(*) from product_images)>0 then raise exception 'deliberate image rollback'; end if; return new; end $$; create trigger test_image_failure before insert on product_images for each row execute function test_image_failure()`);
  await assert.rejects(importDemoImages(source, true), /Failed query|deliberate/);
  assert.equal((await pool.query('select count(*)::int n from product_images')).rows[0].n, 0);
  await pool.query('drop trigger test_image_failure on product_images; drop function test_image_failure()');
  const result = await importDemoImages(source, true);
  assert.equal(result.withImage, 3);
  assert.equal(result.results.filter(r => r.result === 'ASSOCIATED').length, 3);
  assert.deepEqual(await snapshot(), before);
  const images = (await pool.query('select * from product_images order by product_id')).rows;
  assert.equal(images.length, 3);
  assert.equal((await pool.query('select count(*)::int n from product_families')).rows[0].n, 19);
  assert.equal(rows.filter(r => r.family_id).length, 71);
  assert.equal(rows.filter(r => !r.family_id).length, 25);
  const inventory = await fetch(origin + '/api/products', { headers: { Authorization: 'Bearer ' + adminToken } });
  assert.equal(inventory.status, 200);
  const inventoryProducts = (await inventory.json()).data;
  for (const [i, article] of articles.entries()) {
    const product = rows.find(p => p.name === article.name);
    const image = images.find(p => p.product_id === product.id);
    assert.ok(image.image_path.startsWith(`products/${product.id}/demo-`));
    assert.equal(inventoryProducts.find(p => p.id === product.id).images[0].imageUrl, '/uploads/' + image.image_path);
    const response = await fetch(origin + '/uploads/' + image.image_path);
    assert.equal(response.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), manifest[i].sha256);
    if (product.status) {
      const catalog = (await (await fetch(origin + '/api/catalog/products/' + product.id)).json()).data;
      assert.equal(catalog.images[0].imageUrl, '/uploads/' + image.image_path);
    }
  }
  const replay = await importDemoImages(source, true);
  assert.equal(replay.results.filter(r => r.result === 'ALREADY_ASSOCIATED').length, 3);
  await pool.query('update product_images set position=7 where id=$1', [images[0].id]);
  await importDemoImages(source, true);
  assert.equal((await pool.query('select position from product_images where id=$1', [images[0].id])).rows[0].position, 7);
  await pool.query('update product_images set position=$1 where id=$2', [images[0].position, images[0].id]);
  // A separate process must find the same disk files/DB rows, not process memory.
  execFileSync(process.execPath, ['dist/db/importDemoImages.js', source, '--apply'], { env: { ...process.env, ...env }, stdio: 'pipe' });
  assert.deepEqual((await pool.query('select * from product_images order by product_id')).rows, images);
  const altered = manifest.map(e => ({ ...e })); altered[0].file = '../escape.png';
  await save(altered); await assert.rejects(importDemoImages(source, true), /ruta inválida/);
  altered[0] = { ...manifest[0], sha256: '0'.repeat(64) };
  await save(altered); await assert.rejects(importDemoImages(source, true), /Hash/);
  await save([manifest[0], manifest[0]]); await assert.rejects(importDemoImages(source, true), /duplicada/);
  await save(manifest);
  await Promise.all([importDemoImages(source, true), importDemoImages(source, true)]);
  assert.equal((await pool.query('select count(*)::int n from product_images')).rows[0].n, 3);
  assert.deepEqual(await snapshot(), before);
  console.log('PASS demo imágenes: 13 proveedores pendientes; 3 fixtures sintéticos autorizados, preview, SKU exactos/activo/inactivo, HTTP, rollback, replay/proceso nuevo, concurrencia, rutas/hash y preservación comercial');
}

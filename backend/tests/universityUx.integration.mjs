// Disposable PostgreSQL 13.23 container only; never the university/development DB.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const url = new URL(process.env.UNIVERSITY_UX_TEST_DATABASE_URL || 'http://missing');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55458'); assert.equal(url.pathname, '/postgres');
assert.equal(url.search, '');
const control = new pg.Pool({ connectionString: url.href });
const name = 'fyf_seed_demo_ux_' + randomBytes(8).toString('hex');
let pool, server, applicationDb, created = false;
try {
  assert.equal((await control.query('show server_version')).rows[0].server_version.split(' ')[0], '13.23');
  await control.query(`create database "${name}"`); created = true;
  url.pathname = '/' + name;
  pool = new pg.Pool({ connectionString: url.href });
  Object.assign(process.env, { DATABASE_URL: url.href, NODE_ENV: 'test', SEED_DEMO_DATA: 'true', MAIL_ENABLED: 'false', WEBPAY_ENVIRONMENT: 'integration',
    SESSION_SECRET: randomBytes(32).toString('hex'), EMAIL_VERIFICATION_SECRET: randomBytes(32).toString('hex'), LOGISTICS_QR_SECRET: randomBytes(32).toString('hex') });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  assert.equal((await pool.query('select count(*)::int n from drizzle.__drizzle_migrations')).rows[0].n, 43);
  // Empty database also needs a real actor: no events are created here.
  await pool.query("insert into roles(name) values('ADMIN'); insert into users(role_id,rut,names,surnames,correo,password,status) values((select id from roles where name='ADMIN'),'11111111-1','Test','Admin','test@example.test','not-a-login','ACTIVE')");
  const actor = (await pool.query('select id from users')).rows[0].id;
  applicationDb = (await import('../dist/db/index.js')).db;
  const { listProductAudits } = await import('../dist/modules/productAudits/productAudits.service.js');
  try { assert.deepEqual((await listProductAudits(actor, { limit: '10' })).items, []); }
  catch (error) { console.error('LOCAL PG13 AUDIT DIAGNOSTIC', { code: error.cause?.code, message: error.cause?.message || error.message }); throw error; }
  await pool.query('delete from users'); // Test fixture only, before any events/history.
  execFileSync(process.execPath, ['dist/db/seed.js'], { env: process.env, stdio: 'inherit' });
  const { default: app } = await import('../dist/app.js');
  applicationDb = (await import('../dist/db/index.js')).db;
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  let token;
  async function call(method, path, body, expected = 200) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json(); assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`); return expected >= 400 ? json : json.data;
  }
  token = (await call('POST', '/auth/login', { identifier: 'admin@gmail.com', password: '@dmin.2026' })).token;
  const page = await call('GET', '/product-audits?limit=10'); assert.ok(page.items.length); assert.ok(page.nextCursor);
  const next = await call('GET', '/product-audits?limit=10&cursor=' + page.nextCursor);
  assert.ok(next.items.every(e => !page.items.some(p => p.id === e.id)));
  assert.deepEqual((await call('GET', '/product-audits?from=1900-01-01&to=1900-01-01&limit=10')).items, []);
  const simple = (await pool.query("select id from products where name='Lubricante spray Toro Negro 400 ml TN0192' and family_id is null")).rows[0]; assert.ok(simple);
  const before = await call('GET', '/products/' + simple.id);
  const warehouse = (await pool.query("select u.id from users u join roles r on r.id=u.role_id where r.name='WAREHOUSE' limit 1")).rows[0].id;
  await assert.rejects(listProductAudits(warehouse, {}), e => e.statusCode === 403);
  const snapshots = (await pool.query('select * from commercial_identity_snapshots order by id')).rows;
  const command = { name: before.name.replace('TN0192','TN0191'), reason: 'Me equivoqué en el modelo del producto', confirmed: true, operationKey: randomUUID(), expectedRevision: new Date(before.updatedAt).toISOString() };
  const endpoint = '/products/' + simple.id + '/name-corrections';
  await call('POST', endpoint, command);
  assert.equal((await call('POST', endpoint, command)).replayed, true);
  assert.equal((await call('GET', endpoint + '/' + command.operationKey)).name, command.name);
  const after = await call('GET', '/products/' + simple.id);
  for (const key of ['id','currentStock','unitMeasure','price','variantKey','familyId','brand','categoryId']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual((await pool.query('select * from commercial_identity_snapshots order by id')).rows, snapshots);
  assert.equal((await pool.query("select count(*)::int n from product_family_events where next->>'operationKey'=$1", [command.operationKey])).rows[0].n, 1);
  const brand = { field: 'brand', value: 'Toro Negro corregido', previousValue: after.brand, reason: 'Corrección descriptiva de marca registrada', confirmed: true, expectedRevision: after.updatedAt, operationKey: randomUUID() };
  await call('POST', '/products/' + simple.id + '/classification-corrections', brand);
  await call('POST', endpoint, { ...command, operationKey: randomUUID() }, 409);
  const committed = (await pool.query("select i.product_id from sale_cancellation_request_items i join sale_cancellation_requests r on r.id=i.request_id where r.status='PENDING' limit 1")).rows[0].product_id;
  const blocked = await call('GET', '/products/' + committed);
  const rejection = await call('POST', '/products/' + committed + '/name-corrections', { ...command, name: blocked.name + ' corregido', expectedRevision: blocked.updatedAt, operationKey: randomUUID() }, 409);
  assert.match(rejection.message, /pendiente|devolución/i);
  assert.equal((await call('GET', '/products/' + committed)).name, blocked.name);
  console.log('PASS PG13.23: 43 migrations, audit empty/populated/cursor, exact TN0192→TN0191 case, replay/recovery/audit, simple brand, stale revision, snapshots/stock/IDs intact');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await applicationDb?.$client.end(); await pool?.end();
  if (created) await control.query(`drop database "${name}"`);
  await control.end();
}

// Disposable native PostgreSQL + real HTTP router. No migrations, academic seed or existing DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const backend = fileURLToPath(new URL('..', import.meta.url));
const parent = path.join(backend, 'tmp');
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(path.join(parent, 'fyf-audit-pages-test-'));
const bin = process.env.PG_TEST_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const port = 55462;
let running = false, pool, server, db;
const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, { windowsHide: true, stdio: 'inherit' });
try {
  run('initdb', ['-D', path.join(root, 'data'), '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C', '--no-sync']);
  run('pg_ctl', ['-D', path.join(root, 'data'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC`, '-w', 'start']); running = true;
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  const target = (await pool.query("select current_setting('data_directory') dir, inet_server_port() port, version() version")).rows[0];
  assert.equal(realpathSync(target.dir), realpathSync(path.join(root, 'data')));
  assert.equal(target.port, port);
  // Minimal test fixtures for this read endpoint and its real authentication middleware.
  await pool.query(`
    create table roles(id serial primary key, name text not null);
    create table users(id serial primary key, role_id integer, rut text, names text, surnames text, correo text,
      password text, phone text, status text, email_verified_at timestamptz, self_deactivated_at timestamptz,
      auth_version integer default 1, created_at timestamptz default now(), updated_at timestamptz default now());
    create table product_family_events(id serial primary key, product_id integer, family_id integer, user_id integer,
      reason text, previous jsonb, next jsonb, created_at timestamptz not null);
    insert into roles(name) values('ADMIN'),('MANAGER'),('CASHIER'),('WAREHOUSE'),('CLIENT');
    insert into users(role_id,rut,names,surnames,correo,password,status,email_verified_at)
      select id,'11111111-1','Actor',name,'test@example.test','not-a-login','ACTIVE',now() from roles;
  `);
  Object.assign(process.env, { DATABASE_URL: url, NODE_ENV: 'test', SESSION_SECRET: randomBytes(32).toString('hex') });
  const { default: router } = await import('../dist/modules/productAudits/productAudits.routes.js');
  ({ db } = await import('../dist/db/index.js'));
  const { listProductAudits } = await import('../dist/modules/productAudits/productAudits.service.js');
  const app = express(); app.use('/api/product-audits', router);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const tokens = Object.fromEntries((await pool.query('select u.id,r.name from users u join roles r on r.id=u.role_id')).rows.map(u => [u.name, jwt.sign({id:u.id,authVersion:1},process.env.SESSION_SECRET)]));
  const calls = [];
  const call = async (query, role = 'ADMIN', status = 200) => {
    calls.push(query);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/product-audits?${query}`, { headers: role ? { Authorization: 'Bearer ' + tokens[role] } : {} });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result.data;
  };
  const digest = async () => createHash('sha256').update(JSON.stringify((await pool.query('select * from product_family_events order by id')).rows)).digest('hex');
  const empty = await call('page=1&limit=10');
  assert.deepEqual([empty.items.length,empty.totalItems,empty.page,empty.totalPages],[0,0,1,1]);
  for(const role of [null,'MANAGER','CASHIER','WAREHOUSE','CLIENT']) await call('page=1',role,role?403:401);
  await assert.rejects(listProductAudits(2,{page:'1'}),e=>e.statusCode===403);
  for(const query of ['page=0','page=-1','page=1.5','page=01','page=1000001','page=1&page=2','page=1&cursor=x','page=1&limit=25','page=1&limit=0','page=1&productId=0','page=1&familyId=-1','page=1&from=2026-02-30','page=1&from=2026-11-05&to=2026-11-04']) await call(query,'ADMIN',400);
  const records = [];
  for(let i=1;i<=205;i++) {
    const productId = i%2 ? 22 : 33, familyId = i%3 ? 22 : 7;
    const operation = i%4 ? 'PRODUCT_NAME_CORRECTION' : 'ATTRIBUTE_RENAME';
    const row=(await pool.query("insert into product_family_events(product_id,family_id,user_id,reason,previous,next,created_at) values($1,$2,1,'Fixture de prueba',$3,$4,'2026-11-04T12:00:00.123456Z') returning id",[productId,familyId,{name:'Anterior'},{operation,name:'Nuevo'}])).rows[0];
    records.push({...row,productId,familyId,operation});
  }
  const baseline = await digest();
  const check = async (filters = {}, requested = 1, expected = records) => {
    const result = await call(new URLSearchParams({...filters,page:String(requested),limit:'10'}));
    const sorted = [...expected].sort((a,b)=>b.id-a.id);
    const totalPages = Math.max(1,Math.ceil(sorted.length/10)), page=Math.min(requested,totalPages);
    assert.deepEqual([result.requestedPage,result.page,result.pageSize,result.totalItems,result.totalPages],[requested,page,10,sorted.length,totalPages]);
    assert.deepEqual(result.items.map(item=>item.id),sorted.slice((page-1)*10,page*10).map(item=>item.id));
    return result;
  };
  for(const page of [1,2,11,20,21,999999]) await check({},page);
  for(const filters of [{operation:'ATTRIBUTE_RENAME'},{productId:'22'},{familyId:'22'},{productId:'22',familyId:'7'},{operation:'PRODUCT_NAME_CORRECTION',productId:'33',familyId:'22',from:'2026-11-04',to:'2026-11-04'}]) {
    const expected=records.filter(r=>(!filters.operation||r.operation===filters.operation)&&(!filters.productId||r.productId===Number(filters.productId))&&(!filters.familyId||r.familyId===Number(filters.familyId)));
    await check(filters,1,expected); await check(filters,999999,expected);
  }
  await check({from:'2026-11-05'},500,[]);
  await check({from:'2026-11-04',to:'2026-11-04'},1);
  await check({to:'2026-11-03'},1,[]);
  assert.equal(await digest(),baseline,'All history reads preserve stored events');
  const cursorFirst=await call('limit=10');
  assert.deepEqual(Object.keys(cursorFirst).sort(),['items','nextCursor','limit','operations'].sort());
  assert.deepEqual(cursorFirst.items.map(r=>r.id),records.slice(-10).reverse().map(r=>r.id));
  await pool.query("insert into product_family_events(product_id,user_id,reason,previous,next,created_at) values(22,1,'Concurrent fixture','{}','{\"operation\":\"PRODUCT_NAME_CORRECTION\"}','2026-11-04T12:00:00.123456Z')");
  const cursorNext=await call('limit=10&cursor='+cursorFirst.nextCursor);
  assert.deepEqual(cursorNext.items.map(r=>r.id),records.slice(-20,-10).reverse().map(r=>r.id),'Cursor mode keeps its existing insertion behavior');
  assert.equal((await call('page=1')).totalItems,206,'Numbered queries reflect new committed records');
  for(const at of ['2026-11-03T23:59:59.999999Z','2026-11-04T00:00:00.000000Z','2026-11-04T23:59:59.999999Z','2026-11-05T00:00:00.000000Z']) await pool.query("insert into product_family_events(user_id,next,created_at) values(1,'{\"operation\":\"UNRECOGNIZED_TEST\"}',$1)",[at]);
  assert.equal((await call('page=1&operation=OTHER&from=2026-11-04&to=2026-11-04')).totalItems,2,'UTC end day includes its last microsecond, not the next midnight');
  const insertLinked = async (next) => (await pool.query("insert into product_family_events(user_id,family_id,previous,next,created_at) values(1,22,'{}',$1,'2001-01-01T00:00:00Z') returning id",[next])).rows[0].id;
  const authId=await insertLinked({operation:'FAMILY_BRAND_AUTHORIZATION',operationKey:'linked-test'});
  const resultId=await insertLinked({operation:'FAMILY_BRAND_CORRECTION',operationKey:'linked-test',authorizationId:authId,brand:'Nueva'});
  await insertLinked({operation:'BUNDLE_SAVE',operationKey:'convert-test',productIds:[44]});
  const conversionId=await insertLinked({operation:'CONVERT_SIMPLE',operationKey:'convert-test'});
  const grouped=await call('page=1&from=2001-01-01&to=2001-01-01');
  assert.equal(grouped.totalItems,2,'Count grouped commands, not hidden authorizations or companion saves');
  assert.deepEqual(grouped.items.map(r=>r.id),[conversionId,resultId]);
  assert.equal((await call('page=1&productId=44&from=2001-01-01&to=2001-01-01')).totalItems,1,'Conversion filter includes its linked variant');
  const finalDigest=await digest();
  await call('page=999999'); await call('limit=100');
  assert.equal(await digest(),finalDigest);
  console.log('PASS real isolated PostgreSQL:',target.version);
  console.log('PASS HTTP: totals/filters/UTC, 205 tied timestamps, direct/last/out-of-range pages, roles, grouping, cursor compatibility, read-only events. Requests:',calls.length);
} finally {
  if(server) await new Promise(resolve=>server.close(resolve));
  await db?.$client.end(); await pool?.end();
  if(running) run('pg_ctl',['-D',path.join(root,'data'),'-m','fast','-w','stop']);
  assert.equal(path.dirname(realpathSync(root)),realpathSync(parent));
  assert.ok(path.basename(root).startsWith('fyf-audit-pages-test-'));
  rmSync(root,{recursive:true,force:true});
}

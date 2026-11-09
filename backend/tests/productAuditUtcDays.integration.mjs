// Requires explicit approval and a newly created, empty PostgreSQL test instance.
// Does not create containers, migrate existing databases or start the normal backend.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {snapshotDdl} from './helpers/snapshotDdl.mjs';
import {testProductAudits} from './productAudits.integration.mjs';

assert.equal(process.env.FYF_ALLOW_DISPOSABLE_DB_TESTS,'1','Approval for a disposable database is required');
assert.ok(process.env.FYF_AUDIT_TEST_URL,'Use an explicit test URL, never DATABASE_URL');
const url=new URL(process.env.FYF_AUDIT_TEST_URL);
assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');
assert.ok(url.port&&!['5432','5433'].includes(url.port));assert.equal(url.search,'');assert.equal(url.hash,'');
assert.match(url.pathname,/^\/fyf_audit_utc_test_[a-f0-9]+$/);
const marker=process.env.FYF_AUDIT_TEST_MARKER;assert.match(marker||'',/^[a-f0-9]{32}$/);
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
let server,db,requests=0,dayQueries=0;
try{
 const target=(await pool.query("select current_database() db,current_setting('cluster_name') marker,inet_server_port() port,current_setting('server_version') version")).rows[0];
 assert.equal(target.db,url.pathname.slice(1));assert.equal(target.marker,marker);assert.equal(target.port,55474);
 assert.equal((await pool.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0,'Only a new empty test database is accepted');
 const snapshot=JSON.parse(await readFile(new URL('../drizzle/meta/0043_snapshot.json',import.meta.url),'utf8'));
 for(const statement of snapshotDdl(snapshot))await pool.query(statement);
 assert.equal((await pool.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,37);
 await pool.query("insert into roles(id,name) values(1,'ADMIN'),(2,'MANAGER'),(3,'WAREHOUSE'),(4,'CASHIER'),(5,'CLIENT')");
 await pool.query("insert into users(id,role_id,rut,names,surnames,correo,password,status,email_verified_at,auth_version) select id,id,('1000000'||id||'-1'),'Persona','Prueba',(lower(name)||'@example.test'),'not-a-login','ACTIVE',now(),1 from roles");
 await pool.query("insert into categories(id,name) values(1,'Categoría sintética'); insert into product_families(id,category_id,name) values(1,1,'Familia sintética'); insert into products(id,category_id,name,price,unit_measure,current_stock,minimum_stock,status,in_store_only) values(1,1,'Artículo sintético',1000,'unidad',0,0,true,false)");
 Object.assign(process.env,{DATABASE_URL:url.toString(),NODE_ENV:'test',MAIL_ENABLED:'false',SESSION_SECRET:randomBytes(32).toString('hex')});
 const {default:router}=await import('../dist/modules/productAudits/productAudits.routes.js');
 ({db}=await import('../dist/db/index.js'));
 const app=express();app.use('/api/product-audits',router);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const users=Object.fromEntries((await pool.query('select u.id,r.name from users u join roles r on r.id=u.role_id')).rows.map(row=>[row.name,row.id]));
 const tokens=Object.fromEntries(Object.entries(users).map(([role,id])=>[role,jwt.sign({id,authVersion:1},process.env.SESSION_SECRET)]));
 const call=async(method,path,body,role,status=200)=>{
  requests++;
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:role?{Authorization:'Bearer '+tokens[role]}:{}});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{assert.equal(status,404);data={};}
  assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data.data;
 };
 await testProductAudits({pool,call,users});
 const today=new Date().toISOString().slice(0,10),nextDay=day=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
 const days=[...new Set(['1999-12-31','2000-01-01','2004-02-29','2004-03-01','2026-09-06',today])];
 const records=[];
 for(const day of days)for(const time of ['00:00:00.000000','23:59:59.999999']){
  const at=`${day}T${time}Z`,row=(await pool.query("insert into product_family_events(product_id,user_id,reason,previous,next,created_at) values(1,1,'Límite UTC sintético','{}','{\"operation\":\"UTC_BOUNDARY_TEST\"}',$1::timestamptz) returning id",[at])).rows[0];records.push({id:row.id,day,at});
 }
 const digest=async()=>createHash('sha256').update(JSON.stringify((await pool.query('select to_jsonb(e) r from product_family_events e order by id')).rows)).digest('hex');
 const baseline=await digest();
 const readDays=async(from,to)=>{
  dayQueries++;const result=await call('GET','/product-audits?'+new URLSearchParams({from,to,productId:'1',operation:'OTHER',limit:'100'}),null,'ADMIN');
  const expected=records.filter(row=>row.day>=from&&row.day<=to).sort((a,b)=>b.at.localeCompare(a.at)||b.id-a.id);
  assert.deepEqual(result.items.map(row=>row.id),expected.map(row=>row.id));assert.deepEqual(result.items.map(row=>row.at),expected.map(row=>row.at));return result.items;
 };
 for(const day of days)await readDays(day,day);
 for(const [from,to] of [['1999-12-31','2000-01-01'],['2004-02-29','2004-03-01']]){
  const a=await readDays(from,from),b=await readDays(to,to),combined=await readDays(from,to);
  assert.equal(new Set([...a,...b].map(row=>row.id)).size,a.length+b.length,'Adjacent days must not duplicate their midnight boundary');
  assert.deepEqual(new Set(combined.map(row=>row.id)),new Set([...a,...b].map(row=>row.id)));
 }
 for(const query of [{from:nextDay(today),to:nextDay(today)},{from:'2000-01-01',to:'1999-12-31'},{from:'2026-02-30',to:today},{from:'2026-2-01',to:today}])await call('GET','/product-audits?'+new URLSearchParams(query),null,'ADMIN',400);
 for(const role of ['MANAGER','WAREHOUSE'])await call('GET','/product-audits?'+new URLSearchParams({from:today,to:today}),null,role,403);
 const {listProductAudits}=await import('../dist/modules/productAudits/productAudits.service.js');
 for(const role of ['MANAGER','WAREHOUSE'])await assert.rejects(listProductAudits(users[role],{from:today,to:today}),error=>error.statusCode===403);
 assert.equal(await digest(),baseline,'Reads must not change historical events');
 console.log(JSON.stringify({result:'PASS',postgres:target.version,schemaTables:37,legacyAuditSuite:'PASS',utcDayQueries:dayQueries,httpRequests:requests,checks:['first midnight','final microsecond','today UTC','month/year/leap day','Chile DST date under UTC filtering','consecutive days without duplication','ADMIN-only HTTP and service','read-only history']}));
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await db?.$client.end();await pool.end();
}

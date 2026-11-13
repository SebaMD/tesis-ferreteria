import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {testProductAudits} from '../tests/productAudits.integration.mjs';

// Never fall back to .env or normal development connections.
const url=new URL(process.env.TEST_DATABASE_URL || 'postgresql://invalid/invalid');
assert.ok(['postgresql:','postgres:'].includes(url.protocol));
assert.equal(url.search,'','Connection query overrides are forbidden');assert.equal(url.hash,'');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Only isolated localhost PostgreSQL');
assert.ok(url.port && !['5432','5433'].includes(url.port),'Normal PostgreSQL ports are forbidden');
assert.ok(url.pathname==='/fyf_demo'||/^\/fyf_.*test/.test(url.pathname),'An isolated test database name is required');
process.env.DATABASE_URL=url.toString();
process.env.NODE_ENV='test';process.env.MAIL_ENABLED='false';process.env.SESSION_SECRET=randomBytes(32).toString('hex');
const pool=new Pool({connectionString:url.toString()});
const target=(await pool.query('select current_database() db,inet_server_port() port')).rows[0];
assert.equal(target.db,decodeURIComponent(url.pathname.slice(1)));assert.equal(target.port,Number(url.port));
// Import app only: server.ts/reconciliation scheduler is never started.
const {default:app}=await import('../dist/app.js');
const {db}=await import('../dist/db/index.js');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const origin='http://127.0.0.1:'+server.address().port;
const users={},tokens={};
try {
  for(const role of ['ADMIN','MANAGER','CASHIER','WAREHOUSE','CLIENT']){
    const u=(await pool.query("select u.id,u.auth_version from users u join roles r on r.id=u.role_id where r.name=$1 and u.status='ACTIVE' and (u.email_verified_at is not null or r.name in ('ADMIN','CLIENT')) order by u.id desc limit 1",[role])).rows[0];
    assert.ok(u,'Missing isolated test role '+role);users[role]=u.id;tokens[role]=jwt.sign({id:u.id,authVersion:u.auth_version},process.env.SESSION_SECRET);
  }
  const call=async(method,path,body,role,status=200)=>{
    const response=await fetch(origin+'/api'+path,{method,headers:role?{Authorization:'Bearer '+tokens[role]}:{}});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{assert.equal(status,404,'Expected JSON for API responses other than Express 404');data={};}
    assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data.data;
  };
  await testProductAudits({pool,call,users});
  console.log('PostgreSQL '+(await pool.query('show server_version')).rows[0].server_version+' isolated '+target.db+':'+target.port);
} finally {await new Promise(r=>server.close(r));await pool.end();await db.$client.end();}

import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';

// Caller must supply an already validated isolated PostgreSQL connection/API.
export async function testProductAudits({pool,call,users}) {
  const target=(await pool.query('select current_database() db,inet_server_port() port')).rows[0];
  assert.ok(target.db==='fyf_demo'||/^fyf_.*test/.test(target.db));assert.ok(![5432,5433].includes(target.port));
  const pid=(await pool.query('select id from products order by id limit 1')).rows[0].id;
  const fid=(await pool.query('select id from product_families order by id limit 1')).rows[0].id;
  const marker='Auditoría temporal '+randomUUID(), inserted=[];
  const insert=async(next,previous={},reason=marker,actor=users.ADMIN,productId=pid,familyId=null)=>{
    const row=(await pool.query("insert into product_family_events(product_id,family_id,user_id,reason,previous,next,created_at) values($1,$2,$3,$4,$5,$6,'2001-02-03T04:05:06.123456Z') returning id",[productId,familyId,actor,reason,previous,next])).rows[0];inserted.push(row.id);return row.id;
  };
  try {
    const first=await insert({operation:'AUDIT_TEST',operationKey:'SECRETKEY',password:'SECRET_PASSWORD',customer:{email:'private@example.test'}},{customer:{phone:'SECRET_PHONE'}});
    const second=await insert({operation:'AUDIT_TEST'}, {}, '', null);
    const third=await insert({operation:'AUDIT_TEST'});
    const key=randomUUID();
    const association=await insert({familyId:fid},{familyId:null},marker,users.ADMIN,pid,fid);
    const conversion=await insert({operation:'CONVERT_SIMPLE',operationKey:key,attributes:[{attribute:'Color',option:'Rojo'}]},{product:{id:pid,name:'Producto prueba'}},marker,users.ADMIN,pid,fid);
    const bundle=await insert({operation:'BUNDLE_SAVE',operationKey:key,productIds:[pid],variants:[{id:pid,name:'Producto prueba',price:'1234'}]}, {}, marker, users.ADMIN,null,fid);
    const digest=async()=>{
      const tables=['products','product_families','product_variant_values','product_images','commercial_identity_snapshots','sales','sale_details','online_orders','online_order_items','online_payments','inventory_movements','product_family_events','delivery_quote_requests','delivery_quote_items','delivery_quote_revisions','delivery_quote_events','sale_cancellation_requests'];
      return Object.fromEntries(await Promise.all(tables.map(async t=>[t,createHash('sha256').update(JSON.stringify((await pool.query(`select to_jsonb(t) r from ${t} t order by to_jsonb(t)::text`)).rows)).digest('hex')])));
    };
    let baseline=await digest();
    for(const role of [undefined,'MANAGER','CASHIER','WAREHOUSE','CLIENT'])await call('GET','/product-audits',null,role,role?403:401);
    for(const method of ['POST','PATCH','DELETE'])await call(method,'/product-audits',null,'ADMIN',404);
    const {listProductAudits}=await import('../dist/modules/productAudits/productAudits.service.js');
    await assert.rejects(listProductAudits(users.MANAGER,{}),e=>e.statusCode===403);
    for(const query of ['limit=101','limit=0','productId=0','familyId=-1','operation=toString','cursor=bad','from=2026-02-30','from=2026-10-30&to=2026-10-01','productId=1&productId=2'])await call('GET','/product-audits?'+query,null,'ADMIN',400);
    const path=`/product-audits?operation=OTHER&productId=${pid}&from=2001-02-03&to=2001-02-03&limit=1`;
    const a=await call('GET',path,null,'ADMIN');assert.equal(a.items.length,1);assert.equal(a.items[0].id,third);assert.ok(a.nextCursor);
    assert.deepEqual(await digest(),baseline);
    await insert({operation:'AUDIT_TEST'}); // new command after page 1: keyset must not repeat/shift old rows
    baseline=await digest();
    const b=await call('GET',path+'&cursor='+a.nextCursor,null,'ADMIN');assert.equal(b.items[0].id,second);assert.equal(b.items[0].actor,null);assert.equal(b.items[0].reason,null);
    const c=await call('GET',path+'&cursor='+b.nextCursor,null,'ADMIN');assert.equal(c.items[0].id,first);assert.equal(c.nextCursor,null);assert.ok(!JSON.stringify(c).includes('SECRET'));assert.ok(!JSON.stringify(c).includes('private@example.test'));
    const grouped=await call('GET',`/product-audits?familyId=${fid}&from=2001-02-03&to=2001-02-03`,null,'ADMIN');
    assert.equal(grouped.items.filter(e=>[association,conversion,bundle].includes(e.id)).length,2,'Unlinked legacy association remains separate; conversion/save are one explicitly keyed command');
    const item=grouped.items.find(e=>e.id===conversion);assert.ok(item.source.records.some(r=>r.id===bundle));assert.ok(!item.source.records.some(r=>r.id===association));
    assert.equal(item.changes.at(-1).after[0].price,'1234');
    const empty=await call('GET','/product-audits?from=1990-01-01&to=1990-01-01',null,'ADMIN');assert.deepEqual(empty.items,[]);
    for(const op of ['FAMILY_BRAND_CORRECTION','OPTION_LABEL_CORRECTION','DIMENSION_ADD','PRODUCT_NAME_CORRECTION','ATTRIBUTE_RENAME','FAMILY_CATEGORY_CHANGE']){
      const page=await call('GET','/product-audits?limit=100&operation='+op,null,'ADMIN');
      assert.ok(page.items.every(e=>e.operation===op));
      for(const e of page.items)assert.equal(new Set(e.source.records.map(r=>r.id)).size,e.source.records.length);
      if(['FAMILY_BRAND_CORRECTION','OPTION_LABEL_CORRECTION','DIMENSION_ADD'].includes(op)&&page.items.length)assert.ok(page.items[0].source.records.length>=2);
    }
    assert.deepEqual(await digest(),baseline,'GET audit endpoint must not write any commercial/audit data');
    console.log('productAudits: ADMIN/roles, filters, microsecond cursor ties, empty/missing data, grouping, sanitization and read-only integrity approved');
  } finally { if(inserted.length)await pool.query('delete from product_family_events where id=any($1)',[inserted]); }
}

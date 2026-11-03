// Real importer/files/HTTP, but DB is an explicit in-memory double. NO PostgreSQL,
// seed, migrations, usual uploads directory, real accounts or external requests.
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const temporary = await mkdtemp(path.join(tmpdir(), 'fyf-image-stage5-'));
Object.assign(process.env, { UPLOADS_ROOT:path.join(temporary,'uploads'), DATABASE_URL:'postgresql://unused:unused@127.0.0.1:1/fyf_demo_image_unit',
  NODE_ENV:'test', SEED_DEMO_DATA:'true', MAIL_ENABLED:'false', WEBPAY_ENVIRONMENT:'integration' });
delete process.env.SEED_ACADEMIC_DATABASE; delete process.env.SEED_ACADEMIC_HOST; delete process.env.SEED_ACADEMIC_PORT;
const { demoProducts, demoDescription } = await import('../dist/db/demo/catalog.js');
const { DEMO_DATABASE_MARKER } = await import('../dist/db/demo/seedAuthorization.js');
const schema = await import('../dist/db/schema/index.js');
const manifestTools = await import('../dist/db/demo/imageManifest.js');
const { referenceCardSvg, reviewedFamilies } = await import('../scripts/prepare-demo-image-review.mjs');
const packageRoot=fileURLToPath(new URL('../../docs/seed-catalog-review/reference-package',import.meta.url));
const sourceRoot=fileURLToPath(new URL('../../docs/seed-catalog-review',import.meta.url));
const entries=JSON.parse(await readFile(path.join(packageRoot,'extracted-images.json'),'utf8'));
const categories=[...new Set(demoProducts.map(p=>p.categoryName))].map((name,i)=>({id:i+1,name}));
const products=demoProducts.map((p,i)=>({...p,id:i+1,categoryId:categories.find(c=>c.name===p.categoryName).id,description:demoDescription(p)}));
let images=[];
const query=rows=>Object.assign(Promise.resolve(rows),{orderBy(){return this;},for(){return this;}});
const db={transaction:async work=>{const previous=structuredClone(images);try{return await work({
  execute:async()=>({rows:[{name:'fyf_demo_image_unit',comment:DEMO_DATABASE_MARKER}]}),
  select:()=>({from:table=>query(table===schema.productsTable?products:table===schema.categoriesTable?categories:images)}),
  insert:table=>({values:async values=>{assert.equal(table,schema.productImagesTable);images.push({...values,id:images.length+1});}}),
});}catch(error){images=previous;throw error;}}};
mock.module(new URL('../dist/db/index.js',import.meta.url).href,{namedExports:{db}});
mock.module(new URL('../dist/modules/promotions/promotions.repository.js',import.meta.url).href,{namedExports:{acquirePromotionPricingLock:async()=>{}}});
const {importDemoImages}=await import('../dist/db/demo/imageImport.js');

test('96 distinct original cards bind exact catalog identity, dimensions and reviewed family options',async()=>{
  assert.equal(entries.length,96);assert.equal(new Set(entries.map(e=>e.sha256)).size,96);
  const families=reviewedFamilies(await readFile(new URL('../src/db/demo/families.ts',import.meta.url),'utf8'));
  assert.equal(families.length,19);assert.equal(families.reduce((n,f)=>n+f.members.length,0),71);
  for(const p of demoProducts){
    const entry=entries.find(e=>e.productKey===p.key);assert.ok(entry);assert.equal(entry.identitySha256,manifestTools.demoImageIdentity(p));
    const {buffer}=await manifestTools.readDemoImageFile(packageRoot,entry,p);
    assert.equal(buffer.readUInt32BE(16),900);assert.equal(buffer.readUInt32BE(20),900);assert.ok(buffer.length<150_000);
    const svg=referenceCardSvg(p);assert.match(svg,/NO ES FOTO DEL MODELO/);assert.match(svg,/Sin escala/);
    assert.ok(svg.includes(p.supplierCode));
    const renderedText=svg.replace(/<[^>]+>/g,' ').replaceAll('&amp;','&').replaceAll('&apos;',"'").replaceAll('&quot;','"').replace(/\s+/g,' ');
    assert.ok(renderedText.includes(p.specification),p.key+' complete specification');
  }
});

test('offline preview connects to no DB, creates no files and preserves all 13 pending supplier permissions',async()=>{
  const file=path.join(packageRoot,entries[0].file),before=await stat(file);
  const result=await manifestTools.checkDemoImagePackage(packageRoot);
  assert.equal(result.ready,96);assert.equal(result.databaseChecked,false);assert.equal(result.filesWritten,0);
  assert.equal((await stat(file)).mtimeMs,before.mtimeMs);
  const pending=await manifestTools.checkDemoImagePackage(sourceRoot);
  assert.equal(pending.ready,0);assert.equal(pending.results.filter(r=>r.result==='AUTHORIZATION_PENDING').length,13);
  const output=execFileSync(process.execPath,[fileURLToPath(new URL('../dist/db/importDemoImages.js',import.meta.url)),packageRoot,'--check-files'],{env:{...process.env,DATABASE_URL:'not-even-a-postgres-url'},encoding:'utf8'});
  assert.equal(JSON.parse(output).ready,96);
});

test('rejects wrong SKU/measure, duplicate keys, traversal, altered hash, format and authorship evidence',async()=>{
  const root=path.join(temporary,'invalid');await mkdir(path.join(root,'images'),{recursive:true});
  const canonicalRoot=await realpath(root);
  const entry=entries[0],product=demoProducts[0],buffer=await readFile(path.join(packageRoot,entry.file));
  await writeFile(path.join(root,entry.file),buffer);
  await writeFile(path.join(root,'rights-evidence.json'),await readFile(path.join(packageRoot,'rights-evidence.json')));
  const save=value=>writeFile(path.join(root,'extracted-images.json'),JSON.stringify(value));
  await save([entry,entry]);await assert.rejects(manifestTools.readDemoImageManifest(root),/duplicada/);
  await save([{...entry,productKey:'unknown'}]);await assert.rejects(manifestTools.readDemoImageManifest(root),/ajena/);
  await save([{...entry,productKey:demoProducts[1].key}]);await assert.rejects(manifestTools.readDemoImageManifest(root),/Identidad\/medida/);
  await save([entry,{...entries[1],sha256:entry.sha256}]);await assert.rejects(manifestTools.readDemoImageManifest(root),/repetida/);
  await assert.rejects(manifestTools.readDemoImageFile(canonicalRoot,{...entry,file:'../escape.png'},product),/ruta/);
  await assert.rejects(manifestTools.readDemoImageFile(canonicalRoot,{...entry,sha256:'0'.repeat(64)},product),/Hash/);
  await writeFile(path.join(root,'rights-evidence.json'),'altered');await assert.rejects(manifestTools.readDemoImageFile(canonicalRoot,entry,product),/Evidencia/);
  assert.equal(manifestTools.imageIsAuthorized({...entry,publish:false}),false);
  assert.equal(manifestTools.imageIsAuthorized({...entry,rightsStatus:'PENDING_AUTHORIZATION'}),false);
  assert.equal(manifestTools.imageIsAuthorized({...entry,authorization:{reference:'evidence',scope:'private'}}),false);
  const {validateImageBuffer}=await import('../dist/utils/imageFiles.js');
  await assert.rejects(validateImageBuffer(Buffer.from('<svg>not a png</svg>')),/JPG|PNG/);
  await assert.rejects(validateImageBuffer(Buffer.alloc(5*1024*1024+1)),/5 MB/);
});

test('existing importer: preview, association, replay, existing-photo preservation and no business writes (DB double)',async()=>{
  const untouched=JSON.stringify(products);
  const before=await importDemoImages(packageRoot);assert.equal(before.results.filter(r=>r.result==='READY').length,96);assert.equal(images.length,0);
  // An existing photograph is never replaced, even by a valid reference card.
  images.push({id:1000,productId:1,imagePath:'products/1/existing.png',position:7,isPrimary:true});
  const applied=await importDemoImages(packageRoot,true);assert.equal(applied.results.filter(r=>r.result==='ASSOCIATED').length,95);
  assert.equal(applied.results[0].result,'EXISTING_IMAGE_PRESERVED');assert.equal(images.length,96);
  const replay=await importDemoImages(packageRoot,true);assert.equal(replay.results.filter(r=>r.result==='ALREADY_ASSOCIATED').length,95);assert.equal(images.length,96);
  assert.equal(JSON.stringify(products),untouched);
  for(const row of images.slice(1)){const entry=entries[row.productId-1];const stored=path.join(process.env.UPLOADS_ROOT,row.imagePath);assert.equal(manifestTools.imageHash(await readFile(stored)),entry.sha256);}
  const pending=await importDemoImages(sourceRoot,true);assert.equal(pending.results.filter(r=>r.result==='ASSOCIATED').length,0);
  const {default:express}=await import('express');const app=express();app.use('/uploads',express.static(process.env.UPLOADS_ROOT));
  const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  try{for(const row of images.slice(1)){const response=await fetch(`http://127.0.0.1:${server.address().port}/uploads/${row.imagePath}`);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/);assert.equal(manifestTools.imageHash(Buffer.from(await response.arrayBuffer())),entries[row.productId-1].sha256);}}finally{await new Promise(resolve=>server.close(resolve));}
  const persisted=execFileSync(process.execPath,['-e',"const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))",path.join(process.env.UPLOADS_ROOT,images[1].imagePath)],{encoding:'utf8'});
  assert.equal(persisted,entries[1].sha256,'a separate process reads the same stored bytes');
});

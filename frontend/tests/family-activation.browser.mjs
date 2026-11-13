// Chromium with intercepted API, including a response lost AFTER a simulated commit.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/family-activation.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f])),entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName,css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const revision='a'.repeat(64),errors=[];
const shots=await mkdtemp(path.join(process.env.FYF_UX_SCREENSHOT_DIR||tmpdir(),'fyf-family-activation-'));
try{for(const theme of ['light','dark'])for(const width of [320,360,375,400,1280,1440]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();let committed=false,posts=0,recoveries=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),method=route.request().method();let data;
   if(url.pathname.startsWith('/api/')){
     if(url.pathname.endsWith('/activation-eligibility'))data=url.pathname.includes('/18/')&&!committed?{eligible:true,familyId:18,sourceEventId:101,expectedRevision:revision,productIds:[1,2],previouslyInactiveProductIds:[3]}:{eligible:false,reason:'Usa activación individual'};
     else if(url.pathname.endsWith('/bundle'))data={revision,family:{name:'Familia selectiva'},variants:(await page.evaluate(()=>window.fixtureProducts.filter(p=>p.familyId===18))).map(p=>({...p,status:committed&&[1,2].includes(p.id)?true:p.status}))};
     else if(url.pathname.endsWith('/activations')&&method==='POST'){
       posts++;const body=route.request().postDataJSON();assert.equal(body.sourceEventId,101);assert.equal(body.expectedRevision,revision);committed=true;return route.fulfill({status:503,json:{message:'Respuesta perdida simulada. Consulta el resultado.'}});
     }else if(url.pathname.includes('/activations/')){recoveries++;data={operation:'FAMILY_ACTIVATE',productIds:[1,2],previouslyInactiveProductIds:[3],sourceEventId:101};}
     else if(url.pathname==='/api/products')data=await page.evaluate(()=>window.fixtureProducts.map(p=>({...p,status:[1,2].includes(p.id)?true:p.status})));
     else throw Error('Unexpected API '+method+' '+url.pathname);
     return route.fulfill({json:{data}});
   }
   if(url.hostname!=='127.0.0.1')return route.abort();const f=files.get(url.pathname);
   return route.fulfill(f?{contentType:f.fileName.endsWith('.css')?'text/css':'application/javascript',body:f.type==='chunk'?f.code:f.source}:{contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
 });
 await page.goto(`http://127.0.0.1:5185/?theme=${theme}`);
 if(width<1000){await page.getByRole('button',{name:/Mostrar detalles de Familia sin evento · SKU/}).click();}
 const notice=page.locator('.inventory-individual-notice:visible').first();await notice.waitFor();
 assert.equal(await notice.textContent(),'Activación individual en Editar');assert.equal(await notice.getAttribute('tabindex'),null);assert.equal(await notice.getAttribute('role'),null);
 assert.equal(await notice.locator('span').count(),2);assert.ok(await notice.evaluate(e=>e.children[1].getBoundingClientRect().top>e.children[0].getBoundingClientRect().top));
 if([375,1280].includes(width))await page.screenshot({path:path.join(shots,`actions-${width}-${theme}.png`),fullPage:true});
 if(width<1000)await page.getByRole('button',{name:/Mostrar detalles de Familia selectiva · SKU/}).click();
 await page.getByRole('button',{name:'Activar familia',exact:true}).filter({visible:true}).click();
 const modal=page.getByRole('dialog');await modal.getByText('Familia #18 · Familia selectiva').waitFor();
 assert.match(await modal.innerText(),/Sin cambio, ya inactivas: Producto #3/);
 await modal.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(posts,0);
 await page.getByRole('button',{name:'Activar familia',exact:true}).filter({visible:true}).click();
 await modal.getByLabel('Motivo de activación').fill('Restauración selectiva de prueba');await modal.getByRole('checkbox').check();
 await modal.getByRole('button',{name:'Activar familia',exact:true}).dblclick();await modal.getByRole('button',{name:'Consultar resultado'}).waitFor();assert.equal(posts,1);
 await page.reload();
 if(width<1000)await page.getByRole('button',{name:/Mostrar detalles de Familia selectiva · SKU/}).click();
 await page.getByRole('button',{name:'Consultar activación',exact:true}).click();
 await modal.getByRole('button',{name:'Consultar resultado'}).waitFor();assert.equal(posts,1,'Reload does not automatically replay a command');
 await modal.getByRole('button',{name:'Consultar resultado'}).click();await modal.waitFor({state:'hidden'});assert.equal(recoveries,1);
 assert.deepEqual(JSON.parse(await page.getByTestId('states').textContent()).slice(0,3),[[1,true],[2,true],[3,false]]);
 if(width>=1000){const xs=await page.locator('[data-responsive-table="desktop"] .inventory-edit-action').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().x));assert.ok(Math.max(...xs)-Math.min(...xs)<1,'Edit column stays fixed across action types');}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(posts,1);
 await context.close();console.log(`PASS activation UI ${width}px ${theme}: selective confirmation, noninteractive notice, lost-response recovery, aligned Edit`);
}assert.deepEqual(errors,[]);console.log('Screenshots:',shots);}finally{await browser.close();}

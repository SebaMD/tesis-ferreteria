// Real pages, intercepted read-only APIs and synthetic records; no server or DB.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/responsive-controls.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f]));
const entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName;
const css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const shots=await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR||tmpdir(),'fyf-final-frontend-'));
let cases=0,exportFilesGenerated=0;
const downloadLimitations=[];
const sale={id:1,userId:1,userNames:'Persona',userSurnames:'Prueba',date:'2026-11-08T15:00:00Z',paymentMethod:'efectivo',status:'PARTIALLY_RETURNED',total:5000,returnedTotal:3000,netTotal:2000,details:[],cancellationRequests:[{id:1,status:'APPROVED',requesterNames:'Persona',requesterSurnames:'Prueba',reason:'Motivo simulado',requestedTotal:3000,requestedAt:'2026-11-08T16:00:00Z',details:[{productId:1,productName:'Artículo de prueba · medida registrada',requestedQuantity:1,requestedSubtotal:1000},{productId:2,productName:'Otro artículo de prueba',requestedQuantity:2,requestedSubtotal:2000}]}]};
async function open(mode,width,dark,extra=''){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,timezoneId:'America/Santiago',reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z'));
 const queries=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){
   assert.equal(route.request().method(),'GET','No writes, verification emails or operations are permitted');
   let data=[];
   if(url.pathname.endsWith('/manager-statistics')){queries.push(Object.fromEntries(url.searchParams));data={};}
   else if(url.pathname==='/api/reports/sales'){queries.push(Object.fromEntries(url.searchParams));data={sales:[sale],byCashier:[],byPaymentMethod:[],salesCount:1,total:2000};}
   else if(url.pathname==='/api/sales')data=[sale];
   else if(url.pathname==='/api/sales/1')data=sale;
   else if(url.pathname==='/api/products')data=Array.from({length:Number(new URLSearchParams(extra).get('count')??1)},(_,i)=>({id:i+1,name:`Artículo sintético ${i+1}`,status:true,currentStock:1,minimumStock:3,categoryName:'Prueba',unitMeasure:'unidad',price:1000}));
   else if(url.pathname==='/api/order-logistics')data=Array.from({length:4},(_,i)=>({id:i+1,origin:'ONLINE',status:'PAID',deliveryType:'PICKUP',createdAt:'2026-11-08T15:00:00Z'}));
   return route.fulfill({json:{data}});
  }
  const f=files.get(url.pathname);return route.fulfill(f?{contentType:f.fileName.endsWith('.css')?'text/css':'text/javascript',body:f.type==='chunk'?f.code:f.source}:{contentType:'text/html',body:`<!doctype html><html class="${dark?'dark':''}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
 });
 // Every request is fulfilled above; there is no network connection to this host.
 await page.goto(`https://final-ui.test/?mode=${mode}&${extra}`);
 return {page,context,queries,errors};
}
async function choose(page,label){await page.getByRole('combobox').first().click();await page.getByRole('option',{name:label,exact:true}).click();}
async function settle(page){await page.evaluate(()=>new Promise(requestAnimationFrame));}
try{
 for(const width of [360,390,430,1280])for(const dark of [false,true]){
  let statisticsDayWidth;
  for(const mode of ['statistics','reports']){
   const {page,context,queries,errors}=await open(mode,width,dark);
   const submit=page.getByRole('button',{name:'Consultar',exact:true});await submit.waitFor();await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
   const count=queries.length;
   for(const label of ['Día actual','Últimos 7 días','Últimos 30 días','Mes actual','Por día','Rango personalizado'])await choose(page,label);
   assert.equal(queries.length,count,'Choosing periods alone does not send requests');
   async function consult(){await Promise.all([page.waitForResponse(r=>r.url().includes(mode==='statistics'?'/manager-statistics':'/reports/sales')),submit.click()]);await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);}
   await choose(page,'Día actual');await consult();assert.equal(queries.at(-1).from,'2026-11-09');assert.equal(queries.at(-1).to,'2026-11-09');
   if(mode==='statistics'&&width===1280){const dates=await page.locator('.period-filter-dates').boundingBox(),actions=await page.locator('.period-filter-actions').boundingBox();assert.ok(dates.width<400);assert.ok(actions.x>=dates.x+dates.width+8);const edge=await page.locator('form').evaluate(el=>{const s=getComputedStyle(el);return el.getBoundingClientRect().right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth);});assert.ok(Math.abs(actions.x+actions.width-edge)<2);const a=await submit.boundingBox(),b=await page.getByRole('button',{name:'Restablecer',exact:true}).boundingBox();assert.ok(Math.abs(a.y-b.y)<1);await page.screenshot({path:path.join(shots,`statistics-preset-${dark?'dark':'light'}.png`)});}
   await choose(page,'Por día');await page.getByLabel('Fecha',{exact:true}).fill('2026-02-28');await consult();assert.equal(queries.at(-1).from,'2026-02-28');assert.equal(queries.at(-1).to,'2026-02-28');
   const dayWidth=(await page.getByLabel('Fecha',{exact:true}).boundingBox()).width;
   if(mode==='statistics')statisticsDayWidth=dayWidth;else if(width===1280)assert.ok(Math.abs(dayWidth-statisticsDayWidth)<2,'Statistics and Reports use equivalent single-date widths');
   if(width===1280)assert.ok(dayWidth>=250);
   await choose(page,'Rango personalizado');const from=page.getByLabel('Desde',{exact:true}),to=page.getByLabel('Hasta',{exact:true});let n=queries.length;
   assert.equal(await submit.isEnabled(),true);assert.equal(await page.locator('form [role="alert"]').count(),0);assert.equal(await from.inputValue(),'2026-11-08');assert.equal(await to.inputValue(),'2026-11-09');
   async function reject(){assert.equal(await submit.isDisabled(),true);await page.locator('form').evaluate(form=>form.requestSubmit());await settle(page);assert.equal(queries.length,n);}
   await from.fill('2026-02-28');await to.fill('2026-02-28');assert.match(await page.locator('form [role="alert"]').innerText(),/Desde debe ser anterior/);
   await reject();await to.fill('2026-03-01');await consult();if(mode==='reports')assert.equal(queries.at(-1).mode,'range');
   if(width===1280){const a=await from.boundingBox(),b=await to.boundingBox();assert.ok(a.width>=210&&b.width>=210);assert.ok(Math.abs(a.width-b.width)<2);if(mode==='statistics'){const actions=await page.locator('.period-filter-actions').boundingBox(),form=await page.locator('form').boundingBox(),button=await submit.boundingBox();assert.ok(actions.x>b.x+b.width);assert.ok(Math.abs(button.y-a.y)<3);assert.ok(form.x+form.width-actions.x-actions.width<25);}await page.screenshot({path:path.join(shots,`${mode}-custom-${dark?'dark':'light'}.png`)});}
   await from.fill('2026-03-02');await to.fill('2026-03-01');n=queries.length;await reject();
   await from.fill('');await reject();assert.equal(await to.inputValue(),'2026-03-01');
   await from.fill('2026-03-01');await to.fill('2026-11-10');await reject();
   await to.fill('2026-03-02');await consult();assert.equal(queries.at(-1).from,'2026-03-01');assert.equal(queries.at(-1).to,'2026-03-02');
   await from.fill('2024-01-01');await to.fill('2026-01-02');n=queries.length;
   if(mode==='statistics'){await reject();}else{await consult();assert.equal(queries.at(-1).from,'2024-01-01');}
   if(mode==='reports'&&width===1280){
    // Observe the real generated Blob without changing creation, click or revocation.
    await page.evaluate(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.fixtureExportBytes=blob.arrayBuffer().then(buffer=>Array.from(new Uint8Array(buffer)));return create(blob);};});
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar Excel',exact:true}).click()]);
    assert.match(download.suggestedFilename(),/^reporte-ventas-2024-01-01_a_2026-01-02\.xlsx$/);
    const bytes=Buffer.from(await page.evaluate(()=>window.fixtureExportBytes));assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.includes(Buffer.from('Total neto')));assert.ok(bytes.includes(Buffer.from('2000')));exportFilesGenerated++;
    const failure=await download.failure();if(failure)downloadLimitations.push(`${dark?'dark':'light'}: ${failure}`);
   }
   if(width===1280)await page.screenshot({path:path.join(shots,`${mode}-${dark?'dark':'light'}.png`),fullPage:true});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log('OVERFLOW',mode,width,await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,cls:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(el=>el.right>innerWidth+1&&el.left>=0).slice(0,15)));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();cases++;
  }
  {
   const {page,context,errors}=await open('sales',width,dark,'view=history');if(width<1000)await page.getByRole('button',{name:'Mostrar detalles de V-000001',exact:true}).click();await page.getByRole('button',{name:'Detalle',exact:true}).first().click();await page.getByRole('button',{name:'Historial de devoluciones (1)',exact:true}).click();await page.locator('.sale-return-history-item-toggle').click();
   const values=page.locator('.sale-return-values');assert.equal(await values.count(),2);
   assert.match(await values.nth(0).innerText(),/1 unidad\s*·\s*\$1\.000/);assert.match(await values.nth(1).innerText(),/2 unidades\s*·\s*\$2\.000/);
   for(const row of await values.all()){const q=await row.locator('.return-quantity').boundingBox(),price=await row.locator('strong').boundingBox();assert.ok(Math.abs(q.y-price.y)<5);assert.ok(price.x-q.x-q.width<30);}
   const undo=page.getByRole('button',{name:'Deshacer devolución',exact:true});const b=await undo.boundingBox(),parent=await undo.evaluate(el=>el.parentElement.getBoundingClientRect().width);assert.ok(Math.abs(b.width-parent)<2);
   if(width===390||width===1280){await undo.scrollIntoViewIfNeeded();await page.locator('.sale-return-history-item').screenshot({path:path.join(shots,`returns-${width}-${dark?'dark':'light'}.png`)});}
   assert.deepEqual(errors,[]);await context.close();cases++;
  }
  for(const role of ['WAREHOUSE','ADMIN','MANAGER'])for(const count of [0,1,5]){
   const {page,context,errors}=await open('dashboard',width,dark,`role=${role}&count=${count}`);const card=page.locator('.dashboard-summary-panels > section').filter({has:page.getByRole('heading',{name:'Productos a reponer',exact:true})});
   await page.waitForFunction(n=>document.querySelector('.dashboard-summary-panels section')?.textContent.includes(n===0?'No hay productos con stock bajo.':'Artículo sintético 1'),count);
   const geometry=await card.evaluate(el=>({height:el.getBoundingClientRect().height,header:el.firstElementChild.getBoundingClientRect().bottom,first:el.lastElementChild.firstElementChild.getBoundingClientRect().top}));assert.ok(geometry.first-geometry.header<3);if(count<=1)assert.ok(geometry.height<230);
   if(count===1&&role==='WAREHOUSE'&&width===1280)await card.screenshot({path:path.join(shots,`dashboard-${dark?'dark':'light'}.png`)});
   assert.deepEqual(errors,[]);await context.close();cases++;
  }
  {
   const {page,context,errors}=await open('work-email',width,dark);const logout=page.getByRole('button',{name:'Cerrar sesión',exact:true});await logout.waitFor();
   const geometry=await logout.evaluate(el=>{const parent=el.parentElement,s=getComputedStyle(parent),r=el.getBoundingClientRect();return {width:r.width,inner:parent.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),justify:getComputedStyle(el).justifyContent};});assert.ok(Math.abs(geometry.width-geometry.inner)<2);assert.equal(geometry.justify,'center');await logout.click();assert.equal(await page.evaluate(()=>window.fixtureLogoutCalls),1);assert.deepEqual(errors,[]);await context.close();cases++;
  }
  console.log(`PASS matrix ${width}px ${dark?'dark':'light'}`);
 }
 console.log(`PASS ${cases} real-page cases: periods/validation, compact returns, independent dashboard heights and verification logout. ${exportFilesGenerated} real XLSX Blobs/filenames verified. Screenshots: ${shots}`);
 if(downloadLimitations.length)console.log(`LIMITATION: saving downloaded XLSX to disk was not verified: ${downloadLimitations.join('; ')}. The export helper was not modified; manual browser download remains required.`);
}finally{await browser.close();}

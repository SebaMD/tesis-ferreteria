// Real pages with an in-memory bundle and intercepted APIs; no application servers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/responsive-controls.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(file=>['/'+file.fileName,file])),entry=bundle.output.find(file=>file.type==='chunk'&&file.isEntry).fileName;
const css=bundle.output.filter(file=>file.fileName.endsWith('.css')).map(file=>`<link rel="stylesheet" href="/${file.fileName}">`).join('');
const screenshots=await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR||tmpdir(),'fyf-period-panel-'));
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let cases=0;
async function open(mode,width,dark,initialFailure=false){
 const context=await browser.newContext({viewport:{width,height:950},hasTouch:width<720,timezoneId:'America/Santiago'});
 const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z'));
 const state={fail:initialFailure,hold:false,release:null,started:null},requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){
   assert.equal(route.request().method(),'GET');requests.push(Object.fromEntries(url.searchParams));
   if(state.hold){state.hold=false;await new Promise(resolve=>{state.release=resolve;state.started?.();});}
   if(state.fail)return route.fulfill({status:503,json:{message:'Fallo de consulta simulado'}});
   const amount=1000+requests.length*100;
   return route.fulfill({json:{data:mode==='statistics'?{kpis:{netSales:amount}}:{sales:[],byCashier:[],byPaymentMethod:[],total:amount}}});
  }
  const file=files.get(url.pathname);return route.fulfill(file?{contentType:file.fileName.endsWith('.css')?'text/css':'text/javascript',body:file.type==='chunk'?file.code:file.source}:{contentType:'text/html',body:`<!doctype html><html class="${dark?'dark':''}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
 });
 await page.goto(`https://period-panel.test/?mode=${mode}`);
 await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
 return {page,context,state,requests,errors};
}
async function choose(page,label){await page.getByRole('combobox').first().click();await page.getByRole('option',{name:label,exact:true}).click();}
async function layout(page,width,mode){
 const panel=page.locator('.period-filter-panel'),selector=page.locator('.period-filter-selector'),buttons=page.locator('.period-filter-buttons');
 const content=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth),right:r.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth)};});
 const select=await selector.boundingBox(),combo=await page.getByRole('combobox').first().boundingBox(),dates=await page.locator('.period-filter-dates').boundingBox(),indicator=await page.locator('.period-filter-indicator').boundingBox(),first=await buttons.locator('button').nth(0).boundingBox(),second=await buttons.locator('button').nth(1).boundingBox();
 assert.equal(await panel.getByRole('heading',{name:mode==='statistics'?'Período de Estadísticas':'Período del reporte',exact:true}).count(),1);
 assert.equal(await panel.getByText('Selecciona fecha o rango. No se permiten fechas futuras.',{exact:true}).count(),1);
 if(width<=720){
  assert.ok(Math.abs(select.x-content.left)<2&&Math.abs(select.x+select.width-content.right)<2);
  assert.ok(Math.abs(combo.width-select.width)<2);assert.ok(Math.abs(dates.width-select.width)<2);
  for(const button of [first,second])assert.ok(Math.abs(button.width-select.width)<2&&Math.abs(button.x-content.left)<2);
  assert.ok(indicator.y>=dates.y+dates.height);assert.ok(first.y>=indicator.y+indicator.height);assert.ok(second.y>=first.y+first.height);
  assert.ok(Math.abs(first.height-second.height)<2);
 }else{
  assert.ok(Math.abs(first.y-second.y)<2);assert.ok(Math.abs(second.x+second.width-content.right)<2);assert.ok(Math.abs(select.x+select.width-content.right)<2);
  if(width>=1280){
   assert.ok(dates.y>select.y&&first.x>dates.x+dates.width);
   for(const input of await page.locator('.period-filter-dates input').all())assert.ok((await input.boundingBox()).width>=200,'Desktop date fields retain the Reports reference width');
  }
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const colors=await page.locator('.period-filter-indicator').evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
 const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(v=>{const c=Number(v)/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;};
 const a=luminance(colors.fg),b=luminance(colors.bg);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,'Indicator text contrast');
}
try{
 for(const width of [360,390,430,768,1280])for(const dark of [false,true])for(const mode of ['statistics','reports']){
  const {page,context,state,requests,errors}=await open(mode,width,dark);
  const indicator=page.locator('.period-filter-indicator'),submit=page.getByRole('button',{name:'Consultar',exact:true});
  const initial=await indicator.innerText();assert.match(initial,mode==='statistics'?/últimos 30 días/:/ventas de hoy/);
  assert.equal(await page.getByText(/^Período consultado:/).count(),0);
  await layout(page,width,mode);
  const count=requests.length;await choose(page,'Rango personalizado');
  assert.equal(await indicator.innerText(),initial);assert.equal(requests.length,count);
  assert.equal(await page.getByLabel('Desde',{exact:true}).inputValue(),'2026-11-08');assert.equal(await page.getByLabel('Hasta',{exact:true}).inputValue(),'2026-11-09');
  await layout(page,width,mode);
  await Promise.all([page.waitForResponse(response=>response.url().includes('/api/reports/')),submit.click()]);await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
  const custom=await indicator.innerText();assert.match(custom,mode==='statistics'?/08-11-2026 al 09-11-2026/:/2026-11-08 hasta 2026-11-09/);
  await choose(page,'Por día');await page.getByLabel('Fecha',{exact:true}).fill('2026-11-07');assert.equal(await indicator.innerText(),custom);await layout(page,width,mode);
  state.hold=true;const started=new Promise(resolve=>{state.started=resolve;});await Promise.all([started,submit.click()]);assert.equal(await indicator.innerText(),custom,'Pending requests do not change the applied indicator');
  state.release();await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
  const day=await indicator.innerText();assert.match(day,mode==='statistics'?/del 07-11-2026/:/día 2026-11-07/);
  const metric=page.locator('article').filter({has:page.getByText(mode==='statistics'?'Monto neto vendido':'Total vendido',{exact:true})}).first();const metricBefore=await metric.innerText();
  await choose(page,'Día actual');assert.equal(await indicator.innerText(),day);state.fail=true;
  await Promise.all([page.waitForResponse(response=>response.status()===503),submit.click()]);await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
  assert.equal(await indicator.innerText(),day,'A failed request must not claim a new period');assert.equal(await metric.innerText(),metricBefore,'Failed queries preserve the displayed data');state.fail=false;
  if(mode==='statistics')for(const [label,expected] of [['Día actual',/de hoy/],['Últimos 7 días',/últimos 7 días/],['Mes actual',/mes actual/]]){await choose(page,label);await Promise.all([page.waitForResponse(response=>response.url().includes('/api/reports/')),submit.click()]);await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);assert.match(await indicator.innerText(),expected);}
  await choose(page,'Rango personalizado');await layout(page,width,mode);
  await page.locator('.period-filter-panel').screenshot({path:path.join(screenshots,`${mode}-${width}-${dark?'dark':'light'}.png`)});
  assert.deepEqual(errors,[]);await context.close();cases++;
 }
 for(const mode of ['statistics','reports']){
  const {page,context,errors}=await open(mode,390,true,true);
  assert.match(await page.locator('.period-filter-indicator').innerText(),/Todavía no hay/);assert.deepEqual(errors,[]);await context.close();cases++;
 }
 console.log(`PASS ${cases} period-panel cases: 360/390/430/768/1280px, both themes, real pages, full-width mobile controls, desktop alignment, applied/pending/failed period indicators, initial failure, contrast and no overflow. Screenshots: ${screenshots}`);
}finally{await browser.close();}

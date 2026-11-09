// Real Statistics/Reports pages. All traffic is intercepted; no server or database.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/responsive-controls.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(file=>['/'+file.fileName,file]));
const entry=bundle.output.find(file=>file.type==='chunk'&&file.isEntry).fileName;
const css=bundle.output.filter(file=>file.fileName.endsWith('.css')).map(file=>`<link rel="stylesheet" href="/${file.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let cases=0;
try{
 for(const width of [360,390,430,1280])for(const dark of [false,true])for(const mode of ['statistics','reports']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<700,timezoneId:'America/Santiago',locale:'es-CL'});
  const page=await context.newPage();page.setDefaultTimeout(10000);await page.clock.setFixedTime(new Date('2026-11-09T15:00:00Z'));
  const queries=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET');queries.push({path:url.pathname,...Object.fromEntries(url.searchParams)});return route.fulfill({json:{data:{}}});}
   const file=files.get(url.pathname);return route.fulfill(file?{contentType:file.fileName.endsWith('.css')?'text/css':'text/javascript',body:file.type==='chunk'?file.code:file.source}:{contentType:'text/html',body:`<!doctype html><html class="${dark?'dark':''}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
  });
  await page.goto(`https://calendar.test/?mode=${mode}`);
  const submit=page.getByRole('button',{name:'Consultar',exact:true});await submit.waitFor();await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
  const choose=async label=>{await page.getByRole('combobox').first().click();await page.getByRole('option',{name:label,exact:true}).click();};
  const countBefore=queries.length;await choose('Rango personalizado');
  const from=page.getByLabel('Desde',{exact:true}),to=page.getByLabel('Hasta',{exact:true});
  assert.equal(await from.inputValue(),'2026-11-08');assert.equal(await to.inputValue(),'2026-11-09');
  assert.equal(await page.locator('form [role="alert"]').count(),0);assert.equal(await submit.isEnabled(),true);assert.equal(queries.length,countBefore);
  const accepts=(field,value)=>field.evaluate((el,date)=>{const candidate=el.cloneNode();candidate.value=date;return candidate.checkValidity();},value);
  const noRequest=async()=>{const before=queries.length;await page.locator('form').evaluate(form=>form.requestSubmit());await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(queries.length,before);};
  const consult=async()=>{await Promise.all([page.waitForResponse(response=>response.url().includes(mode==='statistics'?'/manager-statistics':'/reports/sales')),submit.click()]);await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);};

  await from.fill('');await to.fill('');assert.equal(await from.getAttribute('max'),'2026-11-08');assert.equal(await accepts(from,'2026-11-09'),false);
  await to.fill('2026-11-09');assert.equal(await from.getAttribute('max'),'2026-11-08');
  for(const date of ['2026-11-09','2026-11-10'])assert.equal(await accepts(from,date),false);
  assert.equal(await accepts(from,'2026-11-08'),true);await from.fill('2026-11-08');
  assert.equal(await to.getAttribute('min'),'2026-11-09');assert.equal(await accepts(to,'2026-11-08'),false);assert.equal(await accepts(to,'2026-11-07'),false);assert.equal(await accepts(to,'2026-11-10'),false);
  assert.equal(queries.length,countBefore,'Editing calendar endpoints alone does not query');
  await consult();assert.equal(queries.at(-1).from,'2026-11-08');assert.equal(queries.at(-1).to,'2026-11-09');

  await to.fill('');await from.fill('');await from.fill('2026-11-06');assert.equal(await to.getAttribute('min'),'2026-11-07');
  assert.equal(await accepts(to,'2026-11-06'),false);assert.equal(await accepts(to,'2026-11-05'),false);assert.equal(await accepts(to,'2026-11-07'),true);
  await to.fill('2026-11-07');await consult();
  assert.equal(await from.inputValue(),'2026-11-06');assert.equal(await to.inputValue(),'2026-11-07','Response/loading renders do not reinitialize dates');
  const savedCount=queries.length;await choose('Últimos 7 días');await choose('Rango personalizado');
  assert.equal(await from.inputValue(),'2026-11-06');assert.equal(await to.inputValue(),'2026-11-07');assert.equal(queries.length,savedCount);
  await choose('Por día');await page.getByLabel('Fecha',{exact:true}).fill('2026-11-01');await choose('Rango personalizado');
  assert.equal(await from.inputValue(),'2026-11-06');assert.equal(await to.inputValue(),'2026-11-07');assert.equal(queries.length,savedCount);
  await from.focus();for(let i=0;i<5&&!await to.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');assert.equal(await to.evaluate(el=>el===document.activeElement),true);
  for(let i=0;i<5&&!await from.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Shift+Tab');assert.equal(await from.evaluate(el=>el===document.activeElement),true);

  // Native calendars honor min/max; fill intentionally models manual/scripted bypass.
  await from.fill('2026-11-08');assert.equal(await to.inputValue(),'2026-11-07');assert.equal(await submit.isDisabled(),true);await noRequest();
  await from.fill('2026-11-07');assert.equal(await to.inputValue(),'2026-11-07');assert.equal(await accepts(from,'2026-11-07'),false);assert.equal(await accepts(to,'2026-11-07'),false);
  assert.equal(await from.getAttribute('aria-invalid'),'true');const describedBy=await from.getAttribute('aria-describedby');assert.ok(describedBy);assert.match(await page.locator(`[id="${describedBy}"]`).innerText(),/Desde debe ser anterior/);
  assert.equal(await page.getByText('Para consultar un solo día, selecciona la opción Por día.',{exact:true}).count(),0);await noRequest();
  await choose('Rango personalizado');assert.equal(await from.inputValue(),'2026-11-07');assert.equal(await to.inputValue(),'2026-11-07','Reselecting the active mode does not overwrite an edit');
  await from.fill('2026-11-06');assert.equal(await to.inputValue(),'2026-11-07');assert.equal(await submit.isEnabled(),true);
  await from.fill('2026-11-10');await noRequest();assert.equal(await from.inputValue(),'2026-11-10');assert.equal(await to.inputValue(),'2026-11-07');
  await from.fill('');assert.equal(await submit.isDisabled(),true);await noRequest();

  for(const [a,b] of [['2025-12-31','2026-01-01'],['2024-02-29','2024-03-01']]){
   await from.fill(a);await to.fill(b);assert.equal(await from.getAttribute('max'),a);assert.equal(await to.getAttribute('min'),b);await consult();assert.equal(queries.at(-1).from,a);assert.equal(queries.at(-1).to,b);
  }
  await from.fill('2024-01-01');await to.fill('2024-12-31');
  if(mode==='statistics'){
   assert.equal(await from.getAttribute('min'),'2024-01-01');assert.equal(await to.getAttribute('max'),'2024-12-31');assert.equal(await accepts(to,'2025-01-01'),false);assert.equal(await accepts(from,'2023-12-31'),false);
   await consult();await to.fill('2025-01-01');assert.equal(await submit.isDisabled(),true);await noRequest();
  }else{
   assert.equal(await to.getAttribute('max'),'2026-11-09');assert.equal(await accepts(to,'2025-01-01'),true);await to.fill('2025-01-01');await consult();
  }
  await choose('Por día');const day=page.getByLabel('Fecha',{exact:true});await day.fill('2026-11-09');assert.equal(await day.getAttribute('min'),null);await consult();assert.equal(queries.at(-1).from,'2026-11-09');assert.equal(queries.at(-1).to,'2026-11-09');if(mode==='reports')assert.equal(queries.at(-1).mode,'single');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
  const beforeRollover=queries.length;await page.clock.setFixedTime(new Date('2026-11-10T15:00:00Z'));await choose('Rango personalizado');
  assert.equal(await from.inputValue(),'2026-11-09');assert.equal(await to.inputValue(),'2026-11-10','Initialization reads today at interaction time, not the previous render');assert.equal(queries.length,beforeRollover);assert.equal(await page.locator('form [role="alert"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await context.close();cases++;
 }
 console.log(`PASS ${cases} native-date matrices: initial yesterday/today without errors/queries, saved custom ranges, render stability, both entry orders, strict calendar bounds, month/year/leap day, future/366-day limits, keyboard navigation and single-day mode. All APIs mocked.`);
}finally{await browser.close();}

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/responsive-controls.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f])),entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName,css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let matrices=0;
try {for(const width of [360,390,430,1280])for(const dark of [false,true]){
 const ctx=await browser.newContext({viewport:{width,height:850},hasTouch:true});const page=await ctx.newPage();const errors=[],queries=[];page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET','Responsive tests must not write');if(url.pathname.endsWith('/manager-statistics'))queries.push(url.search);return route.fulfill({json:{data:url.pathname.endsWith('/manager-statistics')?{}:url.pathname.endsWith('/categories')?[{id:1,name:'Prueba'}]:[]}});}const f=files.get(url.pathname);return route.fulfill(f?{contentType:f.fileName.endsWith('.css')?'text/css':'text/javascript',body:f.type==='chunk'?f.code:f.source}:{contentType:'text/html',body:`<html class="${dark?'dark':''}"><head>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});});
 await page.goto('http://responsive.test/');await page.getByRole('combobox',{name:'Categoría'}).tap();await page.getByRole('listbox').waitFor();assert.equal(await page.getByPlaceholder('Buscar...').evaluate(el=>el===document.activeElement),false);
 await page.setViewportSize({width,height:550});await page.getByRole('listbox').waitFor();await page.getByPlaceholder('Buscar...').tap();await page.getByPlaceholder('Buscar...').fill('Categoría 8');await page.getByRole('option',{name:'Categoría 8',exact:true}).tap();await page.getByRole('listbox').waitFor({state:'detached'});assert.equal(await page.locator('output').innerText(),'8');
 await page.getByRole('combobox',{name:'Categoría'}).tap();await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'detached'});
 const title=await page.getByRole('heading',{name:'Pedidos en curso'}).boundingBox(),count=await page.locator('[data-count]').boundingBox();assert.ok(Math.abs(title.y-count.y)<8);assert.ok(count.x>title.x);
 if(width<=680){const badge=await page.locator('.order-summary-status').boundingBox(),qty=await page.locator('.order-summary-heading > div > span:last-child').boundingBox(),name=await page.getByText('Artículo de prueba',{exact:true}).boundingBox();assert.ok(badge.y>=name.y+name.height);assert.ok(Math.abs(badge.y-qty.y)<6);}
 if(width<=680){const a=await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).boundingBox(),b=await page.getByRole('button',{name:'Cancelar dirección',exact:true}).boundingBox();assert.ok(Math.abs(a.width-b.width)<1);assert.ok(b.y>=a.y+a.height);const q=await page.locator('.return-quantity').boundingBox(),price=await page.locator('.sale-return-product strong').boundingBox();assert.ok(Math.abs(q.y-price.y)<4);assert.ok(price.x-q.x-q.width<30);}
 await page.getByRole('button',{name:'Desactivar',exact:true}).tap();await page.getByRole('dialog').waitFor();assert.equal(await page.getByLabel('Contraseña actual').evaluate(el=>el===document.activeElement),false);
 if(width<=680){const a=await page.getByRole('button',{name:'Cancelar',exact:true}).boundingBox(),b=await page.getByRole('button',{name:'Confirmar',exact:true}).boundingBox();assert.ok(Math.abs(a.width-b.width)<1);assert.ok(b.y>=a.y+a.height);}
 await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{value:300,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'));});
 assert.ok((await page.getByRole('dialog').boundingBox()).height<=276);
 await page.getByRole('button',{name:'Confirmar',exact:true}).scrollIntoViewIfNeeded();
 await page.setViewportSize({width,height:850});
 await page.goto('http://responsive.test/?mode=inventory');
 await page.getByRole('button',{name:'Nuevo producto',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.matches('[data-new-product-name]'));
 await page.getByRole('button',{name:'Producto con variantes',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.matches('[data-bundle-field="generalName"]'));
 await page.getByRole('dialog').getByRole('button',{name:'Cerrar diálogo',exact:true}).click();
 await page.getByRole('button',{name:'Gestionar categorías',exact:true}).click();
 assert.equal(await page.getByRole('dialog').evaluate(el=>document.activeElement?.tagName==='INPUT'&&el.contains(document.activeElement)),false);
 await page.getByRole('dialog').getByRole('button',{name:'Cerrar diálogo',exact:true}).click();
 for(const name of ['Registrar entrada','Ajuste administrativo']){
   await page.getByRole('button',{name,exact:true}).click();
   await page.waitForFunction(()=>document.activeElement?.getAttribute('placeholder')==='Buscar por producto, ID o categoría');
   await page.getByRole('dialog').getByRole('button',{name:'Cerrar diálogo',exact:true}).click();
 }
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await page.getByRole('link',{name:'Movimientos recientes',exact:true}).click();
 await page.waitForFunction(()=>{const h=document.querySelector('h1')?.getBoundingClientRect();return h&&h.top>=60&&h.top<250;});
 await page.goto('http://responsive.test/?mode=statistics');
 await page.getByRole('button',{name:'Consultar',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled);
 await page.getByRole('combobox').click();await page.getByRole('option',{name:'Rango personalizado',exact:true}).click();
 const from=page.getByLabel('Desde',{exact:true}),to=page.getByLabel('Hasta',{exact:true});
 await from.fill('2026-01-02');await to.fill('2026-01-01');
 let before=queries.length;assert.equal(await page.getByRole('button',{name:'Consultar',exact:true}).isDisabled(),true);await page.locator('form').evaluate(form=>form.requestSubmit());await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(queries.length,before);
 await from.fill('');await page.locator('form').evaluate(form=>form.requestSubmit());await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(queries.length,before);
 await from.fill('2026-01-01');
 assert.equal(await page.getByRole('button',{name:'Consultar',exact:true}).isDisabled(),true);assert.match(await page.getByRole('alert').first().innerText(),/Desde debe ser anterior/);await to.fill('2026-01-02');
 await Promise.all([page.waitForResponse(r=>r.url().includes('/manager-statistics')),page.getByRole('button',{name:'Consultar',exact:true}).click()]);
 assert.ok(queries.at(-1).includes('from=2026-01-01')&&queries.at(-1).includes('to=2026-01-02'));
 await page.getByRole('combobox').click();await page.getByRole('option',{name:'Últimos 7 días',exact:true}).click();
 await page.getByLabel('Desde',{exact:true}).waitFor({state:'detached'});
 await page.getByRole('combobox').click();await page.getByRole('option',{name:'Rango personalizado',exact:true}).click();
 assert.notEqual(await page.getByLabel('Desde',{exact:true}).inputValue(),'');
 assert.deepEqual(errors,[]);await ctx.close();matrices++;
}console.log(`PASS ${matrices} responsive matrices: touch select, explicit search, resize, Escape, count, status, modal, real inventory focus/navigation and statistics validation.`);}finally{await browser.close();}

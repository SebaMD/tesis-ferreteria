import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {build} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/loading-theme.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f])),entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName,css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let geometries=0,themes=0;
try{for(const width of [320,360,390,430,1280,1440])for(const initial of ['light','dark']){
 const ctx=await browser.newContext({viewport:{width,height:850}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({initial})=>{if(!localStorage.getItem('test-seeded')){localStorage.setItem('fyf-theme',initial);localStorage.setItem('fyf-theme:user:2','light');localStorage.setItem('test-seeded','1');}},{initial});
 await ctx.route('**/*',route=>{const path=new URL(route.request().url()).pathname,f=files.get(path);if(f)return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:f.type==='chunk'?f.code:f.source});return route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});});
 await page.goto('http://fyf.test/');await page.getByTestId('theme').filter({hasText:new RegExp(`^${initial}$`)}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('fyf-theme:user:1')),initial);
 for(const internal of [false,true]){if(internal)await page.getByRole('button',{name:'Internal',exact:true}).click();await page.getByRole('button',{name:'Load',exact:true}).click();await page.getByRole('status',{name:'Cargando',exact:true}).waitFor();
 const g=await page.evaluate(()=>{const o=document.querySelector('.app-loading-overlay'),r=o.getBoundingClientRect(),i=o.querySelector('.app-loading-indicator').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,cx:i.x+i.width/2,cy:i.y+i.height/2,portal:o.parentElement===document.body,blur:getComputedStyle(o).backdropFilter,coverage:document.elementFromPoint(r.left+2,r.top+2)===o};});
 assert.equal(g.left,internal&&width>980?256:0);assert.equal(g.right,width);assert.equal(g.top,72);assert.equal(g.bottom,850);assert.ok(Math.abs(g.cx-(g.left+width)/2)<1);assert.ok(Math.abs(g.cy-(72+850)/2)<1);assert.equal(g.portal,true);assert.match(g.blur,/blur/);assert.equal(g.coverage,true);geometries++;
 await page.evaluate(()=>{document.querySelector('[data-loading-navbar]').style.height='104px';});
 await page.waitForFunction(()=>document.querySelector('.app-loading-overlay').getBoundingClientRect().top===104);
 const resized=await page.locator('.app-loading-indicator').boundingBox();assert.ok(Math.abs(resized.y+resized.height/2-(104+850)/2)<1);geometries++;
 await page.evaluate(()=>{document.querySelector('[data-loading-navbar]').style.height='72px';});
 await page.waitForFunction(()=>document.querySelector('.app-loading-overlay').getBoundingClientRect().top===72);
 await page.getByRole('button',{name:'Error',exact:true}).click();await page.locator('.app-loading-overlay').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Load',exact:true}).click();await page.getByRole('button',{name:'Leave',exact:true}).click();await page.locator('.app-loading-overlay').waitFor({state:'detached'});
 }
 await page.getByRole('button',{name:'Account B',exact:true}).click();await page.getByTestId('theme').filter({hasText:/^light$/}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'fyf-theme:user:1',newValue:'dark'})));
 assert.equal(await page.getByTestId('theme').innerText(),'light','Late notification for A cannot change B');
 await page.getByRole('button',{name:'Account A',exact:true}).click();await page.getByTestId('theme').filter({hasText:new RegExp(`^${initial}$`)}).waitFor();
 await page.getByRole('button',{name:'Logout',exact:true}).click();await page.getByTestId('theme').filter({hasText:/^light$/}).waitFor();await page.getByRole('button',{name:'Account A',exact:true}).click();await page.getByTestId('theme').filter({hasText:new RegExp(`^${initial}$`)}).waitFor();await page.reload();await page.getByTestId('theme').filter({hasText:new RegExp(`^${initial}$`)}).waitFor();
 const tab=await ctx.newPage();await tab.goto('http://fyf.test/');await tab.getByRole('button',{name:'Theme',exact:true}).click();const opposite=initial==='dark'?'light':'dark';await page.getByTestId('theme').filter({hasText:new RegExp(`^${opposite}$`)}).waitFor();
 await page.evaluate(({initial})=>window.dispatchEvent(new StorageEvent('storage',{key:'fyf-theme:user:1',newValue:initial})),{initial});
 assert.equal(await page.getByTestId('theme').innerText(),opposite,'Late event payload must not replace the current stored preference');
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),opposite==='dark');assert.deepEqual(errors,[]);themes++;await ctx.close();
}console.log(`PASS ${geometries} overlay geometries/coverage and ${themes} StrictMode theme matrices: login owner, logout, reload and cross-tab preference.`);}finally{await browser.close();}

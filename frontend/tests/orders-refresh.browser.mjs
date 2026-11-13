// Real React views in Chromium; only authorized-read API shapes, all responses simulated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/checkout-email-orders.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(file=>['/'+file.fileName,file]));
const entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName;
const css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[];let cases=0;
const message='Aún no podemos confirmar el resultado de este pago. No vuelvas a pagarlo. Puedes actualizar su estado o consultar con la ferretería indicando el folio del pedido.';
const item={productId:99,productName:'Producto de prueba para actualización segura del pedido',quantity:1,unitPrice:5990,subtotal:5990,unitMeasure:'unidad'};
const order={id:10,status:'PENDING_PAYMENT',total:5990,deliveryType:'PICKUP',createdAt:'2026-11-06T12:00:00Z',items:[item],payment:{status:'CREATED'},canContinuePayment:false,canRetryPayment:false,canArchive:false,paymentRecoveryMessage:message};
try {
  for(const width of [320,360,390,430,1280,1440])for(const theme of ['light','dark'])for(const guest of [false,true]) {
    const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    let calls=0,hold=false,release,version=0,paid=false;
    await page.clock.setFixedTime(new Date('2026-11-06T15:00:00Z'));
    await page.route('**/*',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.startsWith('/api/')) {
        assert.equal(route.request().method(),'GET','Refresh must not create, retry or confirm a payment');
        assert.ok(['/api/online-orders','/api/online-orders/guest/device-orders'].includes(path));calls++;
        const snapshot=structuredClone([{...order,total:5990+version,...(paid?{status:'PAID',payment:{status:'AUTHORIZED'},paymentRecoveryMessage:null}:{})},{...order,id:11}]);
        if(hold)await new Promise(resolve=>{release=resolve;});
        try {await route.fulfill({json:{data:snapshot}});}catch { /* An abandoned read may have been aborted on unmount. */ }
        return;
      }
      const asset=files.get(path);if(asset)return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:asset.code||asset.source});
      return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
    });
    await page.goto(`http://fyf.test/${guest?'guest-orders':'orders'}?theme=${theme}${guest?'&guest':''}#order-10`);
    await page.locator('#order-10').getByRole('button',{name:'Ver detalle'}).waitFor();
    assert.equal(calls,1);assert.equal(await page.getByRole('button',{name:'Continuar pago',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    // Coalesce double click, focus and persisted pageshow while the same request is in flight.
    hold=true;version=1;const before=calls;
    await page.getByRole('button',{name:'Actualizar estado',exact:true}).evaluate(button=>{button.click();button.click();window.dispatchEvent(new Event('focus'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForFunction(()=>document.querySelector('[aria-label="Actualizar estado"]').disabled);
    await page.waitForTimeout(100);assert.equal(calls,before+1);hold=false;release();
    await page.getByRole('button',{name:'Actualizar estado',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="Actualizar estado"]').disabled);
    assert.match(await page.locator('#order-10').innerText(),/5\.991/);
    hold=true;const restoredBefore=calls;
    await page.getByRole('button',{name:'Actualizar estado',exact:true}).click();await page.waitForTimeout(80);const releaseBeforeHide=release;
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    version=2;await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.waitForTimeout(80);assert.equal(calls,restoredBefore+2);hold=false;release();
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Actualizar estado"]').disabled);
    releaseBeforeHide();await page.waitForTimeout(80);assert.match(await page.locator('#order-10').innerText(),/5\.992/,'An older response after BFCache restoration is ignored');
    // Browser restoration after a later navigation triggers one read, not one for each event.
    await page.clock.setFixedTime(new Date('2026-11-06T15:00:03Z'));const focusBefore=calls;
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('focus'));});
    await page.waitForTimeout(150);assert.equal(calls,focusBefore+1);
    await page.locator('#order-10').getByRole('button',{name:'Ver detalle'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    paid=true;version=2;hold=true;const modalBefore=calls;
    await dialog.getByRole('button',{name:'Actualizar estado',exact:true}).click();await page.waitForTimeout(80);assert.equal(calls,modalBefore+1);
    hold=false;release();await dialog.getByText('Pago confirmado',{exact:true}).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Actualizar estado',exact:true}).count(),0);
    assert.equal(await page.locator('#order-10').count(),1);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    // An aborted read cannot overwrite a subsequent mount with an older response.
    hold=true;const lateBefore=calls;
    await page.getByRole('button',{name:'Actualizar estado',exact:true}).click();await page.waitForTimeout(80);assert.equal(calls,lateBefore+1);
    const releaseOld=release;
    await page.evaluate(()=>{history.pushState({},'', '/delivery-conditions');window.dispatchEvent(new PopStateEvent('popstate'));});
    await page.getByRole('heading',{name:'Condiciones de despacho'}).waitFor();
    hold=false;releaseOld();const unmountedCalls=calls;
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForTimeout(100);assert.equal(calls,unmountedCalls);
    await page.goBack();await page.locator('#order-10').getByRole('button',{name:'Ver detalle'}).waitFor();
    assert.ok(calls>unmountedCalls);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    cases++;await context.close();
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${cases} guest/client Chromium refresh scenarios: focus/pageshow/history, double-click coalescing, live modal, aborted stale response and no payment writes; six widths and both themes.`);
}finally{await browser.close();}

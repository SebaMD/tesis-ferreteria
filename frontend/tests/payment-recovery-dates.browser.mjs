// Actual React components in Chromium. Every API and payment submission is simulated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:{orders:fileURLToPath(new URL('./fixtures/checkout-email-orders.jsx',import.meta.url)),admin:fileURLToPath(new URL('./fixtures/academic-ux-stage2.jsx',import.meta.url))}}}});
const files=new Map(bundle.output.map(file=>['/'+file.fileName,file]));
const css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const entry=name=>bundle.output.find(f=>f.type==='chunk'&&f.isEntry&&f.name===name).fileName;
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const shots=await mkdtemp(path.join(process.env.FYF_UX_SCREENSHOT_DIR || tmpdir(),'fyf-payment-recovery-'));
const errors=[];let cases=0;
const item={productId:99,productName:'Producto con nombre largo para revisar recuperación y acciones',quantity:1,unitPrice:5990,subtotal:5990,unitMeasure:'unidad'};
const pending={id:10,status:'PENDING_PAYMENT',total:5990,deliveryType:'PICKUP',createdAt:'2026-11-05T12:00:00Z',items:[item],payment:{status:'CREATED'},canContinuePayment:false,canRetryPayment:false,canArchive:false,paymentRecoveryMessage:'Estamos consultando el resultado de Webpay. No vuelvas a pagar hasta conocer el resultado.'};
try {
  async function open(kind,width,theme,guest=false) {
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-06T01:30:00Z'));
    const calls=[];
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/api/')) {
        calls.push({path:url.pathname,...Object.fromEntries(url.searchParams)});
        let data;
        if(url.pathname==='/api/online-orders'||url.pathname==='/api/online-orders/guest/device-orders') data=[pending,{...pending,id:11,status:'EXPIRED',payment:{status:'EXPIRED'},canRetryPayment:true,paymentRecoveryMessage:null}];
        else if(url.pathname==='/api/online-orders/guest/pending') data=pending;
        else if(url.pathname==='/api/online-orders/delivery-address') data=null;
        else if(url.pathname==='/api/online-orders/quote') data={productsSubtotal:5990,productsDiscountTotal:0,productsNet:5990,deliveryFee:0,total:5990,quoteFingerprint:'fake-quote',commercialSignature:'fake-signature'};
        else if(/\/catalog\/products\/\d+$/.test(url.pathname)) data={id:99,name:item.productName,price:5990,currentStock:20,availableStock:20,status:true,unitMeasure:'unidad',images:[]};
        else if(url.pathname==='/api/reports/sales') data={sales:[],byCashier:[],byPaymentMethod:[],salesCount:0,total:0};
        else if(url.pathname==='/api/product-audits') data={items:[],page:1,totalPages:1,totalItems:0,operations:{PRODUCT_NAME_CORRECTION:'Corrección de nombre'}};
        else if(url.pathname==='/api/customer-notice') data={notices:[]};
        else return route.fulfill({status:500,json:{message:'Unexpected API '+url.pathname}});
        return route.fulfill({json:{status:'success',data}});
      }
      const asset=files.get(url.pathname);
      if(asset)return route.fulfill({contentType:asset.fileName.endsWith('.css')?'text/css':'text/javascript',body:asset.code||asset.source});
      return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry(['orders','checkout'].includes(kind)?'orders':'admin')}"></script></body></html>`});
    });
    await page.goto(`http://fyf.test/${kind==='checkout'?'checkout':kind==='orders'?(guest?'guest-orders':'orders'):'ux-test'}?case=${kind}&theme=${theme}${guest?'&guest':''}`);
    return {page,context,calls};
  }
  for(const width of [320,1280])for(const theme of ['light','dark'])for(const guest of [false,true]) {
    const {page,context,calls}=await open('checkout',width,theme,guest);
    await page.getByText('Tienes un pago pendiente',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Continuar pago',exact:true}).count(),0);
    const link=page.getByRole('link',{name:'Ver pedido',exact:true});
    assert.equal(await link.getAttribute('href'),guest?'/guest-orders#order-10':'/orders#order-10');
    await link.click();await page.locator('#order-10').getByRole('button',{name:'Ver detalle'}).waitFor();
    assert.equal(calls.some(c=>/email-verification|checkout$|continue-payment|retry-payment/.test(c.path)),false,'Recovery navigation does not send codes or create another charge');
    cases++;await context.close();
  }
  for(const width of [320,360,390,430,1280,1440])for(const theme of ['light','dark']) {
    for(const guest of [false,true]) {
      const {page,context}=await open('orders',width,theme,guest);
      const card=page.locator('#order-10');await card.getByRole('button',{name:'Ver detalle'}).waitFor();
      assert.equal(await card.locator('footer').count(),0);assert.equal(await card.getByRole('button',{name:/Continuar|Reintentar/}).count(),0);
      const detail=card.getByRole('button',{name:'Ver detalle'}),detailsBox=await detail.boundingBox();
      assert.ok(detailsBox.width>=170&&detailsBox.height>=40);
      const incomplete=page.locator('#order-11'),retry=await incomplete.getByRole('button',{name:'Reintentar pago'}).boundingBox(),view=await incomplete.getByRole('button',{name:'Ver detalle'}).boundingBox();
      assert.ok(Math.abs(retry.width-view.width)<1&&retry.y+retry.height<=view.y);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if((width===390&&theme==='dark')||(width===1440&&theme==='light'))await page.screenshot({path:path.join(shots,`pending-card-${guest?'guest':'client'}-${width}.png`),fullPage:true});
      await detail.click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByRole('button',{name:/Continuar pago|Reintentar pago/}).count(),0);
      if(width===390&&theme==='dark')await page.screenshot({path:path.join(shots,`pending-${guest?'guest':'client'}.png`),fullPage:true});
      cases++;await context.close();
    }
    {
      const {page,context,calls}=await open('audit',width,theme);
      const from=page.getByLabel('Desde',{exact:true}),to=page.getByLabel('Hasta',{exact:true});
      await page.getByText(/Mostrando 0 de 0 cambios/).waitFor();
      assert.equal(await from.getAttribute('max'),'2026-11-05');assert.equal(await to.getAttribute('max'),'2026-11-06');
      const baseline=calls.length;
      await from.fill('2026-11-06');await page.getByRole('alert').waitFor();await page.waitForTimeout(500);assert.equal(calls.length,baseline);
      await from.fill('2026-11-04');await to.fill('2026-11-07');await page.waitForTimeout(500);assert.equal(calls.length,baseline);
      await to.fill('2026-11-06');await page.waitForTimeout(550);assert.equal(calls.at(-1).from,'2026-11-04');assert.equal(calls.at(-1).to,'2026-11-06');
      const validCalls=calls.length;await to.fill('2026-11-04');await page.waitForTimeout(500);assert.equal(calls.length,validCalls);
      await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.waitForTimeout(100);assert.equal(await from.inputValue(),'');assert.equal(await to.inputValue(),'');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      cases++;await context.close();
    }
    {
      const {page,context,calls}=await open('reports',width,theme);
      const date=page.getByLabel('Fecha',{exact:true});await date.waitFor();await page.getByRole('button',{name:'Consultar',exact:true}).waitFor({state:'visible'});await page.waitForTimeout(100);
      assert.equal(await date.inputValue(),'2026-11-05');assert.equal(await date.getAttribute('max'),'2026-11-05');
      const count=calls.length;await date.fill('2026-11-06');await page.getByRole('button',{name:'Consultar',exact:true}).click();assert.equal(calls.length,count);
      await date.fill('2026-11-05');await page.getByRole('button',{name:'Rango de fechas'}).click();
      assert.equal(await page.locator('form [role="alert"]').count(),0,'Changing mode alone does not show a preventive warning');
      const from=page.getByLabel('Desde',{exact:true}),to=page.getByLabel('Hasta',{exact:true});
      assert.equal(await from.getAttribute('max'),'2026-11-04');
      await from.fill('2026-11-04');await to.fill('2026-11-05');await page.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForTimeout(100);
      assert.equal(calls.at(-1).mode,'range');assert.equal(calls.at(-1).from,'2026-11-04');
      assert.equal(await page.locator('form [role="alert"]').count(),0,'Valid dates have no date warning');
      const validCount=calls.length;await to.fill('2026-11-04');await page.getByRole('button',{name:'Consultar',exact:true}).click();assert.equal(calls.length,validCount);await page.getByRole('alert').waitFor();
      await page.clock.setFixedTime(new Date('2026-11-06T03:05:00Z'));await from.fill('2026-11-05');await to.fill('2026-11-06');assert.equal(await to.getAttribute('max'),'2026-11-06');
      await page.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForTimeout(100);assert.equal(calls.at(-1).to,'2026-11-06');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      cases++;await context.close();
    }
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${cases} Chromium cases: guest/client pending cards, detail, strict UTC/Chile filters and local midnight; simulated APIs. Screenshots: ${shots}`);
} finally {await browser.close();}

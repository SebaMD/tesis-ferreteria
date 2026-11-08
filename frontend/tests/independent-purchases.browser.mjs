// Browser-only verification. Every request intercepted; no database/provider/server used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/independent-purchases.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f])),entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName;
const css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const product=id=>({id,name:id===1?'Taladro de prueba':'Martillo nuevo',price:1000,currentStock:20,availableStock:20,status:true,unitMeasure:'unidad',images:[]});
const order=(id,status,payment='AUTHORIZED')=>({id,status,payment:{status:payment},total:1000,deliveryType:'PICKUP',createdAt:`2026-11-06T12:${id}:00Z`,items:[{productId:1,productName:'Producto histórico',quantity:1,unitPrice:1000,subtotal:1000}],canContinuePayment:false,canRetryPayment:false,canArchive:false});
let cases=0;const errors=[];
try {
  for(const width of [320,360,390,430,1280,1440])for(const theme of ['light','dark'])for(const guest of [false,true]) {
    const context=await browser.newContext({viewport:{width,height:950}}), page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    let posts=[],guestSession=null,proof=null,codes=0,failCreation=width===320,creationFailures=0;
    const authorized=new Set();
    await page.addInitScript(({guest})=>{
      const key=`fyf_client_cart_${guest?'guest':'client_1'}`;
      if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify([{product:{id:1,name:'Taladro de prueba',price:1000,currentStock:20,status:true,images:[]},quantity:1}]));
      HTMLFormElement.prototype.submit=function(){window.__launched=this.querySelector('[name="token_ws"]').value;};
    },{guest});
    const pending=order(10,'PENDING_PAYMENT','CREATED');
    await context.route('**/*',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;let data;
      if(path.startsWith('/api/')) {
        if(path==='/api/email-verification/guest/request') {
          const body=request.postDataJSON(),session=request.headers()['x-guest-session'];
          assert.match(session,/^[A-Za-z0-9_-]{43}$/);if(guestSession)assert.equal(session,guestSession);guestSession=session;
          assert.equal(body.email,'guest@example.test');proof={id:++codes,verified:false,consumed:false};
          data={challengeId:proof.id,email:body.email,expiresAt:new Date(Date.now()+600000).toISOString(),resendAvailableAt:new Date().toISOString(),sent:true};
        } else if(path==='/api/email-verification/guest/verify') {
          assert.equal(request.headers()['x-guest-session'],guestSession);assert.equal(request.postDataJSON().pin,'123456');assert.equal(request.postDataJSON().challengeId,proof.id);
          proof.verified=true;data={challengeId:proof.id,email:'guest@example.test',verifiedAt:new Date().toISOString()};
        } else if(path==='/api/online-orders'||path==='/api/online-orders/guest/device-orders')data=[pending,order(11,'PREPARING'),order(12,'DELIVERED'),order(13,'PAYMENT_REVIEW')];
        else if(path==='/api/online-orders/guest/pending')data=pending;
        else if(path==='/api/online-orders/delivery-address')data=null;
        else if(path.startsWith('/api/catalog/products')) {const id=Number(path.split('/').pop());data=id?product(id):{items:[product(1),product(2)]};}
        else if(path==='/api/online-orders/quote') {
          const body=request.postDataJSON(),total=body.items.reduce((s,i)=>s+i.quantity*1000,0);
          data={total:String(total),productsSubtotal:String(total),productsDiscountTotal:'0',deliveryFee:'0',deliveryFeeReason:'PICKUP',quoteFingerprint:JSON.stringify(body.items),commercialSignature:JSON.stringify(body.items)};
        } else if(['/api/online-orders/checkout','/api/online-orders/guest/checkout'].includes(path)) {const body=request.postDataJSON();
          if(failCreation){failCreation=false;creationFailures++;return route.fulfill({status:503,json:{message:'Simulated creation failure before persistence'}});}
          if(guest){assert.equal(request.headers()['x-guest-session'],guestSession);assert.ok(proof.verified&&!proof.consumed);assert.equal(body.emailVerificationChallengeId,proof.id);assert.equal(body.guestEmail,'guest@example.test');proof.consumed=true;}
          posts.push(body);data={orderId:posts.length===1?10:11,total:body.items.reduce((s,i)=>s+i.quantity*1000,0),token:`new-${posts.length}`,guestAccessToken:(posts.length===1?'a':'b').repeat(43),url:'https://example.test/fake-webpay'};}
        else if(/^\/api\/online-orders\/\d+$/.test(path)||path==='/api/online-orders/guest/order') {
          const access=request.headers()['x-guest-order-token'];
          if(guest&&!['a'.repeat(43),'b'.repeat(43)].includes(access))return route.fulfill({status:404,json:{message:'Pedido no encontrado'}});
          const id=guest?(access==='a'.repeat(43)?10:11):Number(path.split('/').pop()), snapshot=posts[id===10?0:1];
          if(id===999)return route.fulfill({status:404,json:{message:'Pedido no encontrado'}});
          data=order(id,authorized.has(id)?'PAID':'PENDING_PAYMENT',authorized.has(id)?'AUTHORIZED':'CREATED');
          if(snapshot)data={...data,items:snapshot.items.map(i=>({...i,productName:product(i.productId).name,unitPrice:1000,subtotal:i.quantity*1000})),total:snapshot.items.reduce((s,i)=>s+i.quantity*1000,0)};
        }
        else throw Error('Unexpected API request: '+path);
        return route.fulfill({json:{data}});
      }
      const f=files.get(path);if(f)return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:f.type==='chunk'?f.code:f.source});
      if(path.endsWith('.png'))return route.fulfill({status:204,body:''});
      return route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
    });
    await page.goto(`http://fyf.test/${guest?'guest-orders':'orders'}?theme=${theme}${guest?'&guest':''}`);
    await page.locator('#order-10').waitFor();
    const visible=await page.locator('article[id^="order-"]').evaluateAll(nodes=>nodes.map(n=>n.id));
    assert.deepEqual(visible,['order-11','order-13','order-12','order-10']);
    await page.getByRole('link',{name:'Consultar P-000010'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    {
      const verifyGuest=async()=>{if(!guest)return;
        await page.getByLabel('Nombre y apellido',{exact:true}).fill('Persona Invitada');
        await page.getByLabel('Correo electrónico',{exact:true}).fill('guest@example.test');
        await page.getByLabel('Confirmar correo',{exact:true}).fill('guest@example.test');
        await page.getByLabel('Teléfono',{exact:true}).fill('+56912345678');
        await page.getByRole('button',{name:'Enviar codigo',exact:true}).click();
        await page.getByLabel('Codigo de 6 digitos').fill('123456');
        await page.getByRole('button',{name:'Verificar correo',exact:true}).click();
      };
      await page.getByRole('button',{name:'Otra compra',exact:true}).click();
      await verifyGuest();
      // Locate the checkout submission rather than any pending-order control.
      const submit=page.locator('button').filter({hasText:/Pagar/}).last();
      await submit.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/Pagar/.test(b.textContent)&&!b.disabled));
      await submit.click();
      if(width===320){
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/Pagar/.test(b.textContent)&&!b.disabled));
        assert.equal(creationFailures,1);assert.equal(posts.length,0);assert.equal(await page.getByTestId('cart').innerText(),'1:1');
        assert.equal(await page.evaluate(()=>window.__launched),undefined);
        await submit.click();
      }
      await page.waitForFunction(()=>window.__launched==='new-1');
      await page.getByRole('status',{name:'Preparando pago seguro',exact:true}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/checkout');
      assert.equal(await page.getByText('Tu carrito está vacío',{exact:true}).count(),0);
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      assert.equal(await page.getByTestId('cart').innerText(),'','Persisted checkout detaches its selection before Webpay');
      const otherTab=await context.newPage();
      await otherTab.goto(`http://fyf.test/${guest?'guest-orders':'orders'}?theme=${theme}${guest?'&guest':''}`);
      await otherTab.locator('#order-10').waitFor();
      await otherTab.getByRole('link',{name:'Consultar P-000010'}).waitFor();
      assert.equal(await otherTab.getByTestId('cart').innerText(),'','A does not reappear after navigation in another tab');
      await otherTab.getByRole('button',{name:'Agregar taladro nuevo'}).click();
      await otherTab.getByRole('button',{name:'Agregar martillo nuevo'}).click();
      await page.getByTestId('cart').filter({hasText:'1:1,2:1'}).waitFor();
      await otherTab.close();
      await page.getByRole('button',{name:'Otra compra',exact:true}).click();
      await verifyGuest();
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/Pagar/.test(b.textContent)&&!b.disabled));
      await page.locator('button').filter({hasText:/Pagar/}).last().click();await page.waitForFunction(()=>window.__launched==='new-2');
      await page.getByRole('status',{name:'Preparando pago seguro',exact:true}).waitFor();
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      assert.notEqual(posts[0].checkoutKey,posts[1].checkoutKey);
      if(guest){assert.equal(codes,2);assert.notEqual(posts[0].emailVerificationChallengeId,posts[1].emailVerificationChallengeId);}
      assert.deepEqual(posts[1].items.map(i=>i.productId).sort(),[1,2],'B contains both shared and different SKUs while A is still uncertain');
      assert.equal(await page.getByTestId('cart').innerText(),'');
      // Model a storage event delayed by the browser: the in-memory A must not
      // be resurrected when another tab removes it and this tab adds B.
      await page.getByRole('button',{name:'Agregar taladro nuevo'}).click();
      await page.evaluate(()=>{window.__delayStorage=e=>e.stopImmediatePropagation();window.addEventListener('storage',window.__delayStorage,true);});
      const raceTab=await context.newPage();
      await raceTab.goto(`http://fyf.test/${guest?'guest-orders':'orders'}?theme=${theme}${guest?'&guest':''}`);
      await raceTab.evaluate(({guest})=>{const key=`fyf_client_cart_${guest?'guest':'client_1'}`;localStorage.setItem(`${key}:revision`,'other-tab-after-B');localStorage.setItem(key,'[]');},{guest});
      await page.getByRole('button',{name:'Agregar martillo nuevo'}).click();
      assert.equal(await page.getByTestId('cart').innerText(),'2:1','Delayed storage events must not resurrect A');
      await page.evaluate(()=>window.removeEventListener('storage',window.__delayStorage,true));
      await raceTab.close();
      authorized.add(10);await page.getByRole('button',{name:'Consultar pago A'}).click();
      await page.getByText('Pago realizado correctamente',{exact:true}).waitFor();
      assert.equal(await page.getByTestId('cart').innerText(),'2:1','Late A must not clean items added after B');
      authorized.add(11);
      await page.getByRole('button',{name:'Consultar pago B'}).click();await page.getByText('Pago realizado correctamente',{exact:true}).waitFor();
      assert.equal(await page.getByTestId('cart').innerText(),'2:1','B must not repeat the checkout cleanup');
      await page.getByRole('button',{name:'Otra compra',exact:true}).click();
      await page.getByRole('button',{name:'Consultar pago B'}).click();await page.getByText('Pago realizado correctamente',{exact:true}).waitFor();
      assert.equal(await page.getByTestId('cart').innerText(),'2:1','Reopening B must not clear later additions');
      await page.reload();await page.getByText('Pago realizado correctamente',{exact:true}).waitFor();
      assert.equal(await page.getByTestId('cart').innerText(),'2:1','Reload must not restore or detach again');
      if(width===320&&theme==='light'){
        await page.goto(guest?`http://fyf.test/guest-result-a#token=${'z'.repeat(43)}`:'http://fyf.test/result?orderId=999');
        await page.getByText(/No pudimos recuperar este pedido para la sesión actual/).waitFor();
        assert.equal(await page.getByText('Pedido no encontrado',{exact:true}).count(),0);
        await page.goto(`http://fyf.test/result?status=INVALID_RETURN${guest?'&guest':''}`);
        await page.getByText(/No indica aprobación ni rechazo/).waitFor();
        assert.equal(await page.getByRole('link',{name:'Ver mis pedidos',exact:true}).getAttribute('href'),guest?'/guest-orders':'/orders');
      }
    }
    cases++;await context.close();
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${cases} browser cases: checkout detachment, independent purchases, late-result safety, ordered groups, guest/client, six widths and both themes; APIs/Webpay simulated.`);
} finally {await browser.close();}

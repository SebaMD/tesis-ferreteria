// Real AuthProvider, Axios, cart, checkout and orders. Every network request is intercepted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const bundle=await build({root:fileURLToPath(new URL('..',import.meta.url)),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},build:{write:false,rollupOptions:{input:fileURLToPath(new URL('./fixtures/account-isolation.jsx',import.meta.url))}}});
const files=new Map(bundle.output.map(f=>['/'+f.fileName,f])),entry=bundle.output.find(f=>f.type==='chunk'&&f.isEntry).fileName;
const css=bundle.output.filter(f=>f.fileName.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f.fileName}">`).join('');
const jwt=id=>`e30.${Buffer.from(JSON.stringify({id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic`;
const user=id=>({id,role:'CLIENT',names:`Synthetic ${id}`,correo:`${id}@example.test`,emailVerified:true});
const product=id=>({id,name:`SKU ${id}`,price:1000,currentStock:20,availableStock:20,status:true,unitMeasure:'unidad',images:[]});
const order=(id,owner)=>({id,clientId:owner,status:'PENDING_PAYMENT',payment:{status:'CREATED'},createdAt:'2026-11-07T12:00:00Z',deliveryType:'PICKUP',total:1000,canContinuePayment:false,canRetryPayment:false,canArchive:false,items:[{productId:1,productName:'Synthetic',quantity:1,unitPrice:1000,subtotal:1000}]});
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const bounded=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Test handshake exceeded 15 seconds')),15000);})]).finally(()=>clearTimeout(timer));};
let cases=0;
try{
 for(const width of [390,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:950}}),other=await browser.newContext({viewport:{width,height:950}});
  context.setDefaultTimeout(15000);other.setDefaultTimeout(15000);
  const orders=[order(11,1),order(22,2)],posts=[],errors=[],logoutOwners=[];let holdRead=null,holdLogout=null;
  const install=async ctx=>{
   await ctx.addInitScript(({theme})=>{
    if(theme==='dark'){const apply=()=>document.documentElement.classList.add('dark');if(document.documentElement)apply();else document.addEventListener('DOMContentLoaded',apply,{once:true});}
    HTMLFormElement.prototype.submit=function(){window.__launch=this.querySelector('[name="token_ws"]').value;};
    // Deterministically delay listener delivery, not production authentication.
    const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window),wrappers=new WeakMap();
    window.addEventListener=(type,listener,options)=>{
     if(['storage','focus','pageshow','fyf-auth-changed'].includes(type)&&typeof listener==='function'){
      let byType=wrappers.get(listener);if(!byType){byType=new Map();wrappers.set(listener,byType);}
      if(!byType.has(type))byType.set(type,event=>{if(!window.__freezeAuth)listener(event);});
      return add(type,byType.get(type),options);
     }return add(type,listener,options);
    };
    window.removeEventListener=(type,listener,options)=>remove(type,wrappers.get(listener)?.get(type)||listener,options);
   },{theme});
   await ctx.route('**/*',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname,authorization=r.headers().authorization;
    let owner=null;if(authorization){const token=authorization.slice(7);owner=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).id;}
    if(path.startsWith('/api/')){
     let data;
     if(path==='/api/auth/login'){const id=r.postDataJSON().email==='A'?1:2;data={token:jwt(id),user:user(id)};}
     else if(path==='/api/auth/logout'){logoutOwners.push(owner);if(holdLogout){holdLogout.started();await holdLogout.wait;}data={};}
     else if(path==='/api/online-orders'){
      if(owner===1&&holdRead){const task=holdRead;holdRead=null;task.started();await task.wait;if(task.status===401)return route.fulfill({status:401,json:{message:'old request expired'}});}
      data=orders.filter(o=>o.clientId===owner);
     }else if(path==='/api/online-orders/delivery-address')data=null;
     else if(path.startsWith('/api/catalog/products')){const id=Number(path.split('/').pop());data=id?product(id):{items:[product(1),product(2)]};}
     else if(path==='/api/online-orders/quote'){const body=r.postDataJSON(),total=body.items.reduce((s,i)=>s+1000*i.quantity,0);data={total:String(total),productsSubtotal:String(total),productsDiscountTotal:'0',deliveryFee:'0',deliveryFeeReason:'PICKUP',quoteFingerprint:JSON.stringify(body.items),commercialSignature:JSON.stringify(body.items)};}
     else if(path==='/api/online-orders/checkout'){
      assert.ok(owner===1||owner===2);const body=r.postDataJSON();assert.equal(body.clientId,undefined);const id=100+posts.length;
      posts.push({owner,body,id});orders.push({...order(id,owner),items:body.items.map(i=>({...i,productName:'Synthetic',unitPrice:1000,subtotal:1000*i.quantity}))});
      data={orderId:id,token:`new-${id}`,url:'https://example.test/fake-webpay',total:body.items.reduce((s,i)=>s+1000*i.quantity,0)};
     }else if(/^\/api\/online-orders\/\d+$/.test(path)){const o=orders.find(o=>o.id===Number(path.split('/').pop())&&o.clientId===owner);if(!o)return route.fulfill({status:404,json:{message:'Pedido no encontrado'}});data=o;}
     else throw Error('Unexpected API '+path);
     return route.fulfill({json:{data}});
    }
    const f=files.get(path);if(f)return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:f.type==='chunk'?f.code:f.source});
    if(path.endsWith('.png'))return route.fulfill({status:204,body:''});
    return route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>`});
   });
  };
  await install(context);await install(other);
  const a=await context.newPage(),b=await context.newPage(),isolated=await other.newPage();
  for(const p of [a,b,isolated]){p.on('pageerror',e=>errors.push(e.message));await p.goto('http://fyf.test/home');}
  const identity=(p,id)=>p.getByTestId('identity').filter({hasText:new RegExp(`^${id}$`)}).waitFor();
  await a.getByRole('button',{name:'Login A',exact:true}).click();await identity(a,1);await identity(b,1);
  console.log('ISOLATION_STAGE',width,theme,'login');
  await a.getByRole('button',{name:'Add A',exact:true}).click();await a.getByRole('button',{name:'Checkout',exact:true}).click();
  const pay=a.getByRole('button',{name:/^Pagar con Webpay Plus/});await pay.waitFor();await a.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/^Pagar con Webpay Plus/.test(b.textContent)&&!b.disabled));await pay.click();
  try{await a.waitForFunction(()=>window.__launch==='new-100');}catch(e){console.log('INITIAL_LAUNCH_DIAGNOSTIC',{width,theme,posts:posts.map(p=>({owner:p.owner,id:p.id})),errors,text:await a.locator('body').innerText()});throw e;}
  assert.equal(posts[0].owner,1);assert.equal(await a.getByTestId('cart').innerText(),'');
  await a.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  // A prepares a second checkout. Block storage delivery to reproduce visual A / stored B.
  await a.getByRole('button',{name:'Home',exact:true}).click();await a.getByRole('button',{name:'Add A',exact:true}).click();await a.getByRole('button',{name:'Checkout',exact:true}).click();
  await a.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/^Pagar con Webpay Plus/.test(b.textContent)&&!b.disabled));
  await a.evaluate(()=>{window.__freezeAuth=true;});
  await b.getByRole('button',{name:'Login B',exact:true}).click();await identity(b,2);
  assert.equal(await a.getByTestId('identity').innerText(),'1');
  await a.getByRole('button',{name:'Logout',exact:true}).click();await a.getByTestId('message').filter({hasText:'AUTH_CONTEXT_CHANGED'}).waitFor();
  assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('user')).id),2,'A stale logout must not clear B');assert.deepEqual(logoutOwners,[]);
  await pay.click();await a.getByText('La sesión cambió. Revisa la cuenta activa y vuelve a abrir la compra desde su carrito.',{exact:true}).first().waitFor();assert.equal(posts.length,1,'Stale A must never launch a checkout using B token');
  await a.evaluate(()=>{window.__freezeAuth=false;window.dispatchEvent(new Event('pageshow'));});
  await identity(a,2);await a.getByText('La sesión de esta compra cambió',{exact:true}).waitFor();
  console.log('ISOLATION_STAGE',width,theme,'stale checkout blocked');
  await a.getByRole('button',{name:'Orders',exact:true}).click();await a.locator('#order-22').waitFor();assert.equal(await a.locator('#order-100').count(),0);
  await a.goto('http://fyf.test/payment-result?orderId=100');await a.locator('main p').filter({hasText:/No pudimos recuperar este pedido para la sesión actual/}).waitFor();assert.equal(await a.getByText('Pago realizado correctamente',{exact:true}).count(),0);
  await a.getByRole('button',{name:'Home',exact:true}).click();await a.getByRole('button',{name:'Add B',exact:true}).click();await a.getByRole('button',{name:'Checkout',exact:true}).click();await a.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>/^Pagar con Webpay Plus/.test(b.textContent)&&!b.disabled));
  await a.getByText('Una compra anterior requiere seguimiento',{exact:true}).waitFor();
  assert.equal(await a.getByRole('link',{name:'Ver pedido',exact:true}).getAttribute('href'),'/orders#order-22');
  assert.equal(await a.getByRole('link',{name:'Editar carrito para otra compra',exact:true}).count(),0);
  await pay.click();await a.waitForFunction(()=>window.__launch==='new-101');assert.equal(posts[1].owner,2);assert.deepEqual(posts[1].body.items,[{productId:2,quantity:1}]);assert.notEqual(posts[0].body.checkoutKey,posts[1].body.checkoutKey);
  await a.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  assert.equal(await a.getByRole('link',{name:'Editar carrito para otra compra',exact:true}).count(),0);
  await a.getByRole('button',{name:'Orders',exact:true}).click();await a.locator('#order-101').waitFor();assert.equal(await a.locator('#order-100').count(),0);
  console.log('ISOLATION_STAGE',width,theme,'independent B');
  // Independent browser profile stays A while shared tabs switch to B.
  await isolated.getByRole('button',{name:'Login A',exact:true}).click();await identity(isolated,1);await isolated.getByRole('button',{name:'Orders',exact:true}).click();await isolated.locator('#order-100').waitFor();assert.equal(await isolated.locator('#order-101').count(),0);await identity(a,2);
  // A late 200 and a late 401 must neither populate B nor destroy B's session.
  for(const status of [200,401]){
   await a.getByRole('button',{name:'Home',exact:true}).click();await a.getByRole('button',{name:'Login A',exact:true}).click();await identity(a,1);
   let release,started;const wait=new Promise(r=>{release=r;}),began=new Promise(r=>{started=r;});holdRead={wait,started,status};
   await a.getByRole('button',{name:'Read orders',exact:true}).click();await bounded(began);
   await b.getByRole('button',{name:'Login B',exact:true}).click();await identity(a,2);release();
   await a.getByRole('button',{name:'Orders',exact:true}).click();await a.locator('#order-101').waitFor();assert.equal(await a.locator('#order-100').count(),0);await identity(a,2);
  }
  console.log('ISOLATION_STAGE',width,theme,'late responses');
  // Delayed logout from A must not clear B after B has logged in.
  await a.getByRole('button',{name:'Login A',exact:true}).click();await identity(a,1);
  let release,started;holdLogout={wait:new Promise(r=>{release=r;}),started:()=>started()};const began=new Promise(r=>{started=r;});
  await a.getByRole('button',{name:'Logout',exact:true}).click();await bounded(began);await b.getByRole('button',{name:'Login B',exact:true}).click();await identity(a,2);release();holdLogout=null;
  await a.reload();await identity(a,2);assert.equal(await a.getByTestId('cart').innerText(),'');
  await a.getByRole('button',{name:'Login A',exact:true}).click();await identity(a,1);assert.equal(await a.getByTestId('cart').innerText(),'1:1','A cart must survive B login, logout and history');
  await a.getByRole('button',{name:'Orders',exact:true}).click();await a.locator('#order-100').waitFor();assert.equal(await a.locator('#order-101').count(),0);
  assert.deepEqual(errors,[]);cases++;await context.close();await other.close();
 }
 console.log(`PASS ${cases} account-isolation Chromium matrices: real AuthProvider/Axios, two shared tabs, two profiles, blocked storage events, stale responses, late logout, checkout ownership and Webpay result access; all APIs simulated.`);
}finally{await browser.close();}

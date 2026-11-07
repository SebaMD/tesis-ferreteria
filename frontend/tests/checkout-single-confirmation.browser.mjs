// Real React UI + intercepted API. Pricing/signature helpers are the real backend functions.
// This is not a persistence test; all orders and Webpay submissions stay simulated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { calculateDelivery, deliveryBenefit, quoteFingerprint, commercialQuoteSignature } from '../../backend/dist/modules/deliverySettings/deliveryPricing.js';
import { calculatePromotionPricing } from '../../backend/dist/modules/promotions/promotionPricing.js';
import { buildCommercialAmounts } from '../../backend/dist/modules/onlineOrders/commercialAmounts.js';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/checkout-email-orders.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = []; let scenarios = 0;
try {
  for (const width of [320, 390, 1280, 1440]) for (const theme of ['light', 'dark']) for (const guest of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const policy = { id: 1, version: 1, pricingMode: 'LOCAL_FIXED', pickupEnabled: true, deliveryEnabled: true, flatFee: '3000.00', freeShippingFrom: '500000.00', isDemo: false };
    const mismatchedLaunch = width === 320 && theme === 'dark';
    let percentage = null, stock = 20, nextChange = null, posts = 0, payments = 0, codes = 0, holdQuotes = null, productPrice = 5990;
    const product = () => ({ id: 99, name: 'Producto de prueba', price: productPrice, currentStock: stock, availableStock: stock, status: true, unitMeasure: 'unidad', images: [] });
    const price = type => {
      const promotion = percentage === null ? null : { id: 1, name: 'Promoción simulada', type: 'PERCENTAGE_DISCOUNT', percentage, startsAt: new Date(0), endsAt: null };
      const p = calculatePromotionPricing(productPrice, 1, promotion);
      const delivery = calculateDelivery(policy, type, p.finalSubtotal);
      const item = { productId: 99, quantity: 1, unitPrice: productPrice.toFixed(2), subtotal: p.finalSubtotal.toFixed(2), discountAmount: p.discountAmount.toFixed(2), promotionId: promotion?.id ?? null, promotionTypeSnapshot: promotion?.type ?? null, promotionNameSnapshot: promotion?.name ?? null, promotionValueSnapshot: percentage };
      const source = { revisionId: policy.id, deliveryType: type, items: [item], fee: delivery.fee };
      const amounts = { productsSubtotal: productPrice.toFixed(2), productsDiscountTotal: item.discountAmount, productsNet: item.subtotal, deliveryFee: delivery.fee.toFixed(2), deliveryFeeReason: delivery.reason, total: (p.finalSubtotal + delivery.fee).toFixed(2), quoteFingerprint: quoteFingerprint(source) };
      const commercialAmounts = buildCommercialAmounts({ ...amounts, deliveryType: type, deliveryBaseFee: policy.flatFee });
      const benefit = deliveryBenefit(policy, type, p.finalSubtotal);
      return { ...amounts, commercialAmounts, deliveryBenefit: benefit, commercialSignature: commercialQuoteSignature(source, { commercialAmounts, benefit, isDemo: false }) };
    };
    await page.addInitScript(() => { HTMLFormElement.prototype.submit = function () { window.__testWebpay = { token: this.querySelector('[name="token_ws"]').value }; }; });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname;
      if (endpoint.startsWith('/api/')) {
        const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
        let data;
        if (/\/catalog\/products\/\d+$/.test(endpoint)) data = product();
        else if (endpoint.endsWith('/online-orders/delivery-address') || endpoint.endsWith('/online-orders/guest/pending')) data = null;
        else if (endpoint.endsWith('/online-orders')) data = [];
        else if (endpoint.endsWith('/online-orders/quote')) {
          if (holdQuotes) await holdQuotes;
          if (!stock) return route.fulfill({ status: 409, json: { message: 'Stock insuficiente' } });
          data = price(body.deliveryType);
        } else if (/\/email-verification\/(guest|client)\/request$/.test(endpoint)) {
          codes++; data = { challengeId: 1, email: body?.email || 'client@example.test', expiresAt: new Date(Date.now() + 600000).toISOString(), resendAvailableAt: new Date().toISOString(), sent: true };
        } else if (/\/email-verification\/(guest|client)\/verify$/.test(endpoint)) {
          data = guest ? { challengeId: 1, email: 'guest@example.test', verifiedAt: new Date().toISOString() } : { token: 'simulated', user: { id: 1, role: 'CLIENT', correo: 'client@example.test', names: 'Cliente', emailVerified: true } };
        } else if (/\/online-orders\/(guest\/)?checkout$/.test(endpoint)) {
          posts++;
          if (nextChange) { nextChange(); nextChange = null; }
          if (!stock) return route.fulfill({ status: 409, json: { message: 'Stock insuficiente' } });
          const current = price(body.deliveryType);
          if (body.quoteFingerprint !== current.quoteFingerprint) return route.fulfill({ status: 409, json: { code: 'QUOTE_CHANGED', message: 'La cotización cambió. Revisa el total actualizado.' } });
          payments++; data = { orderId: 1, token: 'simulated-payment', url: 'https://webpay.example.test/pay', total: Number(current.total) + (mismatchedLaunch ? 1 : 0) };
          assert.equal(body.total, undefined); assert.equal(body.deliveryFee, undefined);
          assert.equal(payments, 1);
        } else throw new Error(`Unexpected API ${endpoint}`);
        return route.fulfill({ json: { data } });
      }
      const file = files.get(endpoint);
      if (file) return route.fulfill({ contentType: endpoint.endsWith('.css') ? 'text/css' : 'application/javascript', body: file.type === 'chunk' ? file.code : file.source });
      if (endpoint === '/checkout') return route.fulfill({ contentType: 'text/html', body: `<html lang="es"><head>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:5184/checkout?${guest ? 'guest&' : ''}theme=${theme}`);
    const pay = page.getByRole('button', { name: /^Pagar con Webpay Plus/ });
    const ready = async () => { await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Pagar con Webpay Plus') && !button.disabled)); };
    if (guest) {
      await page.getByLabel('Nombre y apellido', { exact: true }).fill('Persona Invitada');
      await page.getByLabel('Correo electrónico', { exact: true }).fill('guest@example.test');
      await page.getByLabel('Confirmar correo', { exact: true }).fill('guest@example.test');
      await page.getByLabel('Teléfono', { exact: true }).fill('+56912345678');
    }
    await page.getByRole('button', { name: 'Enviar codigo', exact: true }).click();
    await page.getByLabel('Codigo de 6 digitos').fill('123456');
    await page.getByRole('button', { name: 'Verificar correo', exact: true }).click(); await ready();
    // An in-flight quote never authorizes the provisional amount shown in the summary.
    let release; holdQuotes = new Promise(resolve => { release = resolve; });
    await page.getByRole('radio', { name: /Despacho local/ }).check();
    await page.getByLabel('Destinatario', { exact: true }).fill('Persona receptora');
    await page.getByLabel('Teléfono de contacto', { exact: true }).fill('+56912345678');
    await page.getByLabel('Dirección, numeración o sector', { exact: true }).fill('Calle de prueba 123');
    assert.equal(await pay.isDisabled(), true); assert.equal(posts, 0);
    holdQuotes = null; release(); await ready();
    await page.getByRole('radio', { name: /Retiro en tienda/ }).check(); await ready();
    await page.getByRole('radio', { name: /Despacho local/ }).check(); await ready();
    assert.equal(await page.getByRole('button', { name: /Aceptar resumen actualizado/ }).count(), 0);
    // Each server-side race rejects the old fingerprint without creating a payment.
    const changes = [
      () => { policy.id++; policy.flatFee = '4000.00'; },
      () => { policy.id++; policy.freeShippingFrom = '5990.00'; }, // equality is not free
      () => { policy.id++; policy.freeShippingFrom = '5989.00'; },
      () => { percentage = 20; }, // products net falls below threshold: freight is charged again
      () => { percentage = 10; productPrice = 7000; },
      () => { policy.id++; }, // obsolete technical revision, commercially equivalent
    ];
    for (const [index, change] of changes.entries()) {
      const before = posts; nextChange = change;
      await pay.click(); await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
      await ready();
      const total = Number(price('DELIVERY').total).toLocaleString('es-CL');
      await page.getByRole('button', { name: new RegExp(`Pagar con Webpay Plus.*${total.replaceAll('.', '\\.')}`) }).waitFor();
      if (index < changes.length - 1) await page.getByText(/El resumen cambió\./).waitFor();
      else assert.equal(await page.getByText(/El resumen cambió\./).count(), 0, 'technical-only changes do not manufacture a commercial change');
      assert.equal(posts, before + 1, 'no automatic checkout retry'); assert.equal(payments, 0);
      assert.equal(await page.evaluate(() => Boolean(window.__testWebpay)), false);
    }
    const beforeStockRace = posts; nextChange = () => { stock = 0; };
    await pay.click(); await page.getByText('Stock insuficiente', { exact: true }).first().waitFor();
    assert.equal(posts, beforeStockRace + 1); assert.equal(payments, 0, 'stock changed after the preview: no payment starts');
    assert.equal(await pay.isDisabled(), true);
    stock = 20; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('radio', { name: /Retiro en tienda/ }).check(); await ready();
    await page.getByRole('radio', { name: /Despacho local/ }).check(); await ready();
    stock = 0; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Pagar con Webpay Plus') && button.disabled));
    const before = posts; assert.equal(payments, 0);
    stock = 20; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await ready();
    assert.equal(posts, before); assert.equal(codes, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.FYF_UX_SCREENSHOT_DIR && [320, 1280].includes(width) && guest) await page.screenshot({ path: `${process.env.FYF_UX_SCREENSHOT_DIR}/single-checkout-${width}-${theme}.png`, fullPage: true });
    await pay.dblclick();
    if (mismatchedLaunch) {
      await page.getByText(/El importe del intento de pago no coincide/).first().waitFor();
      assert.equal(await page.evaluate(() => Boolean(window.__testWebpay)), false, 'a replayed/malformed launch with another total cannot open Webpay');
      assert.equal(await pay.isDisabled(), true);
    } else await page.waitForFunction(() => Boolean(window.__testWebpay));
    assert.equal(payments, 1); assert.equal(posts, before + 1);
    scenarios++; await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${scenarios} single-confirmation scenarios: guest/client, pending/changed/obsolete quotes, tariff, threshold equality, promotions, stock, duplicate clicks; APIs and Webpay simulated.`);
} finally { await browser.close(); }

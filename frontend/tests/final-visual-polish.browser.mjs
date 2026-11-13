// Real pages and shared components. Every request is intercepted; no server is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/final-visual-polish.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const title = (await readFile(new URL('../index.html', import.meta.url), 'utf8')).match(/<title>(.*?)<\/title>/)[1];
const shots = await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR || tmpdir(), 'fyf-final-visual-'));
console.log('Screenshots: ' + shots);
const product = { id: 1, name: 'Producto ilustrativo', price: 10000, currentStock: 100, availableStock: 100, minimumStock: 2, categoryId: 1, categoryName: 'Ensayo', unitMeasure: 'unidad', status: true };
const item = { productId: 1, productName: product.name, quantity: 5, returnedQuantity: 0, unitPrice: 10000, subtotal: 50000 };
const sales = Array.from({ length: 180 }, (_, i) => ({ id: i + 1, date: '2026-11-12T12:00:00Z', status: 'ACTIVE', total: 50000, paymentMethod: 'efectivo', userId: 1, userNames: 'Persona', userSurnames: 'Ensayo', details: [item], cancellationRequests: [], ...(i === 179 ? { cancellationRequest: { id: 1, saleId: 180, status: 'PENDING', requestedAt: '2026-11-12T12:00:00Z', reason: 'Solicitud simulada', items: [{ ...item, soldQuantity: 5, requestedQuantity: 1, requestedSubtotal: 10000 }] } } : {}) }));
sales[178] = { ...sales[178], status: 'PARTIALLY_RETURNED', returnedTotal: 10000, details: [{ ...item, returnedQuantity: 1 }] };
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [], unexpected = [];
const paginationPreviews = new Map();
let cases = 0;
const phase = process.env.FYF_UI_PHASE || 'all';
async function open(url, width, theme = 'light', height = width === 375 ? 667 : 844) {
  const populatedPromotions = url.includes('populated=1');
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-12T15:00:00Z'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    assert.equal(url.origin, 'http://fyf-visual.test', 'External access is prohibited');
    if (url.pathname.startsWith('/api/')) {
      if (method === 'POST' && ['/api/auth/password-reset/request', '/api/auth/password-reset/confirm'].includes(url.pathname)) return route.fulfill({ json: { success: true } });
      if (method !== 'GET') { unexpected.push(`${method} ${url.pathname}`); return route.fulfill({ status: 500, json: { message: 'Write blocked in visual test' } }); }
      let data;
      if (url.pathname === '/api/products') data = Array.from({ length: 180 }, (_, i) => ({ ...product, id: i + 1 }));
      else if (url.pathname === '/api/sales') data = sales;
      else if (/^\/api\/sales\/\d+$/.test(url.pathname)) data = sales.find(sale => sale.id === Number(url.pathname.split('/').at(-1)));
      else if (url.pathname === '/api/categories') data = [{ id: 1, name: 'Ensayo' }];
      else if (url.pathname === '/api/promotions') data = populatedPromotions ? [{ id: 1, name: 'Promoción de ensayo', type: 'PERCENTAGE_DISCOUNT', percentage: 10, status: 'ACTIVE', isActive: true, isIndefinite: true, productIds: [], categoryIds: [], startsAt: '2026-11-12T12:00:00Z', endsAt: null, usageCount: 0 }] : [];
      else if (['/api/inventory', '/api/order-logistics', '/api/users'].includes(url.pathname)) data = [];
      else if (url.pathname === '/api/users/roles') data = [{ id: 1, name: 'ADMIN' }, { id: 2, name: 'MANAGER' }, { id: 3, name: 'CASHIER' }, { id: 4, name: 'WAREHOUSE' }];
      else if (url.pathname === '/api/promotions/targets') data = { products: [], categories: [] };
      else if (url.pathname === '/api/reports/sales') data = { sales, total: 9000000, byCashier: [], byPaymentMethod: [] };
      else if (url.pathname === '/api/reports/manager-statistics') data = { kpis: {}, evolution: [] };
      else { unexpected.push(`${method} ${url.pathname}`); data = []; }
      return route.fulfill({ json: { data } });
    }
    const file = files.get(url.pathname);
    return route.fulfill(file ? { contentType: file.fileName.endsWith('.css') ? 'text/css' : file.fileName.endsWith('.png') ? 'image/png' : 'text/javascript', body: file.type === 'chunk' ? file.code : file.source } : { contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
  });
  await page.goto(`http://fyf-visual.test${url}${url.includes('?') ? '&' : '?'}theme=${theme}`);
  await page.locator('main, #root > div').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.app-loading-overlay'));
  return { page, context };
}
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, page.url()); }
async function shot(page, name) { await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true }); }
async function singleRow(nav) {
  const boxes = await nav.getByRole('button').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, height: r.height }; }));
  assert.ok(boxes.every(box => Math.abs(box.y - boxes[0].y) < 1), 'All pagination controls share one row');
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].x >= boxes[i - 1].right, 'Previous, numbers, next: no overlap');
  assert.ok(boxes.every(box => box.height >= 44));
  assert.ok(await nav.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'No pager scrolling');
}
async function headings(page, mobile) {
  for (const group of await page.locator('.auth-mobile-heading').all()) {
    const align = await group.evaluate(el => getComputedStyle(el).textAlign);
    assert.equal(align, mobile ? 'center' : 'start');
  }
}
try {
  for (const width of ['corrections','pagination'].includes(phase) ? [] : phase === 'home' ? [375] : [320, 375, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE']) {
      const { page, context } = await open(`/dashboard?role=${role}`, width, theme);
      const cards = page.locator('.dashboard-metrics > article'); await cards.first().waitFor();
      assert.equal(await cards.count(), ['ADMIN', 'MANAGER'].includes(role) ? 5 : 3);
      const boxes = await cards.evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
      if (width <= 720) { assert.equal(boxes[0].y, boxes[1].y); assert.ok(boxes[1].x > boxes[0].x); assert.ok(Math.abs(boxes.at(-1).width - (boxes[0].width * 2 + 10)) < 2); }
      if (width > 980) assert.equal(new Set(boxes.map(box => box.y)).size, 1);
      if (width <= 980) {
        const before = await page.locator('h1').boundingBox(); await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        const after = await page.locator('h1').boundingBox(); assert.equal(before.x, after.x);
        await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click({ position: { x: width - 8, y: 200 } });
        await page.waitForFunction(() => document.querySelector('[data-loading-sidebar]').getBoundingClientRect().right <= 1);
      }
      if (width === 375) await shot(page, `home-${role}-${theme}`);
      await cards.first().focus(); await page.keyboard.press('Enter'); await page.getByRole('heading', { name: 'Inventario', exact: true }).waitFor();
      await noOverflow(page); cases++; await context.close();
    }
    if (phase === 'home') continue;
    for (const url of ['/login', '/register', '/forgot-password', '/reset-password?token=illustrative-only', '/verify-email?registration=1', '/verify-work-email?role=WAREHOUSE']) {
      const { page, context } = await open(url, width, theme); await headings(page, width <= 720); await noOverflow(page);
      assert.equal(await page.title(), 'Ferreteria FYF');
      if (url === '/login') { assert.equal(await page.getByText(/ACCESO SEGURO/).count(), 0); assert.equal(await page.getByText('V1.0', { exact: true }).isVisible(), width > 720); if ([375,1440].includes(width)) await shot(page, `login-${width}-${theme}`); }
      if (url === '/forgot-password') { await page.getByLabel('Correo electrónico', { exact: true }).fill('persona@example.test'); await page.getByRole('button', { name: 'Enviar instrucciones' }).click(); await page.getByRole('heading', { name: 'Revisa tu correo' }).waitFor(); await headings(page, width <= 720); }
      if (url.startsWith('/reset-password')) { await page.getByLabel('Nueva contraseña', { exact: true }).fill('EnsayoSeguro123!'); await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('EnsayoSeguro123!'); await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click(); await page.getByRole('heading', { name: 'Contraseña actualizada' }).waitFor(); }
      cases++; await context.close();
    }
    const inventory = await open('/products', width, theme), page = inventory.page;
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    const buttons = page.locator('.product-mode-switch > button');
    for (const button of await buttons.all()) { const box = await button.boundingBox(); assert.ok(box.height >= 44); if (width <= 720) assert.equal(await button.evaluate(el => getComputedStyle(el).fontSize), '14px'); }
    assert.equal((await buttons.nth(0).boundingBox()).y, (await buttons.nth(1).boundingBox()).y);
    await buttons.nth(1).click(); assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
    await noOverflow(page); if (width === 320) await shot(page, `product-mode-${theme}`); cases++; await inventory.context.close();
    for (const route of ['/reports', '/statistics?role=MANAGER']) {
      const { page, context } = await open(route, width, theme);
      await page.locator('.period-filter-dates svg').waitFor();
      assert.equal(await page.locator('.period-filter-dates svg').evaluate(el => getComputedStyle(el).color), theme === 'dark' ? 'rgb(251, 146, 60)' : 'rgb(180, 83, 9)');
      await noOverflow(page); cases++; await context.close();
    }
  }
  console.log(`Responsive pages: ${cases}`);
  if (phase !== 'home') {
  for (const role of phase === 'pagination' ? [] : ['ADMIN', 'MANAGER']) for (const width of [320, 375, 390, 768, 1440, 1920]) {
    let reference;
    for (const route of ['/products', '/sales?view=history', '/reports', '/promotions', ...(role === 'MANAGER' ? ['/statistics'] : ['/users'])]) {
      const { page, context } = await open(`${route}${route.includes('?') ? '&' : '?'}role=${role}`, width);
      const title = await page.locator('h1').boundingBox();
      if (reference && width > 720) assert.ok(Math.abs(title.x - reference.x) < 1, route);
      reference = title;
      if (route === '/promotions') {
        assert.equal(await page.locator('h1 svg').count(), 0); assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).fontSize), width <= 720 ? '19px' : '21px');
        const empty = page.getByText('Aún no hay promociones', { exact: true }).locator('../..');
        const box = await empty.boundingBox(), action = await page.getByRole('button', { name: 'Nueva promoción', exact: true }).boundingBox();
        assert.ok(Math.abs(box.x - title.x) < 1); assert.ok(Math.abs(box.x + box.width - action.x - action.width) < 1);
        if (width <= 980) { await page.getByRole('button', { name: 'Abrir menu', exact: true }).click(); assert.equal((await empty.boundingBox()).x, box.x); await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click({ position: { x: width - 8, y: 200 } }); await page.waitForFunction(() => document.querySelector('[data-loading-sidebar]').getBoundingClientRect().right <= 1); }
        if ([375,1920].includes(width)) await shot(page, `promotions-empty-${role}-${width}`);
      }
      if (route.startsWith('/sales')) {
        const review = page.getByRole('button', { name: 'Revisar solicitud de devolución', exact: true }).first();
        if (width < 1000) await page.getByRole('button', { name: /Mostrar detalles de/ }).first().click();
        const detail = page.getByRole('button', { name: 'Detalle', exact: true }).first();
        const a = await detail.boundingBox(), b = await review.boundingBox();
        assert.ok(Math.abs(a.height - b.height) < 1); assert.ok(a.height >= (width < 1000 ? 44 : 36));
        if (width >= 1000) {
          if (role === 'ADMIN') { const direct = await page.getByRole('button', { name: 'Registrar devolución', exact: true }).first().boundingBox(); assert.ok(Math.abs(b.width - direct.width) < 1); }
          else assert.ok(b.width < 180, 'Manager review keeps its compact width');
        }
        assert.equal((await review.innerText()).trim(), 'Revisar'); await review.click();
        await page.getByRole('dialog', { name: 'Revisar solicitud de devolución' }).getByRole('button', { name: 'Cerrar diálogo', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await detail.click(); await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        if (width === 1440) await shot(page, `sales-desktop-${role}`);
        await page.locator('[data-responsive-table]:visible').getByText('Devuelta parcialmente', { exact: true }).waitFor();
        if (width < 1000) { await page.getByRole('button', { name: /Mostrar detalles de/ }).first().click(); assert.equal(await page.getByRole('button', { name: 'Revisar solicitud de devolución', exact: true }).count(), 0); }
      }
      await noOverflow(page); cases++; await context.close();
    }
  }
  console.log(`Headers and sales: ${cases}`);
  for (const width of phase === 'pagination' ? [320,375,390] : [320, 375, 390, 768, 1440]) for (const theme of ['light', 'dark']) for (const total of [0, 1, 2, 3, 5, 6, 12, 18]) for (const current of [...new Set([1, Math.max(1, Math.ceil(total / 2)), Math.max(1, total), ...(total === 18 ? [5] : [])])]) {
    const { page, context } = await open(`/pagination-test?total=${total}&page=${current}`, width, theme);
    const nav = page.getByRole('navigation', { name: 'Paginación', exact: true });
    if (total <= 1) assert.equal(await nav.count(), 0);
    else {
      if (width <= 480) await page.waitForFunction(() => { const nav = document.querySelector('nav[aria-label="Paginación"]'); return nav && nav.scrollWidth <= nav.clientWidth + 1; });
      const numberButtons = nav.getByRole('button', { name: /^Ir a la página/ });
      const values = (await numberButtons.allTextContents()).map(Number);
      for (const n of [1, total, current, ...(width >= 375 ? [current - 1, current + 1] : [])].filter(n => n > 0 && n <= total)) assert.ok(values.includes(n));
      for (let i = 1; i < values.length; i++) assert.notEqual(values[i] - values[i - 1], 2);
      assert.equal(new Set(values).size, values.length); assert.equal(await nav.locator('[aria-current="page"]:visible').innerText(), String(current));
      assert.equal(await nav.getByRole('button', { name: 'Anterior', exact: true }).isDisabled(), current === 1);
      assert.equal(await nav.getByRole('button', { name: 'Siguiente', exact: true }).isDisabled(), current === total);
      if (width <= 480) await singleRow(nav);
      if (width <= 390 && total === 18 && current === 5) {
        await page.waitForTimeout(250);
        assert.equal(await nav.locator('[aria-current="page"]:visible').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(217, 119, 6)');
        await shot(page, `pagination-real-${width}-${theme}`);
      }
      if (width <= 390) { const key = `${width}-${theme}`; if (!paginationPreviews.has(key)) paginationPreviews.set(key, []); paginationPreviews.get(key).push({ label: `${total} páginas · actual ${current}`, html: await nav.evaluate(el => el.outerHTML) }); }
      if (width <= 390 && total === 18 && current === 5) { await page.locator('main').evaluate(el => { el.style.maxWidth = '260px'; }); await page.waitForFunction(() => document.querySelector('nav').scrollWidth <= document.querySelector('nav').clientWidth + 1); await singleRow(nav); await page.locator('main').evaluate(el => { el.style.maxWidth = ''; }); }
      if (current < total) { await nav.getByRole('button', { name: 'Siguiente', exact: true }).click(); assert.equal(await page.getByRole('status', { name: 'Página seleccionada' }).innerText(), String(current + 1)); }
      await numberButtons.first().focus(); await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('status', { name: 'Página seleccionada' }).innerText(), '1');
      await page.getByRole('button', { name: 'Alternar carga' }).click(); for (const button of await nav.getByRole('button').all()) assert.ok(await button.isDisabled());
    }
    await noOverflow(page); cases++; await context.close();
  }
  for (const [key, rows] of paginationPreviews) {
    const [width, theme] = key.split('-'); const preview = await open('/pagination-test?total=0', Number(width), theme);
    await preview.page.setContent(`<html class="${theme === 'dark' ? 'dark' : ''}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><main style="margin:14px"><h1 style="font-size:16px">Paginación ${key}</h1><p>0 y 1 páginas: sin controles.</p>${rows.map(row => `<section style="margin-top:12px"><h2 style="font-size:12px">${row.label}</h2><div style="border:1px solid #ccd2d9">${row.html}</div></section>`).join('')}</main></body></html>`);
    await preview.page.waitForTimeout(250); await shot(preview.page, `pagination-matrix-${key}`); await preview.context.close();
  }
  for (const width of [320,375,390,768,1920]) for (const theme of ['light','dark']) {
    const run = await open('/promotions?populated=1', width, theme); await run.page.getByRole('heading', {name:'Promoción de ensayo',exact:true}).waitFor();
    await run.page.getByRole('button', {name:'Editar Promoción de ensayo',exact:true}).click(); await run.page.getByRole('dialog').getByRole('button', {name:'Cerrar diálogo',exact:true}).click(); await run.page.getByRole('dialog').waitFor({state:'hidden'});
    await noOverflow(run.page); cases++; await run.context.close();
  }
  }
  for (const width of [320, 375, 390, 768, 1440]) {
    const { page, context } = await open('/metrics-test', width);
    const cards = await page.locator('.dashboard-metrics > article').first().boundingBox(); assert.ok(cards.width > 0);
    const boxes = await page.locator('.dashboard-metrics > article').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().y));
    if (width <= 720) assert.deepEqual(boxes, [boxes[0], boxes[0], boxes[2], boxes[2]]);
    await noOverflow(page); if (width === 320) await shot(page, 'four-cards-large-values'); cases++; await context.close();
  }
  const unscoped = await open('/panel-test', 375);
  assert.equal(await unscoped.page.locator('.auth-mobile-heading').count(), 0); await unscoped.context.close(); cases++;
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ cases, screenshots: shots, errors, unexpected }, null, 2));
} finally { await browser.close(); }

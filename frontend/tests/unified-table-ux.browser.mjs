// Real React pages in Chromium, with every API intercepted and all writes forbidden.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/academic-ux-stage2.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const shots = await mkdtemp(path.join(process.env.FYF_UX_SCREENSHOT_DIR || tmpdir(), 'fyf-unified-tables-'));
const errors = [];
const item = { productId: 99, productName: 'Artículo de prueba con descripción extensa para comprobar el centrado y el ajuste de varias líneas', quantity: 5, returnedQuantity: 0, unitPrice: 3000, subtotal: 15000 };
const sales = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, date: '2026-11-05T12:00:00Z', status: 'ACTIVE', total: 15000, paymentMethod: 'efectivo', userId: 2, userNames: 'Cajero', userSurnames: 'Prueba', details: [item], cancellationRequests: [], ...(i === 11 ? { cancellationRequest: { id: 1, saleId: 12, status: 'PENDING', requestedAt: '2026-11-05T12:00:00Z', reason: 'Solicitud simulada', items: [{ ...item, soldQuantity: 5, requestedQuantity: 1, requestedSubtotal: 3000 }] } } : {}) }));
const order = { id: 10, origin: 'ONLINE', status: 'PAID', total: 15000, customerName: 'Cliente de prueba', customerEmail: 'cliente@example.test', customerType: 'CLIENT', deliveryType: 'PICKUP', createdAt: '2026-11-05T12:00:00Z', paidAt: '2026-11-05T12:01:00Z', items: [item], availableDocuments: [] };
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  async function open(mode, width, theme) {
    const context = await browser.newContext({ viewport: { width, height: 940 }, hasTouch: width < 700, reducedMotion: 'reduce' });
    const page = await context.newPage(), calls = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        assert.equal(route.request().method(), 'GET', 'No persistence or payment writes');
        calls.push({ path: url.pathname, ...Object.fromEntries(url.searchParams) });
        let data;
        if (url.pathname === '/api/product-audits') {
          await new Promise(resolve => setTimeout(resolve, 160));
          const all = url.searchParams.get('productId') === '999' ? [] : Array.from({ length: 202 }, (_, i) => ({ id: `event-${i}`, at: '2026-11-05T12:00:00Z', operation: 'PRODUCT_NAME_CORRECTION', label: 'Corrección de nombre individual', subject: { productId: 99, familyId: 18 }, actor: { name: 'Administrador de prueba' }, reason: 'Corrección descriptiva registrada para verificar la legibilidad de la tabla', affectedProductIds: [99], changes: [{ field: 'Nombre', before: 'Anterior', after: 'Corregido' }] }));
          const totalPages = Math.max(1, Math.ceil(all.length / 10)), requestedPage = Number(url.searchParams.get('page') || 1), page = Math.min(requestedPage, totalPages), offset = (page - 1) * 10;
          data = { items: all.slice(offset, offset + 10), page, requestedPage, pageSize: 10, totalItems: all.length, totalPages, operations: { PRODUCT_NAME_CORRECTION: 'Corrección de nombre individual' } };
        } else if (url.pathname === '/api/products') data = [{ id: 99, name: item.productName, price: 3000, currentStock: 10, availableStock: 10, minimumStock: 2, categoryId: 1, categoryName: 'Herramientas de prueba', unitMeasure: 'unidad', status: true }];
        else if (url.pathname === '/api/sales') data = sales;
        else if (/^\/api\/sales\/\d+$/.test(url.pathname)) data = sales.find(s => s.id === Number(url.pathname.split('/').at(-1)));
        else if (url.pathname === '/api/users/roles') data = [{ id: 1, name: 'ADMIN' }, { id: 2, name: 'CASHIER' }, { id: 3, name: 'WAREHOUSE' }];
        else if (url.pathname === '/api/users') data = ['CASHIER', 'WAREHOUSE'].map((roleName, i) => ({ id: i + 2, roleName, names: i ? 'Bodeguero' : 'Cajero', surnames: 'Prueba', correo: `persona${i}@example.test`, rut: '11111111-1', status: 'ACTIVE', createdAt: '2026-11-05T12:00:00Z', workShift: i ? null : 'MORNING', shiftStartTime: i ? null : '08:30', shiftEndTime: i ? null : '13:30' }));
        else if (url.pathname === '/api/reports/sales') data = { sales, byCashier: [], byPaymentMethod: [], salesCount: sales.length, total: 180000 };
        else if (url.pathname === '/api/order-logistics') data = [order];
        else if (url.pathname === '/api/online-orders/10' || url.pathname === '/api/online-orders/guest/order') data = { ...order, payments: [], guestName: 'Invitado de prueba', guestEmail: 'invitado@example.test' };
        else if (url.pathname === '/api/order-logistics/online/10') data = order;
        else if (url.pathname.endsWith('/administrative-summary')) data = { ...order, folio: 'P-000010', notice: 'Datos de prueba interceptados', buyer: { name: 'Cliente de prueba', type: 'CLIENT', email: 'cliente@example.test' }, delivery: { type: 'PICKUP', label: 'Retiro en tienda' }, items: [{ ...item, discountAmount: 0 }], paymentConfirmed: false };
        else throw new Error('Unexpected API blocked: ' + url.pathname);
        return route.fulfill({ json: { data } });
      }
      if (url.hostname !== '127.0.0.1' || url.port !== '5184') return route.abort();
      const file = files.get(url.pathname);
      if (file) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: file.type === 'chunk' ? file.code : file.source });
      return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
    });
    await page.goto(`http://127.0.0.1:5184/ux-test?case=${mode}&theme=${theme}${mode === 'tracking' ? '&guest' : ''}`);
    return { page, context, calls };
  }
  const idle = page => page.waitForFunction(() => document.querySelector('[aria-label="Eventos administrativos"]')?.getAttribute('aria-busy') === 'false');
  const actionStyle = locator => locator.evaluate(button => { const style = getComputedStyle(button); return Object.fromEntries(['height','paddingTop','paddingBottom','paddingLeft','paddingRight','borderRadius','borderWidth','borderColor','backgroundColor','color','gap','alignItems','justifyContent'].map(key=>[key,style[key]])); });
  async function centered(page) {
    const bad = await page.locator('table.fyf-data-table:visible').evaluateAll(tables => tables.flatMap(table => [...table.querySelectorAll('th, td')].filter(cell => cell.getClientRects().length && getComputedStyle(cell).textAlign !== (cell.tagName === 'TD' && cell.classList.contains('table-description-cell') ? 'left' : 'center')).map(cell => cell.textContent)));
    assert.deepEqual(bad, [], 'Headers, amounts and actions stay centered; opted-in descriptions read from the left');
  }
  async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  for (const theme of ['light', 'dark']) for (const width of [320, 360, 390, 430, 1280, 1440]) {
    const audit = await open('audit', width, theme), p = audit.page;
    await idle(p);
    assert.equal(await p.getByText('Eventos por página', { exact: true }).count(), 0);
    assert.equal(await p.getByText('Las páginas siguientes se habilitan al avanzar.', { exact: true }).count(), 0);
    const panel = p.getByRole('region', { name: 'Eventos administrativos' });
    const pager = panel.getByRole('navigation', { name: 'Páginas del historial de cambios' });
    const next = pager.getByRole('button', { name: 'Siguiente', exact: true });
    assert.equal(await p.getByRole('columnheader',{name:'Acciones',exact:true}).count(),1);
    assert.equal(await p.getByRole('button',{name:'Limpiar filtros',exact:true}).locator('svg.lucide-rotate-ccw').count(),1);
    const auditActionStyle = width >= 1024 ? await actionStyle(p.locator('.audit-detail-action').first()) : null;
    assert.ok(await pager.getByRole('button', { name: 'Ir a la página 21', exact: true }).isVisible(), 'Last page available without discovery requests');
    for (const pageNumber of [2, 21]) {
      await pager.scrollIntoViewIfNeeded(); await p.waitForTimeout(80);
      const y = await p.evaluate(() => scrollY);
      const response = p.waitForResponse(r => new URL(r.url()).pathname === '/api/product-audits');
      const countBefore = audit.calls.length;
      await (pageNumber === 2 ? next : pager.getByRole('button', { name: 'Ir a la página 21', exact: true })).click();
      await p.waitForFunction(() => document.querySelector('[aria-label="Eventos administrativos"]')?.getAttribute('aria-busy') === 'true');
      assert.equal(await p.locator('.audit-event-summary').count(), 10, 'Previous rows remain mounted during load');
      assert.ok(Math.abs(await p.evaluate(() => scrollY) - y) < 3, 'No loading jump');
      assert.ok(await next.isDisabled());
      await response; await idle(p);
      assert.equal(audit.calls.length, countBefore + 1, 'A distant jump requires exactly one request');
      assert.equal(audit.calls.at(-1).page, String(pageNumber));
      if (pageNumber === 2) assert.ok(Math.abs(await p.evaluate(() => scrollY) - y) < 3, 'Same-height pages retain their scroll position');
      const geometry = await panel.evaluate(section => { const content=section.querySelector('.audit-table-content'), rows=section.querySelectorAll('.audit-event-summary'); return {height:content.getBoundingClientRect().height,minHeight:getComputedStyle(content).minHeight,gap:section.querySelector('.audit-history-pagination').getBoundingClientRect().top-rows[rows.length-1].getBoundingClientRect().bottom}; });
      assert.equal(geometry.minHeight,'0px','No artificial reserved height');
      assert.ok(geometry.gap >= -1 && geometry.gap <= 18, 'Pagination follows the final visible row');
      if (pageNumber === 2) p.fullAuditHeight = geometry.height;
      else { assert.equal(await p.locator('.audit-event-summary').count(),2); assert.ok(geometry.height < p.fullAuditHeight / 2, 'Short last page shrinks on desktop and mobile'); if ([390,1280].includes(width)) await panel.screenshot({path:path.join(shots,`audit-short-${width}-${theme}.png`)}); }
      assert.equal(await pager.getByRole('button', { name: `Ir a la página ${pageNumber}`, exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await panel.getByRole('status').innerText(), `Mostrando ${pageNumber === 21 ? 2 : 10} de 202 cambios administrativos`);
    }
    assert.ok(await next.isDisabled());
    await Promise.all([p.waitForResponse(r => r.url().includes('/api/product-audits')), pager.getByRole('button', { name: 'Anterior', exact: true }).click()]); await idle(p);
    await Promise.all([p.waitForResponse(r => r.url().includes('/api/product-audits')), pager.getByRole('button', { name: 'Ir a la página 1', exact: true }).click()]); await idle(p);
    assert.ok(audit.calls.every(c => c.limit === '10' && c.page && !c.cursor));
    assert.equal(await panel.getByRole('status').innerText(), 'Mostrando 10 de 202 cambios administrativos');
    await p.getByRole('button', { name: /^Ver detalle:/ }).first().click();
    const detail = p.locator('.audit-event-detail:not([hidden])');
    const misaligned = await detail.locator('td, p, strong, dt, dd, dl, [data-change-kind]').evaluateAll(elements => elements.filter(element => getComputedStyle(element).textAlign !== 'left').map(element => element.textContent));
    assert.deepEqual(misaligned, [], 'Expanded historical detail and field labels stay left aligned on desktop and mobile');
    assert.equal(await detail.locator('td > .grid').evaluate(element => getComputedStyle(element).justifyItems), 'stretch');
    if (width >= 1024) await centered(p);
    await noOverflow(p);
    if ([390, 1280].includes(width)) await panel.screenshot({ path: path.join(shots, `audit-${width}-${theme}.png`) });
    await p.getByLabel('ID de producto', { exact: true }).fill('999');
    await p.getByText('No hay cambios registrados para estos filtros.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('status').innerText(), 'Mostrando 0 de 0 cambios administrativos');
    assert.ok(await next.isDisabled());
    await audit.context.close();
    for (const mode of ['sales', 'users', 'reports', 'orders', 'payment', 'tracking']) {
      const run = await open(mode, width, theme), page = run.page;
      await page.locator('[data-responsive-table="mobile"] [data-mobile-table-row], [data-responsive-table="desktop"] tbody tr').first().waitFor({ state: 'attached' });
      await page.waitForFunction(() => !document.querySelector('.app-loading-overlay'));
      if (width >= 1000) await centered(page);
      await noOverflow(page);
      if (mode === 'sales' && width >= 1000) {
        const a = await page.getByRole('button', { name: 'Registrar devolución', exact: true }).first().boundingBox();
        const b = await page.getByRole('button', { name: 'Revisar solicitud', exact: true }).first().boundingBox();
        assert.ok(Math.abs(a.width - b.width) < 1);
        await page.getByRole('button', { name: 'Registrar devolución', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('table').waitFor(); await centered(page);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Revisar solicitud', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('table').waitFor(); await centered(page); await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Detalle', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('table').waitFor(); await centered(page); await page.keyboard.press('Escape');
      }
      if (mode === 'orders' && width >= 1000) {
        assert.equal(await page.getByRole('columnheader',{name:'Acciones',exact:true}).count(),1);
        assert.deepEqual(await actionStyle(page.getByRole('button',{name:'Ver detalle',exact:true}).first()),auditActionStyle,'Audit and logistics use the same detail button appearance');
        await page.getByRole('button', { name: 'Ver detalle', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('table').waitFor(); await centered(page);
        await page.getByRole('button', { name: 'Ficha administrativa para registro manual' }).click();
        await page.getByRole('dialog').getByRole('table').nth(1).waitFor(); await centered(page);
        await page.keyboard.press('Escape');
      }
      if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `${mode}-${width}-${theme}.png`), fullPage: true });
      await run.context.close();
    }
    console.log(`PASS unified tables ${width}px ${theme}: direct page 21, stable scroll, fixed 10, short final page, integrated panel, sales/users/reports/logistics`);
  }
  const legacy = await open('audit', 1280, 'light');
  await idle(legacy.page);
  await legacy.page.goto('http://127.0.0.1:5184/products/administrative-changes?limit=50&cursor=old_cursor');
  await idle(legacy.page);
  assert.equal(legacy.calls.at(-1).limit, '10');
  assert.ok(!legacy.calls.at(-1).cursor, 'A link using the old page size cannot reuse its incompatible cursor');
  assert.equal(await legacy.page.getByRole('status').innerText(), 'Mostrando 10 de 202 cambios administrativos');
  for (const requested of [11, 999999]) {
    const count = legacy.calls.length;
    await legacy.page.goto(`http://127.0.0.1:5184/products/administrative-changes?page=${requested}`);
    await idle(legacy.page);
    assert.equal(legacy.calls.length,count+1);
    assert.equal(await legacy.page.getByRole('button',{name:`Ir a la página ${requested === 11 ? 11 : 21}`,exact:true}).getAttribute('aria-current'),'page');
    assert.equal(await legacy.page.getByRole('status').innerText(),`Mostrando ${requested === 11 ? 10 : 2} de 202 cambios administrativos`);
  }
  await legacy.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS read-only intercepted APIs; screenshots:', shots);
} finally { await browser.close(); }

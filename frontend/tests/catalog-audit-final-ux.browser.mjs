// Real React pages and Chromium; all HTTP APIs are intercepted, never persistence.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/academic-ux-stage2.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const shots = await mkdtemp(path.join(process.env.FYF_UX_SCREENSHOT_DIR || tmpdir(), 'fyf-final-catalog-audit-'));
const errors = [];
const product = { id: 99, familyId: 18, name: 'Clavo de prueba 3,7 × 1 1/2 pulgadas', categoryId: 1, categoryName: 'Prueba', brand: 'Prueba', price: 8990, currentStock: 100, availableStock: 100, status: true, unitMeasure: 'caja', images: [] };
const auditEvent = { id: 'event-1', at: '2026-11-04T12:00:00Z', operation: 'PRODUCT_NAME_CORRECTION', label: 'Corrección de nombre', subject: { productId: 99, familyId: 18 }, actor: { id: 1, name: 'Admin Prueba' }, reason: 'Corrección descriptiva de prueba', affectedProductIds: [99], changes: [{ field: 'Nombre', before: 'Nombre anterior', after: 'Nombre corregido' }] };
const auditOperations = {
  PRODUCT_NAME_CORRECTION: 'Corrección de nombre individual', PRODUCT_CLASSIFICATION_CORRECTION: 'Corrección de marca o categoría de producto simple',
  FAMILY_BRAND_CORRECTION: 'Corrección de marca familiar', FAMILY_CATEGORY_CHANGE: 'Reclasificación de categoría familiar', FAMILY_DEACTIVATE: 'Desactivación de variantes de la familia',
  ATTRIBUTE_RENAME: 'Renombrado de atributo', OPTION_LABEL_CORRECTION: 'Corrección de etiqueta compartida', DIMENSION_ADD: 'Incorporación de dimensión',
  CONVERT_SIMPLE: 'Conversión a familia con variantes', BUNDLE_SAVE: 'Guardado de familia y variantes', SIMPLE_SAVE: 'Alta de producto simple', DETACH: 'Desvinculación controlada',
  ARCHIVE: 'Archivado de familia', REACTIVATE: 'Reactivación de familia', ASSOCIATION: 'Asociación o clasificación de variante', OTHER: 'Otro evento registrado',
};
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  async function pageFor(mode, width, theme, extra = '') {
    const context = await browser.newContext({ viewport: { width, height: 940 }, reducedMotion: 'reduce', hasTouch: width < 700 });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const catalogCalls = [], auditCalls = [];
    let failAudit = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        assert.equal(route.request().method(), 'GET', 'No real or simulated writes are needed');
        let data;
        if (url.pathname === '/api/catalog/products') {
          catalogCalls.push(Object.fromEntries(url.searchParams));
          const filtered = url.searchParams.has('minPrice');
          data = { items: [product, { ...product, id: 100, familyId: null, name: 'Producto simple', price: 25000 }], page: Number(url.searchParams.get('page') || 1), pageSize: 20, totalItems: filtered ? 2 : 40, totalPages: filtered ? 1 : 2, facets: { categories: [{ id: 1, name: 'Prueba' }], brands: ['Prueba', 'Otra'] } };
        } else if (/\/catalog\/products\/\d+$/.test(url.pathname)) {
          const id = Number(url.pathname.split('/').at(-1));
          data = { ...product, id, ...(id === 100 ? { familyId: null, name: 'Producto simple', price: 25000 } : {}) };
        } else if (url.pathname === '/api/catalog/families/18') data = { id: 18, name: 'Familia de prueba', attributes: [{ id: 1, name: 'Color', options: [{ id: 1, label: 'Rojo' }, { id: 2, label: 'Azul' }] }], variants: [99, 100].map((id, i) => ({ ...product, id, variantValues: [{ attributeId: 1, optionId: i + 1, label: i ? 'Azul' : 'Rojo' }] })) };
        else if (url.pathname === '/api/product-audits') {
          auditCalls.push(Object.fromEntries(url.searchParams));
          await new Promise(resolve => setTimeout(resolve, url.searchParams.get('productId') === '1' ? 300 : 70));
          if (failAudit) { failAudit = false; return route.fulfill({ status: 500, json: { message: 'Error de consulta simulado' } }); }
          const entries = [
            ...Array.from({ length: 72 }, (_, i) => { const operation = i % 4 === 1 ? 'FAMILY_DEACTIVATE' : 'PRODUCT_NAME_CORRECTION'; return { ...auditEvent, id: `event-${i + 1}`, operation, label: auditOperations[operation] }; }),
            ...[{ productId: 22, familyId: 7 }, { productId: 33, familyId: 22 }, { productId: 22, familyId: 22 }].map((subject, i) => ({ ...auditEvent, id: `specific-${i}`, subject, affectedProductIds: [subject.productId] })),
          ].filter(event => (!url.searchParams.has('productId') || event.subject.productId === Number(url.searchParams.get('productId')))
            && (!url.searchParams.has('familyId') || event.subject.familyId === Number(url.searchParams.get('familyId')))
            && (!url.searchParams.has('operation') || event.operation === url.searchParams.get('operation')));
          const offset = Number(url.searchParams.get('cursor')?.split('_').at(-1) || 0), limit = Number(url.searchParams.get('limit') || 10);
          data = { items: url.searchParams.get('productId') === '1' ? [{ ...auditEvent, label: 'Respuesta antigua sin vigencia' }] : entries.slice(offset, offset + limit), nextCursor: offset + limit < entries.length ? `test_offset_${offset + limit}` : null, operations: auditOperations };
        } else if (url.pathname === '/api/products') data = [{ ...product, familyName: 'Familia de prueba', minimumStock: 5 }, { ...product, id: 100, familyId: null, name: 'Producto simple', minimumStock: 2 }];
        else if (url.pathname === '/api/categories') data = [{ id: 1, name: 'Prueba' }];
        else if (url.pathname === '/api/inventory') data = [{ id: 1, productId: 99, productName: product.name, categoryId: 1, categoryName: 'Prueba', movementType: 'ENTRY', quantity: 5, date: '2026-11-04T12:00:00Z', userNames: 'Admin', userSurnames: 'Prueba', reason: 'Entrada simulada', historicalIdentity: { origin: 'ORIGINAL', capturedAt: '2026-11-04T12:00:00Z', identity: { family: { attributes: [{ name: 'Medida', label: '3,7 × 1 1/2 pulgadas' }] } } } }];
        else if (url.pathname === '/api/online-orders') data = [];
        else throw new Error('Unexpected API blocked: ' + url.pathname);
        return route.fulfill({ json: { data } });
      }
      if (url.hostname !== '127.0.0.1' || url.port !== '5184') return route.abort();
      const file = files.get(url.pathname);
      if (file) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: file.type === 'chunk' ? file.code : file.source });
      return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
    });
    await page.goto(`http://127.0.0.1:5184/ux-test?case=${mode}&theme=${theme}&${extra}`);
    return { page, context, catalogCalls, auditCalls, failNextAudit() { failAudit = true; } };
  }
  async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow'); }
  async function waitCatalog(page) { await page.getByRole('region', { name: 'Productos del catálogo' }).waitFor(); await page.waitForFunction(() => !document.querySelector('.catalog-loading-scope[aria-busy="true"]')); }

  for (const theme of ['light', 'dark']) for (const width of [320, 360, 390, 430, 1280, 1440]) {
    const run = await pageFor('journey', width, theme, 'guest&allow-clear');
    const { page, catalogCalls } = run;
    await waitCatalog(page);
    await page.getByRole('link', { name: 'Ver producto', exact: true }).nth(1).click();
    await page.getByRole('heading', { name: 'Producto simple', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Ver otras opciones de esta familia' }).count(), 0);
    await noOverflow(page);
    await page.getByRole('link', { name: 'Volver al catálogo', exact: true }).click();
    await waitCatalog(page);
    await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/api/catalog/products' && new URL(response.url()).searchParams.get('page') === '2'), page.getByRole('button', { name: 'Ir a la página siguiente', exact: true }).first().click()]);
    await waitCatalog(page);
    assert.equal(catalogCalls.at(-1).page, '2');
    if (width < 1024) await page.getByRole('button', { name: /^Filtrar/ }).click();
    const filters = width < 1024 ? page.getByRole('dialog') : page.getByRole('complementary', { name: 'Filtros del catálogo' });
    const min = filters.getByRole('textbox', { name: 'Mínimo' });
    if (width >= 1024) assert.ok(await filters.getByRole('button', { name: 'Limpiar filtros' }).evaluate(button => Math.abs(button.getBoundingClientRect().width - button.parentElement.getBoundingClientRect().width) < 2 && getComputedStyle(button).justifyContent === 'center'));
    await min.click(); const before = catalogCalls.length;
    await min.pressSequentially('20000', { delay: 70 });
    await page.waitForTimeout(550);
    assert.equal(catalogCalls.length, before, 'Draft typing does not query');
    assert.equal(await min.inputValue(), '20000'); assert.ok(await min.evaluate(e => e === document.activeElement));
    await filters.getByRole('textbox', { name: 'Máximo' }).fill('30000');
    await filters.getByRole('combobox', { name: 'Filtrar por marca' }).click();
    await page.getByRole('option', { name: 'Prueba', exact: true }).click();
    await filters.getByRole('combobox', { name: 'Filtrar por disponibilidad' }).click();
    await page.getByRole('option', { name: 'Con stock', exact: true }).click();
    await filters.getByRole('checkbox', { name: 'Promociones 2x1' }).check();
    assert.equal(catalogCalls.length, before);
    if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `filters-${width}-${theme}.png`), fullPage: true });
    await filters.getByRole('button', { name: 'Aplicar filtros' }).click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await waitCatalog(page);
    assert.deepEqual(Object.fromEntries(['minPrice', 'maxPrice', 'brand', 'availability', 'promotionTypes', 'page'].map(key => [key, catalogCalls.at(-1)[key]])), { minPrice: '20000', maxPrice: '30000', brand: 'Prueba', availability: 'in-stock', promotionTypes: 'BUY_2_PAY_1', page: '1' });
    if (width < 1024) await page.getByRole('button', { name: /^Filtrar/ }).click();
    await min.fill('40000'); const count = catalogCalls.length;
    await filters.getByRole('button', { name: 'Aplicar filtros' }).click();
    await page.waitForTimeout(100); assert.equal(catalogCalls.length, count); assert.ok(await filters.getByRole('alert').count());
    await min.fill('-1'); await min.press('Enter'); assert.equal(catalogCalls.length, count);
    await min.fill('1000'); await min.press('Enter');
    await waitCatalog(page);
    if (width < 1024) await page.getByRole('button', { name: /^Filtrar/ }).click();
    await filters.getByRole('button', { name: 'Limpiar filtros' }).click();
    if (width < 1024) { await page.keyboard.press('Escape'); }
    await waitCatalog(page); assert.ok(!catalogCalls.at(-1).minPrice && !catalogCalls.at(-1).brand && !catalogCalls.at(-1).promotionTypes);
    await page.getByRole('link', { name: 'Ver producto', exact: true }).first().click();
    await page.getByRole('heading', { name: product.name, exact: true }).waitFor();
    const family = page.getByRole('link', { name: 'Ver otras opciones de esta familia' });
    const geometry = await family.evaluate(link => ({ top: link.getBoundingClientRect().top, priceBottom: link.previousElementSibling.getBoundingClientRect().bottom, border: getComputedStyle(link).borderTopWidth }));
    assert.ok(geometry.top >= geometry.priceBottom); assert.notEqual(geometry.border, '0px');
    await noOverflow(page);
    if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `detail-${width}-${theme}.png`), fullPage: true });
    await family.focus(); assert.ok(await family.evaluate(e => e === document.activeElement));
    await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
    await page.getByRole('button', { name: 'Ver carrito', exact: true }).click();
    await page.getByRole('heading', { name: 'Carrito', exact: true }).waitFor();
    const header = page.locator('.cart-page-header');
    const back = header.getByRole('link', { name: 'Volver al producto' });
    const clear = header.getByRole('button', { name: 'Limpiar carrito' });
    if (width <= 620) {
      const layout = await header.evaluate(h => { const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, center: (r.left + r.right) / 2, height: r.height, width: r.width, top: r.top }; }; return { head: box(h), title: box(h.querySelector('h1')), back: box(h.querySelector('a')), clear: box(h.querySelector('button')), description: getComputedStyle(h.querySelector('p')).textAlign, hiddenText: getComputedStyle(h.querySelector('button span')).display }; });
      assert.ok(layout.back.right <= layout.title.left && layout.title.right <= layout.clear.left);
      assert.ok(Math.abs(layout.title.center - layout.head.center) < 2); assert.equal(layout.description, 'center'); assert.equal(layout.hiddenText, 'none'); assert.ok(layout.back.width >= 44 && layout.clear.height >= 44);
    }
    await clear.click(); assert.equal(await page.evaluate(() => window.__testCartClears), 1);
    if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `cart-${width}-${theme}.png`), fullPage: true });
    await noOverflow(page);
    await back.click(); await page.getByRole('heading', { name: product.name, exact: true }).waitFor();
    assert.ok(page.url().includes('/catalog/products/99'));
    await family.focus(); await family.press('Enter'); assert.ok(page.url().includes('/catalog/families/18?variant=99'));
    await page.locator('footer').getByRole('link', { name: 'Cambios y devoluciones' }).click();
    await page.getByRole('heading', { name: 'Cambios y devoluciones', exact: true }).waitFor();
    if (width <= 620) assert.ok(await page.locator('.public-page-header').evaluate(h => h.querySelector('a').getBoundingClientRect().right <= h.querySelector('h1').getBoundingClientRect().left));
    await noOverflow(page);
    if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `returns-${width}-${theme}.png`), fullPage: true });
    await page.locator('.public-page-header .compact-back-link').click();
    await page.waitForURL('**/catalog/families/18?variant=99');
    await page.locator('footer').getByRole('link', { name: 'Condiciones de despacho' }).click();
    await page.getByRole('heading', { name: 'Condiciones de despacho local', exact: true }).waitFor();
    if (width <= 620) assert.ok(await page.locator('.public-page-header').evaluate(h => h.querySelector('a').getBoundingClientRect().right <= h.querySelector('h1').getBoundingClientRect().left));
    await noOverflow(page);
    await page.locator('.public-page-header .compact-back-link').click();
    await page.waitForURL('**/catalog/families/18?variant=99');
    await run.context.close();

    const audit = await pageFor('audit', width, theme);
    const p = audit.page;
    const waitAudit = async action => { await Promise.all([p.waitForResponse(response => new URL(response.url()).pathname === '/api/product-audits'), action()]); await p.waitForFunction(() => document.querySelector('[aria-label="Eventos administrativos"]')?.getAttribute('aria-busy') === 'false'); };
    await p.getByRole('table').waitFor();
    await p.getByText('Admin Prueba', { exact: true }).first().waitFor();
    assert.equal(await p.getByRole('columnheader').count(), 6, 'Column names remain available to assistive technology on mobile');
    assert.equal(await p.getByRole('button', { name: 'Filtrar', exact: true }).count(), 0);
    assert.equal(await p.getByText('Eventos por página', { exact: true }).count(), 0);
    assert.equal(await p.getByText('Las páginas siguientes se habilitan al avanzar.', { exact: true }).count(), 0);
    const id = p.getByRole('spinbutton', { name: 'ID de producto', exact: true });
    const calls = audit.auditCalls.length;
    await id.pressSequentially('99', { delay: 100 });
    await p.waitForTimeout(150); assert.equal(audit.auditCalls.length, calls);
    await p.waitForResponse(response => new URL(response.url()).pathname === '/api/product-audits' && new URL(response.url()).searchParams.get('productId') === '99');
    await p.getByRole('table').waitFor(); assert.ok(await id.evaluate(e => e === document.activeElement));
    await p.getByRole('button', { name: /^Ver detalle:/ }).first().click(); assert.match(await p.locator('.audit-event-detail:not([hidden])').innerText(), /Nombre corregido/);
    if (width < 1024) assert.ok(await p.locator('.audit-event-detail:not([hidden])').evaluate(row => row.getBoundingClientRect().bottom >= row.querySelector('td').getBoundingClientRect().bottom), 'Expanded detail fits its mobile row');
    await Promise.all([p.waitForResponse(response => new URL(response.url()).pathname === '/api/product-audits' && new URL(response.url()).searchParams.has('cursor')), p.getByRole('button', { name: 'Siguiente', exact: true }).click()]); await p.getByRole('table').waitFor(); assert.ok(audit.auditCalls.at(-1).cursor);
    const pager = p.getByRole('navigation', { name: 'Páginas del historial de cambios' });
    assert.equal(await pager.getByRole('button', { name: 'Ir a la página 2', exact: true }).getAttribute('aria-current'), 'page');
    await Promise.all([p.waitForResponse(response => new URL(response.url()).searchParams.get('cursor') === 'test_offset_20'), pager.getByRole('button', { name: 'Ir a la página 3', exact: true }).click()]);
    await p.getByRole('table').waitFor();
    await Promise.all([p.waitForResponse(response => new URL(response.url()).pathname === '/api/product-audits' && !new URL(response.url()).searchParams.has('cursor')), pager.getByRole('button', { name: 'Ir a la página 1', exact: true }).click()]);
    await p.getByRole('table').waitFor();
    assert.equal(await pager.getByRole('button', { name: 'Ir a la página 4', exact: true }).count(), 1, 'Known forward range remains accessible through the shared compact page window');
    const operation = p.getByRole('combobox', { name: 'Operación', exact: true });
    await operation.scrollIntoViewIfNeeded();
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await operation.click();
    await p.getByRole('listbox').waitFor();
    assert.equal(await p.getByRole('listbox').getByRole('option').count(), Object.keys(auditOperations).length + 1);
    assert.ok(await p.locator('.app-select-options').evaluate(e => e.scrollHeight > e.clientHeight));
    assert.ok(await p.locator('.app-select-popup').evaluate(e => { const r = e.getBoundingClientRect(); return e.parentElement === document.body && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    if ([390, 1280].includes(width)) await p.screenshot({ path: path.join(shots, `audit-operation-${width}-${theme}.png`) });
    const searchOperation = p.getByRole('textbox', { name: 'Buscar en Operación' });
    await searchOperation.fill('desactivacion');
    assert.equal(await p.getByRole('listbox').getByRole('option').count(), 1);
    await waitAudit(() => searchOperation.press('Enter'));
    await p.getByRole('table').waitFor(); assert.equal(audit.auditCalls.at(-1).operation, 'FAMILY_DEACTIVATE'); assert.ok(!audit.auditCalls.at(-1).cursor);
    await operation.focus(); await operation.press('ArrowDown'); await searchOperation.waitFor(); await searchOperation.press('Escape');
    assert.equal(await p.getByRole('listbox').count(), 0); await p.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox');
    await operation.click(); await p.getByRole('heading', { name: 'Historial de cambios administrativos' }).click(); assert.equal(await p.getByRole('listbox').count(), 0);
    await operation.click(); await searchOperation.fill('Todas las operaciones');
    await waitAudit(() => p.getByRole('listbox').getByRole('option', { name: 'Todas las operaciones', exact: true }).click());
    assert.ok(!audit.auditCalls.at(-1).operation);
    if ([390, 1280].includes(width)) await pager.screenshot({ path: path.join(shots, `audit-pagination-${width}-${theme}.png`) });
    await p.getByLabel('Desde', { exact: true }).fill('2026-11-01'); await p.waitForTimeout(550); await p.getByRole('table').waitFor(); assert.equal(audit.auditCalls.at(-1).from, '2026-11-01');
    await p.getByLabel('Hasta', { exact: true }).fill('2026-10-01'); const validCalls = audit.auditCalls.length;
    await p.waitForTimeout(550); assert.equal(audit.auditCalls.length, validCalls);
    await waitAudit(() => p.getByRole('button', { name: 'Limpiar filtros' }).click()); assert.ok(!audit.auditCalls.at(-1).productId && !audit.auditCalls.at(-1).from);
    const familyId = p.getByRole('spinbutton', { name: 'ID de familia', exact: true });
    await waitAudit(() => id.fill('22')); assert.equal(audit.auditCalls.at(-1).productId, '22'); assert.ok(!audit.auditCalls.at(-1).familyId);
    assert.deepEqual(await p.locator('td[data-label="Producto / familia"]').allTextContents(), ['Producto #22 · Familia #7', 'Producto #22 · Familia #22']);
    await waitAudit(() => familyId.fill('22')); assert.equal(audit.auditCalls.at(-1).familyId, '22'); assert.equal(audit.auditCalls.at(-1).productId, '22');
    assert.deepEqual(await p.locator('td[data-label="Producto / familia"]').allTextContents(), ['Producto #22 · Familia #22']);
    if ([390, 1280].includes(width)) await p.screenshot({ path: path.join(shots, `audit-filtered-${width}-${theme}.png`), fullPage: true });
    await waitAudit(() => id.fill('')); assert.ok(!audit.auditCalls.at(-1).productId);
    assert.deepEqual(await p.locator('td[data-label="Producto / familia"]').allTextContents(), ['Producto #33 · Familia #22', 'Producto #22 · Familia #22']);
    await waitAudit(() => p.getByRole('button', { name: 'Limpiar filtros' }).click());
    const clearGeometry = await p.locator('.audit-page-controls').evaluate(group => ({ buttonWidth: group.querySelector('button').getBoundingClientRect().width, groupWidth: group.getBoundingClientRect().width }));
    assert.ok(Math.abs(clearGeometry.buttonWidth - clearGeometry.groupWidth) < 2);
    if (width === 1280 && theme === 'light') {
      const validCount = audit.auditCalls.length;
      for (const invalidId of ['0', '022', '1.5', '2147483648']) {
        await id.fill(invalidId); await p.waitForTimeout(500); assert.equal(audit.auditCalls.length, validCount);
      }
      await id.fill(''); await p.waitForTimeout(500); assert.equal(audit.auditCalls.length, validCount);
      await id.fill('1'); await p.waitForRequest(request => new URL(request.url()).searchParams.get('productId') === '1');
      await id.fill('99'); await waitAudit(() => id.press('Enter')); await p.waitForTimeout(350);
      assert.equal(await p.getByText('Respuesta antigua sin vigencia').count(), 0);
      assert.equal(audit.auditCalls.at(-1).productId, '99');
    }
    if (width < 1024) {
      const detailButton = await p.getByRole('button', { name: /^Ver detalle:/ }).first().boundingBox();
      const card = await p.locator('.audit-event-summary').first().boundingBox();
      const panel = await p.locator('.audit-events-panel').boundingBox();
      assert.ok(detailButton.width > width - 100);
      assert.ok(detailButton.y + detailButton.height <= card.y + card.height && card.y + card.height <= panel.y + panel.height, 'Mobile event and its detail action are not clipped by desktop row height');
    }
    await noOverflow(p);
    if ([390, 1280].includes(width)) await p.screenshot({ path: path.join(shots, `audit-${width}-${theme}.png`), fullPage: true });
    await id.fill('999'); await p.getByText('No hay cambios registrados para estos filtros.', { exact: true }).waitFor();
    audit.failNextAudit(); await id.fill('99'); await p.getByRole('button', { name: 'Reintentar consulta' }).waitFor(); await p.getByRole('button', { name: 'Reintentar consulta' }).click(); await p.getByRole('table').waitFor();
    await audit.context.close();
    const inventory = await pageFor('inventory', width, theme);
    const ip = inventory.page;
    await ip.getByRole('heading', { name: 'Inventario', exact: true }).waitFor();
    if (width >= 1000) {
      const table = ip.locator('[data-responsive-table="desktop"] table');
      await table.getByRole('cell', { name: 'Producto #100', exact: true }).waitFor();
      const alignments = await table.evaluate(t => [4, 5, 7, 9].map(index => ({ header: getComputedStyle(t.tHead.rows[0].cells[index]).textAlign, cell: getComputedStyle(t.tBodies[0].rows[0].cells[index]).textAlign })));
      assert.deepEqual(alignments, Array.from({ length: 4 }, () => ({ header: 'center', cell: 'center' })));
      assert.equal(await table.locator('tbody tr').first().locator('td').last().locator('div').evaluate(e => getComputedStyle(e).justifyContent), 'center');
      assert.ok(await table.evaluate(t => [...t.tHead.rows[0].cells].every(cell => getComputedStyle(cell).textAlign === 'center')));
      assert.ok(await table.locator('.inventory-product-label, .inventory-product-label strong, .inventory-product-label small').evaluateAll(elements => elements.every(element => getComputedStyle(element).textAlign === 'left')));
      assert.ok(await table.locator('.inventory-product-label > span').evaluateAll(elements => elements.every(element => getComputedStyle(element).justifyContent === 'flex-start')));
      assert.equal(await table.locator('.inventory-variant-select .app-select-trigger').first().evaluate(element => getComputedStyle(element).textAlign), 'left');
    }
    await noOverflow(ip);
    if ([390, 1280].includes(width)) await ip.screenshot({ path: path.join(shots, `inventory-${width}-${theme}.png`), fullPage: true });
    await ip.getByRole('link', { name: 'Historial de inventario', exact: true }).click();
    await ip.getByRole('heading', { name: 'Historial de inventario', exact: true }).waitFor();
    if (width >= 1000) {
      const table = ip.locator('[data-responsive-table="desktop"] table');
      await table.getByRole('cell', { name: 'Entrada simulada', exact: true }).waitFor();
      assert.ok(await table.evaluate(t => getComputedStyle(t.tHead.rows[0].cells[3]).textAlign === 'center' && getComputedStyle(t.tBodies[0].rows[0].cells[3]).textAlign === 'center'));
      assert.ok(await table.evaluate(t => [1, 5].every(index => getComputedStyle(t.tHead.rows[0].cells[index]).textAlign === 'center' && getComputedStyle(t.tBodies[0].rows[0].cells[index]).textAlign === 'left')));
      assert.ok(await table.getByText('Medida: 3,7 × 1 1/2 pulgadas', { exact: true }).evaluate(element => getComputedStyle(element).textAlign === 'left'));
      assert.match(await table.locator('tbody tr').first().locator('td').nth(1).innerText(), /Identidad registrada en la operación/);
    }
    await noOverflow(ip);
    if ([390, 1280].includes(width)) await ip.screenshot({ path: path.join(shots, `movements-${width}-${theme}.png`), fullPage: true });
    await inventory.context.close();
    console.log(`PASS ${width}px ${theme}: explicit catalog filters, detail/cart return, header geometry, automatic audit/details/pagination/error`);
  }
  for (const guest of [false, true]) for (const empty of [false, true]) {
    const run = await pageFor('journey', 390, 'light', `${guest ? 'guest&' : ''}${empty ? 'empty-cart' : 'allow-clear'}`);
    await waitCatalog(run.page);
    await run.page.locator('[data-client-navbar]').getByRole('link', { name: /carrito/i }).click();
    if (empty) {
      await run.page.getByRole('link', { name: 'Explorar catálogo', exact: true }).waitFor();
      assert.equal(await run.page.locator('.cart-page-header').getByRole('link').count(), 0);
      assert.equal(await run.page.getByRole('button', { name: 'Limpiar carrito' }).count(), 0);
    } else {
      await run.page.locator('.cart-page-header').getByRole('link', { name: 'Volver al catálogo', exact: true }).waitFor();
      await run.page.getByRole('button', { name: 'Limpiar carrito' }).click();
      assert.equal(await run.page.evaluate(() => window.__testCartClears), 1);
    }
    await run.context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS no browser errors; screenshots:', shots);
} finally { await browser.close(); }

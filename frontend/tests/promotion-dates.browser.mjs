// All application traffic is intercepted. Save operations change only in-memory fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { validatePromotion, promotionPeriodError } from '../../backend/dist/modules/promotions/promotions.validation.js';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/final-visual-polish.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const shots = await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR || tmpdir(), 'fyf-promotion-dates-'));
console.log('Screenshots: ' + shots);
const NOW = Date.parse('2026-11-13T02:30:45Z');
const historical = { id: 1, name: 'Histórica de ensayo', type: 'PERCENTAGE_DISCOUNT', percentage: 10, isActive: true, status: 'EXPIRED', isIndefinite: false, startsAt: '2026-10-01T12:00:20.123Z', endsAt: '2026-10-01T12:00:40.456Z', productIds: [1], categoryIds: [], usageCount: 1 };
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let checks = 0;
const errors = [];
async function open(width, theme, zone = 'America/Santiago', skew = 0) {
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 667 : 844 }, timezoneId: zone, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(NOW + skew));
  const state = { now: NOW, saves: [], calls: 0 };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    assert.equal(url.origin, 'http://promotion-dates.test', 'No external service traffic');
    if (url.pathname.startsWith('/api/')) {
      const headers = { date: new Date(state.now).toUTCString() };
      if (method !== 'GET') {
        assert.ok(['/api/promotions', '/api/promotions/1'].includes(url.pathname)); assert.ok(['POST','PATCH'].includes(method));
        state.calls++; const body = route.request().postDataJSON();
        const validation = validatePromotion(body);
        const error = validation.success ? promotionPeriodError(validation.value, method === 'PATCH' ? new Date(historical.startsAt) : null, new Date(state.now)) : validation.error;
        if (error) return route.fulfill({ status: 400, headers, json: { status: 'error', message: error } });
        state.saves.push(body); return route.fulfill({ status: method === 'POST' ? 201 : 200, headers, json: { status: 'success', data: { id: 2, ...body } } });
      }
      let data;
      if (url.pathname === '/api/promotions') data = [historical];
      else if (url.pathname === '/api/promotions/targets') data = { products: [{ id: 1, name: 'Producto de ensayo', categoryId: 1, categoryName: 'Ensayo', status: true }], categories: [] };
      else throw new Error('Unexpected GET: ' + url.pathname);
      return route.fulfill({ headers, json: { data } });
    }
    const file = files.get(url.pathname);
    return route.fulfill(file ? { contentType: file.fileName.endsWith('.css') ? 'text/css' : file.fileName.endsWith('.png') ? 'image/png' : 'text/javascript', body: file.type === 'chunk' ? file.code : file.source } : { contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
  });
  await page.goto(`http://promotion-dates.test/promotions?theme=${theme}`); await page.getByRole('heading', { name: historical.name, exact: true }).waitFor();
  return { context, page, state };
}
async function local(page, time) { return page.evaluate(time => { const d = new Date(time); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0,16); }, time); }
async function newForm(page) {
  await page.getByRole('button', { name: 'Nueva promoción', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Promoción ficticia'); await page.getByLabel('Porcentaje', { exact: true }).fill('10');
  await page.getByRole('checkbox', { name: /Producto de ensayo/ }).check();
  return { start: page.getByLabel('Inicio', { exact: true }), end: page.getByLabel('Término', { exact: true }), save: page.getByRole('button', { name: 'Guardar promoción', exact: true }) };
}
async function close(page) { await page.getByRole('dialog').getByRole('button', { name: 'Cerrar diálogo', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
async function layout(page, width, name) {
  await page.getByLabel('Inicio', { exact: true }).locator('..').scrollIntoViewIfNeeded();
  const start = await page.getByLabel('Inicio', { exact: true }).boundingBox(), end = await page.getByLabel('Término', { exact: true }).boundingBox();
  assert.ok(Math.abs(start.width - end.width) < 1); assert.ok(Math.abs(start.height - end.height) < 1);
  if (width > 650) assert.ok(Math.abs(start.y - end.y) < 1, 'Start and end controls align');
  else assert.ok(end.y > start.y);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const dialog = page.getByRole('dialog'); assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  await dialog.screenshot({ path: path.join(shots, name + '.png') }); checks++;
}
try {
  for (const width of [320,375,390,768,1440]) for (const theme of ['light','dark']) {
    const { page, context, state } = await open(width, theme);
    let { start, end, save } = await newForm(page);
    assert.equal(await page.getByRole('alert').count(), 0, 'No error before interaction');
    await layout(page, width, `create-${width}-${theme}`);
    if (process.env.FYF_PROMO_LAYOUT_ONLY === '1') {
      await close(page); await page.getByRole('button', { name: `Editar ${historical.name}`, exact: true }).click(); await layout(page, width, `edit-${width}-${theme}`); await context.close(); continue;
    }
    await start.fill(await local(page, NOW - 60_000)); await save.click();
    await page.getByText('La fecha de inicio no puede ser anterior a la fecha y hora actuales', { exact: true }).first().waitFor(); assert.equal(state.calls, 0); checks++;
    assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Promoción ficticia');
    await start.fill(await local(page, NOW + 120_000)); await end.fill(await local(page, NOW + 60_000)); await save.click(); assert.equal(state.calls, 0); checks++;
    await end.fill(await start.inputValue()); await save.click(); await page.locator('#promotion-end-error').waitFor(); assert.equal(state.calls, 0); checks++;
    await end.fill(await local(page, NOW + 180_000)); await start.fill(await local(page, NOW + 240_000)); await page.locator('#promotion-end-error').waitFor(); assert.equal(await end.inputValue(), await local(page, NOW + 180_000)); checks++;
    await start.fill(await local(page, NOW + 120_000)); await save.click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(state.saves.length, 1); checks++;
    ({ start, end, save } = await newForm(page)); await save.click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(state.saves.at(-1).endsAt, null); checks++;
    await page.getByRole('button', { name: `Editar ${historical.name}`, exact: true }).click();
    await layout(page, width, `edit-${width}-${theme}`);
    await page.getByLabel('Nombre', { exact: true }).fill('Histórica renombrada'); await save.click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(state.saves.at(-1).startsAt, historical.startsAt); assert.equal(state.saves.at(-1).endsAt, historical.endsAt); checks++;
    await page.getByRole('button', { name: `Editar ${historical.name}`, exact: true }).click(); await start.fill(await local(page, NOW - 86400000)); const before = state.calls; await save.click(); assert.equal(state.calls, before); await close(page); checks++;
    ({ start, end, save } = await newForm(page)); const entered = await start.inputValue(); state.now += 300_000; await save.click();
    await page.locator('#promotion-start-error').waitFor(); assert.equal(await start.inputValue(), entered); assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Promoción ficticia'); checks++;
    await context.close();
  }
  for (const zone of ['America/Santiago','UTC']) for (const skew of [-3600000,3600000]) {
    const { page, context, state } = await open(375, 'light', zone, skew); const { start, save } = await newForm(page);
    assert.equal(await start.inputValue(), await local(page, NOW), 'HTTP Date corrects the browser clock without changing its local zone');
    await save.click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(state.saves.length, 1); checks++; await context.close();
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ checks, screenshots: shots, pageErrors: errors }, null, 2));
} finally { await browser.close(); }

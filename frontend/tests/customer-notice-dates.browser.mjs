// Build the actual editor; intercept every request. No real services or stored data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { validateCustomerNotice, customerNoticePeriodError } from '../../backend/dist/modules/customerNotice/customerNotice.validation.js';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/customer-notice-dates.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const shots = await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR || tmpdir(), 'fyf-notice-dates-'));
console.log('Screenshots: ' + shots);
const NOW = Date.parse('2026-11-13T02:30:45Z');
const historical = { id: 1, title: 'Aviso histórico ficticio', message: 'Contenido histórico ficticio', displaySeconds: 7, isActive: false, startsAt: '2026-10-01T12:00:20.123Z', endsAt: '2026-10-01T12:00:40.456Z' };
const immediate = { ...historical, id: 2, title: 'Histórico sin inicio', startsAt: null };
const automatic = { kind: 'LOCAL_FIXED', title: 'Despacho local de ensayo', message: 'Información automática de ensayo', revision: 1, imageUrl: null, savedImageUrl: null };
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let checks = 0; const pageErrors = [];
async function open(width, theme, zone = 'America/Santiago', skew = 0) {
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 667 : 844 }, timezoneId: zone, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date(NOW + skew));
  const state = { now: NOW, calls: 0, saves: [], notices: [structuredClone(historical), structuredClone(immediate)] };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    assert.equal(url.origin, 'http://notice-dates.test', 'No external traffic');
    if (url.pathname.startsWith('/api/')) {
      const headers = { date: new Date(state.now).toUTCString() };
      if (method === 'GET') {
        assert.equal(url.pathname, '/api/customer-notice/configuration');
        return route.fulfill({ headers, json: { data: { notices: state.notices, presentation: { title: 'Presentación ficticia', mainText: 'Ensayo', secondaryText: 'Ensayo' }, deliveryAnnouncement: automatic } } });
      }
      assert.ok(/^\/api\/customer-notice\/configuration(?:\/\d+)?$/.test(url.pathname));
      assert.ok(['POST', 'PUT'].includes(method)); state.calls++;
      const body = route.request().postDataJSON(), id = method === 'PUT' ? Number(url.pathname.split('/').at(-1)) : state.notices.length + 1;
      const original = state.notices.find(notice => notice.id === id);
      const parsed = validateCustomerNotice(body);
      const error = parsed.success ? customerNoticePeriodError(parsed.value, method === 'PUT' ? { startsAt: original.startsAt ? new Date(original.startsAt) : null, endsAt: original.endsAt ? new Date(original.endsAt) : null } : null, new Date(state.now)) : parsed.error;
      if (error) return route.fulfill({ status: 400, headers, json: { status: 'error', message: error } });
      state.saves.push(body); const notice = { id, ...body };
      state.notices = [...state.notices.filter(item => item.id !== id), notice];
      return route.fulfill({ status: method === 'POST' ? 201 : 200, headers, json: { data: notice } });
    }
    const file = files.get(url.pathname);
    return route.fulfill(file ? { contentType: file.fileName.endsWith('.css') ? 'text/css' : file.fileName.endsWith('.png') ? 'image/png' : 'text/javascript', body: file.type === 'chunk' ? file.code : file.source } : { contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
  });
  await page.goto(`http://notice-dates.test/?theme=${theme}`);
  await page.getByRole('button', { name: 'Administrar avisos a clientes', exact: true }).click();
  await page.getByText(historical.title, { exact: true }).waitFor();
  return { context, page, state };
}
const editor = page => page.locator('form.customer-notice-editor');
const fields = page => ({ start: page.getByLabel('Inicio de vigencia (opcional)', { exact: true }), end: page.getByLabel('Término de vigencia (opcional)', { exact: true }), indefinite: page.getByRole('checkbox', { name: 'Vigencia indefinida' }), active: page.getByRole('checkbox', { name: 'Aviso activo' }), save: page.getByRole('button', { name: 'Guardar cambios', exact: true }) });
async function local(page, time) { return page.evaluate(time => { const d = new Date(time); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0,16); }, time); }
async function create(page) {
  await page.getByRole('button', { name: 'Nuevo aviso', exact: true }).click();
  await editor(page).getByLabel('Título', { exact: true }).fill('Aviso de ensayo');
  await editor(page).getByLabel('Mensaje', { exact: true }).fill('Texto ficticio conservado');
  return fields(page);
}
async function saved(page, state, length) {
  await editor(page).waitFor({ state: 'hidden' }); assert.equal(state.saves.length, length); checks++;
}
async function layout(page, width, name) {
  const { start, end } = fields(page); await start.scrollIntoViewIfNeeded();
  const a = await start.boundingBox(), b = await end.boundingBox();
  assert.ok(Math.abs(a.width - b.width) < 1); assert.ok(Math.abs(a.height - b.height) < 1);
  if (width > 680) assert.ok(Math.abs(a.y - b.y) < 1, 'Date fields aligned');
  else assert.ok(b.y > a.y);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(await editor(page).evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  for (const label of ['Aviso activo','Vigencia indefinida']) assert.ok(await page.getByRole('checkbox', { name: label }).isVisible());
  await editor(page).screenshot({ path: path.join(shots, name + '.png') }); checks++;
  await start.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, name + '-modal.png') });
}
try {
  for (const width of [320,375,390,768,1440]) for (const theme of ['light','dark']) {
    const { context, page, state } = await open(width, theme);
    let { start, end, indefinite, active, save } = await create(page);
    assert.equal(await start.inputValue(), ''); assert.equal(await end.inputValue(), ''); assert.equal(await editor(page).getByRole('alert').count(), 0); assert.equal(await active.isChecked(), false);
    await layout(page, width, `create-${width}-${theme}`);
    await start.fill(await local(page, NOW - 60_000)); await save.click(); await page.locator('#notice-start-error').waitFor(); assert.equal(state.calls, 0); checks++;
    assert.equal(await editor(page).locator('textarea').inputValue(), 'Texto ficticio conservado');
    await start.fill(await local(page, NOW + 60_000)); await indefinite.uncheck();
    await end.fill(await start.inputValue()); await save.click(); await page.locator('#notice-end-error').waitFor(); assert.equal(state.calls, 0); checks++;
    await end.fill(await local(page, NOW)); await save.click(); assert.equal(state.calls, 0); checks++;
    await end.fill(await local(page, NOW + 120_000));
    const draftEnd = await end.inputValue(); await indefinite.check(); assert.equal(await end.inputValue(), draftEnd); assert.equal(await end.isDisabled(), true);
    await indefinite.uncheck(); assert.equal(await end.inputValue(), draftEnd); checks++;
    await start.fill(await local(page, NOW + 180_000)); await page.locator('#notice-end-error').waitFor(); assert.equal(await end.inputValue(), draftEnd); checks++;
    await start.fill(await local(page, NOW + 60_000)); await save.click(); await saved(page, state, 1); assert.equal(state.saves.at(-1).isActive, false);
    ({ start, end, indefinite, active, save } = await create(page));
    await indefinite.uncheck(); await end.fill(await local(page, NOW - 60_000)); await save.click(); await page.getByText('La fecha de término debe ser posterior a la fecha y hora actuales', { exact: true }).first().waitFor(); checks++;
    await indefinite.check(); await save.click(); await saved(page, state, 2); assert.equal(state.saves.at(-1).startsAt, null); assert.equal(state.saves.at(-1).endsAt, null);
    ({ start, save } = await create(page)); await start.fill(await local(page, NOW)); await save.click(); await saved(page, state, 3);
    ({ start, save } = await create(page)); await start.fill(await local(page, NOW + 120_000)); await editor(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    ({ start, save } = await create(page)); assert.equal(await start.inputValue(), ''); checks++;
    await editor(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: `Editar ${historical.title}`, exact: true }).click();
    ({ start, end, save } = fields(page)); await layout(page, width, `edit-${width}-${theme}`);
    await start.fill(await local(page, '2026-09-01T12:00:00Z')); await save.click(); await page.locator('#notice-start-error').waitFor(); assert.equal(state.saves.length, 3); checks++;
    await start.fill(await local(page, historical.startsAt)); await save.click(); await saved(page, state, 4);
    assert.equal(state.saves.at(-1).startsAt, historical.startsAt); assert.equal(state.saves.at(-1).endsAt, historical.endsAt);
    await page.getByRole('button', { name: `Activar ${historical.title}`, exact: true }).click(); await page.getByRole('button', { name: `Desactivar ${historical.title}`, exact: true }).waitFor();
    assert.equal(state.saves.at(-1).startsAt, historical.startsAt); assert.equal(state.saves.at(-1).endsAt, historical.endsAt); checks++;
    await page.getByRole('button', { name: `Editar ${immediate.title}`, exact: true }).click(); await fields(page).save.click(); await saved(page, state, 6); assert.equal(state.saves.at(-1).endsAt, immediate.endsAt);
    await page.getByRole('button', { name: 'Editar imagen del aviso automático de despacho', exact: true }).click();
    assert.equal(await page.getByRole('form', { name: 'Editar aviso automático de despacho' }).getByRole('textbox').count(), 0);
    assert.ok(await page.getByText(automatic.title, { exact: true }).count()); await page.getByRole('button', { name: 'Cancelar imagen' }).click(); checks++;
    ({ start, save } = await create(page)); await start.fill(await local(page, NOW + 60_000)); state.now += 180_000;
    await save.click(); await page.locator('#notice-start-error').waitFor(); assert.equal(await editor(page).locator('textarea').inputValue(), 'Texto ficticio conservado'); assert.equal(state.saves.length, 6); checks++;
    await context.close();
  }
  for (const zone of ['America/Santiago','UTC']) for (const skew of [-3_600_000,3_600_000]) {
    const { context, page, state } = await open(375, 'light', zone, skew);
    const { start, save } = await create(page); await start.fill(await local(page, NOW)); await save.click(); await saved(page, state, 1);
    await context.close();
  }
  assert.deepEqual(pageErrors, []); console.log(JSON.stringify({ checks, screenshots: shots, pageErrors }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(shots, 'failure.png'), fullPage: true });
    console.log(await page.locator('form.customer-notice-editor').evaluateAll(forms => forms.map(form => ({ text: form.innerText, inputs: [...form.querySelectorAll('input, textarea')].map(input => ({ tag: input.tagName, value: input.value, labels: [...input.labels].map(label => label.textContent) })) }))));
  }
  throw error;
} finally { await browser.close(); }

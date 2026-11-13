// Compiled application with every request intercepted: no database or external services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/final-visual-polish.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const shots = await mkdtemp(path.join(process.env.FYF_UI_SCREENSHOT_DIR || tmpdir(), 'fyf-promotion-delete-'));
const base = { type: 'PERCENTAGE_DISCOUNT', percentage: 10, isActive: false, status: 'INACTIVE', startsAt: '2026-11-01T12:00:00Z', endsAt: null, productIds: [], categoryIds: [], usageCount: 0 };
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const pageErrors = [], nativeDialogs = [];
let scenarios = 0;

async function open(width, theme, role) {
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 667 : 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  const state = { rows: [{ ...base, id: 1, name: 'Promoción ficticia A' }, { ...base, id: 2, name: 'Promoción ficticia B' }, { ...base, id: 3, name: 'Promoción histórica', usageCount: 1 }], deletes: [], response: 200, release: null };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    assert.equal(url.origin, 'http://promotion-delete.test', 'External requests are forbidden');
    if (url.pathname.startsWith('/api/')) {
      if (method === 'DELETE') {
        assert.match(url.pathname, /^\/api\/promotions\/[12]$/);
        state.deletes.push(url.pathname);
        await new Promise(resolve => { state.release = resolve; state.onDelete?.(); });
        if (state.response !== 200) return route.fulfill({ status: state.response, json: { status: 'error', message: state.response === 409 ? 'La promocion ya fue utilizada y debe conservarse como trazabilidad. Puede desactivarla.' : 'No se pudo eliminar la promocion' } });
        state.rows = state.rows.filter(row => row.id !== Number(url.pathname.split('/').at(-1)));
        return route.fulfill({ json: { status: 'success', data: { deleted: true } } });
      }
      assert.equal(method, 'GET', 'No creation, edits or status changes');
      assert.ok(['/api/promotions', '/api/promotions/targets'].includes(url.pathname));
      return route.fulfill({ json: { data: url.pathname.endsWith('/targets') ? { products: [], categories: [] } : state.rows } });
    }
    const file = files.get(url.pathname);
    return route.fulfill(file ? { contentType: file.fileName.endsWith('.css') ? 'text/css' : 'text/javascript', body: file.type === 'chunk' ? file.code : file.source } : { contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
  });
  await page.goto(`http://promotion-delete.test/promotions?theme=${theme}&role=${role}`);
  await page.getByRole('heading', { name: 'Promoción ficticia A', exact: true }).waitFor();
  return { context, page, state };
}

try {
  for (const role of ['ADMIN', 'MANAGER']) for (const width of [320, 375, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
    const { context, page, state } = await open(width, theme, role);
    const trigger = page.getByRole('button', { name: 'Eliminar Promoción ficticia A', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Eliminar promoción', exact: true });
    const cancel = dialog.getByRole('button', { name: 'Cancelar', exact: true });
    const confirm = dialog.getByRole('button', { name: 'Eliminar', exact: true });
    assert.equal(await page.getByRole('button', { name: 'Eliminar Promoción histórica', exact: true }).isDisabled(), true);
    await page.getByText('Esta promoción ya fue utilizada y debe conservarse como trazabilidad. Puede desactivarla.', { exact: true }).waitFor();
    for (const action of ['cancel', 'x', 'escape', 'backdrop']) {
      await trigger.click(); await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('Promoción ficticia A'));
      assert.equal(await cancel.evaluate(el => el === document.activeElement), true, 'Safe initial focus');
      if (action === 'cancel') await cancel.click();
      else if (action === 'x') await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
      else if (action === 'escape') await page.keyboard.press('Escape');
      else await page.mouse.click(2, 2);
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(state.deletes.length, 0, 'Closing never deletes');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Eliminar Promoción ficticia A');
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true, `Focus returns after ${action} (${role}, ${width}, ${theme})`);
    }
    await page.getByRole('button', { name: 'Eliminar Promoción ficticia B', exact: true }).click();
    assert.ok((await dialog.innerText()).includes('Promoción ficticia B')); await cancel.click();
    await trigger.click();
    await page.keyboard.press('Shift+Tab'); assert.equal(await dialog.getByRole('button', { name: 'Cerrar diálogo' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await confirm.evaluate(el => el === document.activeElement), true, 'Focus is trapped');
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
    for (const button of [cancel, confirm]) assert.ok((await button.boundingBox()).height >= 44);
    await dialog.screenshot({ path: path.join(shots, `${role}-${width}-${theme}.png`) });

    for (const status of [409, 500, 200]) {
      state.response = status; state.release = null;
      const before = state.deletes.length;
      const sent = new Promise(resolve => { state.onDelete = resolve; });
      // Two synchronous activations exercise the in-flight guard before React re-renders.
      await confirm.evaluate(button => { button.click(); button.click(); });
      await sent;
      await page.waitForFunction(() => document.querySelector('[aria-busy="true"]'));
      assert.equal(state.deletes.length, before + 1);
      assert.equal(await dialog.getByRole('button', { name: 'Eliminando...' }).isDisabled(), true);
      assert.equal(await cancel.isDisabled(), true);
      await page.keyboard.press('Escape'); await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
      assert.equal(await dialog.isVisible(), true, 'Cannot close before response');
      state.release();
      if (status === 200) {
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('heading', { name: 'Promoción ficticia A', exact: true }).waitFor({ state: 'hidden' });
        await page.getByText('Promoción eliminada', { exact: true }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Promoción ficticia B', exact: true }).count(), 1);
      } else {
        await dialog.getByRole('alert').waitFor();
        assert.match(await dialog.getByRole('alert').innerText(), status === 409 ? /trazabilidad/ : /No se pudo/);
        assert.equal(await dialog.isVisible(), true);
        assert.equal(await page.getByText('Promoción eliminada', { exact: true }).count(), 0);
        assert.equal(await trigger.count(), 1);
        if (status === 409) await dialog.screenshot({ path: path.join(shots, `error-${role}-${width}-${theme}.png`) });
      }
    }
    assert.equal(state.deletes.length, 3);
    scenarios++; await context.close();
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(nativeDialogs, []);
  console.log(JSON.stringify({ scenarios, roles: ['ADMIN', 'MANAGER'], widths: [320, 375, 390, 768, 1440], themes: ['light', 'dark'], pageErrors, nativeDialogs, screenshots: shots }, null, 2));
} finally { await browser.close(); }

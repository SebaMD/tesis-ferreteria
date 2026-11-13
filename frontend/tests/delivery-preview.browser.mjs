// Real UI with intercepted API; commercial messages use the actual backend generator.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { deliveryAnnouncement } from '../../backend/dist/modules/deliverySettings/deliveryPricing.js';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/delivery-preview.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = []; let scenarios = 0;
try {
  for (const width of [320, 1280]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    let policy = { id: 1, pricingMode: 'LOCAL_FIXED', deliveryEnabled: true, flatFee: 3000, freeShippingFrom: 500000 }, writes = 0, previews = 0;
    let publicNotice = { title: 'Aviso publicado anterior', message: 'Sin cambios publicados' };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        let data;
        if (url.pathname.endsWith('/delivery-settings/preview')) { previews++; data = deliveryAnnouncement(route.request().postDataJSON()); }
        else if (url.pathname.endsWith('/delivery-settings')) {
          if (route.request().method() === 'PUT') { writes++; policy = { ...policy, ...route.request().postDataJSON(), id: policy.id + 1 }; publicNotice = deliveryAnnouncement(policy); }
          data = policy;
        } else if (url.pathname.endsWith('/customer-notice')) data = { deliveryAnnouncement: publicNotice };
        else throw new Error('Unexpected API ' + url.pathname);
        return route.fulfill({ json: { data } });
      }
      const file = files.get(url.pathname);
      if (file) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: file.type === 'chunk' ? file.code : file.source });
      return route.fulfill({ contentType: 'text/html', body: `<html><head>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
    });
    await page.goto(`http://127.0.0.1:5184/?theme=${theme}`);
    const published = page.getByRole('article', { name: 'Aviso automático de despacho' });
    for (const proposed of [{ deliveryEnabled: false, flatFee: 3000, freeShippingFrom: 500000 }, { deliveryEnabled: true, flatFee: 4500, freeShippingFrom: null }, { deliveryEnabled: true, flatFee: 3000, freeShippingFrom: 25000 }, { deliveryEnabled: true, flatFee: 0, freeShippingFrom: 500000 }]) {
      const before = { ...publicNotice }, count = writes;
      await page.getByRole('button', { name: 'Configurar despacho local', exact: true }).click();
      const dialog = page.getByRole('dialog'); await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      const delivery = dialog.getByLabel('Despacho local habilitado');
      await delivery.check();
      await dialog.getByLabel('Tarifa fija CLP').fill(String(proposed.flatFee));
      const free = dialog.getByLabel('Habilitar despacho gratuito por monto');
      await free.setChecked(proposed.freeShippingFrom !== null);
      if (proposed.freeShippingFrom !== null) await dialog.getByLabel('Umbral CLP (debe superarse)').fill(String(proposed.freeShippingFrom));
      await delivery.setChecked(proposed.deliveryEnabled);
      await dialog.getByRole('button', { name: 'Revisar cambios', exact: true }).click();
      const preview = dialog.getByRole('region', { name: 'Vista previa del aviso al cliente' });
      // Named sections have implicit region semantics.
      const expected = deliveryAnnouncement({ ...policy, ...proposed });
      await preview.getByText(expected.title, { exact: true }).waitFor();
      assert.equal(await preview.getByText(expected.message, { exact: true }).count(), 1);
      assert.equal(await preview.locator('input, textarea').count(), 0);
      assert.equal(await published.getByText(before.title, { exact: true }).count(), 1, 'preview never publishes early');
      await dialog.getByRole('region', { name: 'Información de la revisión' }).getByText('Se conservan los importes de los pedidos existentes.', { exact: true }).waitFor();
      assert.equal(writes, count);
      if (process.env.FYF_UX_SCREENSHOT_DIR && proposed.flatFee === 4500) await page.screenshot({ path: `${process.env.FYF_UX_SCREENSHOT_DIR}/delivery-preview-${width}-${theme}.png`, fullPage: true });
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.deepEqual(publicNotice, before);
      // Re-open and propose the same changes: cancellation did not persist them.
      await page.getByRole('button', { name: 'Configurar despacho local', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
      await delivery.check();
      await dialog.getByLabel('Tarifa fija CLP').fill(String(proposed.flatFee));
      await free.setChecked(proposed.freeShippingFrom !== null);
      if (proposed.freeShippingFrom !== null) await dialog.getByLabel('Umbral CLP (debe superarse)').fill(String(proposed.freeShippingFrom));
      await delivery.setChecked(proposed.deliveryEnabled);
      await dialog.getByRole('button', { name: 'Revisar cambios', exact: true }).click();
      const text = await preview.locator('p').allTextContents();
      await dialog.getByRole('button', { name: 'Confirmar y guardar revisión', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await published.getByText(text[0], { exact: true }).waitFor();
      assert.equal(await published.getByText(text[1], { exact: true }).count(), 1);
      assert.equal(writes, count + 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      scenarios++;
    }
    assert.equal(previews, 8); await context.close();
  }
  assert.deepEqual(errors, []); console.log(`PASS ${scenarios} preview/cancel/save scenarios; title/message exactly match actual generator and published UI. APIs simulated.`);
} finally { await browser.close(); }

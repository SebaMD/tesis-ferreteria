// Real React UI, all API traffic intercepted. No production user changes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const bundle = await build({ root: fileURLToPath(new URL('..', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, build: { write: false, rollupOptions: { input: fileURLToPath(new URL('./fixtures/academic-ux-stage2.jsx', import.meta.url)) } } });
const files = new Map(bundle.output.map(file => ['/' + file.fileName, file]));
const entry = bundle.output.find(file => file.type === 'chunk' && file.isEntry).fileName;
const css = bundle.output.filter(file => file.fileName.endsWith('.css')).map(file => `<link rel="stylesheet" href="/${file.fileName}">`).join('');
const browser = await chromium.launch({ executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = []; let scenarios = 0;
try {
  for (const width of [320, 390, 1280, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE', 'CLIENT'].map((name, i) => ({ id: i + 1, name }));
    const users = roles.map(role => ({ id: role.id, roleId: role.id, roleName: role.name, names: role.name, surnames: 'Prueba', correo: `${role.name}@example.test`, rut: '11111111-1', status: 'ACTIVE', createdAt: '2026-11-06T12:00:00Z' }));
    const writes = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        let data;
        if (url.pathname.endsWith('/users/roles')) data = roles;
        else if (url.pathname.endsWith('/users')) data = users;
        else if (/\/users\/\d+\/work-schedule$/.test(url.pathname)) {
          const id = Number(url.pathname.split('/').at(-2));
          const payload = route.request().postDataJSON(); writes.push({ id, payload });
          const user = users.find(user => user.id === id); Object.assign(user, payload); data = user;
        } else throw new Error(`Unexpected API ${url.pathname}`);
        return route.fulfill({ json: { data } });
      }
      const file = files.get(url.pathname);
      if (file) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: file.type === 'chunk' ? file.code : file.source });
      if (url.pathname === '/ux-test') return route.fulfill({ contentType: 'text/html', body: `<html lang="es"><head>${css}</head><body><div id="root"></div><script type="module" src="/${entry}"></script></body></html>` });
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:5184/ux-test?case=users&theme=${theme}`);
    await page.locator(`[data-responsive-table="${width < 1000 ? 'mobile' : 'desktop'}"]`).getByText('WAREHOUSE Prueba', { exact: true }).waitFor();
    if (width >= 1000) assert.equal(await page.getByRole('button', { name: 'Configurar horario', exact: true }).count(), 2);
    for (const role of ['CASHIER', 'WAREHOUSE']) {
      const row = width < 1000 ? page.locator('article').filter({ hasText: `${role} Prueba` }) : page.getByRole('row').filter({ hasText: `${role} Prueba` });
      if (width < 1000) await row.getByRole('button', { name: /Mostrar detalles/ }).click();
      await row.getByRole('button', { name: 'Configurar horario', exact: true }).click();
      const modal = page.getByRole('dialog');
      await modal.getByText('Horario informativo para Cajeros y Bodegueros. No restringe el acceso ni interrumpe sus tareas.', { exact: true }).waitFor();
      const observation = modal.getByRole('textbox', { name: 'Observación' });
      assert.equal(await observation.evaluate(e => getComputedStyle(e).borderTopWidth), '1px');
      await observation.focus();
      assert.notEqual(await observation.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
      if (role === 'WAREHOUSE' && process.env.FYF_UX_SCREENSHOT_DIR && [320, 1280].includes(width)) await page.screenshot({ path: `${process.env.FYF_UX_SCREENSHOT_DIR}/worker-schedule-${width}-${theme}.png`, fullPage: true });
      await modal.getByRole('button', { name: /Guardar horario/ }).click();
      await modal.waitFor({ state: 'detached' });
      await row.getByRole('button', { name: 'Modificar horario', exact: true }).waitFor();
      assert.equal(writes.at(-1).id, role === 'CASHIER' ? 3 : 4);
      assert.equal(writes.at(-1).payload.shiftStartTime, '08:00');
      assert.equal(writes.at(-1).payload.shiftEndTime, '13:30');
      await row.getByRole('button', { name: 'Modificar horario', exact: true }).click();
      await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
    }
    assert.equal(writes.length, 2, 'closing the form does not save');
    if (width >= 1000) {
      const widths = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => { const group = row.querySelector('.table-row-actions'); if (!group) return null; const b = [...group.querySelectorAll('button')]; return { count: b.length, group: group.getBoundingClientRect().width, edit: b[0].getBoundingClientRect().width }; }).filter(Boolean));
      for (const row of widths.filter(row => row.count === 1)) assert.ok(Math.abs(row.edit - row.group) < 1, 'single edit fills action column');
      assert.equal(widths.filter(row => row.count === 2).length, 2);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    scenarios++; await context.close();
  }
  assert.deepEqual(errors, []); console.log(`PASS ${scenarios} Chromium scenarios: CASHIER/WAREHOUSE create/reopen/cancel schedules, both themes, mobile/desktop; APIs simulated.`);
} finally { await browser.close(); }

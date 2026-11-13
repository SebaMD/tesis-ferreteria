// Native local Chromium gallery checks, not DB/catalog persistence tests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FYF_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.FYF_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});
const captures = await mkdtemp(path.join(tmpdir(), 'fyf-realistic-gallery-'));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => route.abort());
  await page.goto(new URL('../../docs/seed-catalog-review/realistic-package/index.html', import.meta.url).href);
  assert.equal(await page.locator('main article').count(), 96);
  assert.equal(await page.locator('img').count(), 192);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  assert.ok(await page.locator('figure:nth-child(2) img').evaluateAll(images => images.every(image =>
    image.naturalWidth <= 960 && image.naturalHeight <= 960 && image.naturalWidth > 0 && image.alt.includes('referencial'))));
  assert.ok(await page.locator('figure:first-child img').evaluateAll(images => images.every(image => image.naturalWidth === 900)));
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 360, 375, 400, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${colorScheme}/${width} overflow`);
      if ([320, 1280].includes(width)) await page.screenshot({ path: path.join(captures, `comparison-${colorScheme}-${width}.png`) });
    }
  }
  const search = page.getByRole('searchbox', { name: 'Buscar nombre, código o variante' });
  await search.fill('EPLRD0611');
  assert.equal(await page.locator('main article:visible').count(), 1);
  await search.fill('no-existing-sku');
  assert.equal(await page.locator('main article:visible').count(), 0);
  await search.fill('');
  await search.focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('details').first().getAttribute('open'), '');
  assert.deepEqual(errors, []);

  // Contact sheets are QA views of individually generated assets, never sources
  // for splitting/reassigning pictures to SKU. The comparative HTML is unchanged.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addStyleTag({ content: 'header,details,article>p,figure:first-child,figcaption{display:none!important}main{grid-template-columns:repeat(4,1fr);gap:8px;max-width:none}article{padding:8px}article h2{font-size:12px;min-height:32px}article .comparison{display:block}' });
  for (let start = 0; start < 96; start += 16) {
    await page.locator('main article').evaluateAll((articles, offset) => articles.forEach((article, i) => { article.hidden = i < offset || i >= offset + 16; }), start);
    await page.screenshot({ path: path.join(captures, `objects-${start + 1}-${start + 16}.png`), fullPage: true });
  }
  console.log('PASS native Chromium: 96 comparative pairs/192 decoded images; light/dark; 320/360/375/400/1280; search, empty results and keyboard details. No DB or application API used.');
  console.log('Screenshots:', captures);
} finally {
  await browser.close();
}

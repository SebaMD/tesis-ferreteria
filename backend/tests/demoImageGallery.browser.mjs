// Local gallery only; no application backend, PostgreSQL or external resources.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FYF_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.FYF_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const captures=await mkdtemp(path.join(tmpdir(),'fyf-image-gallery-'));
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,route=>route.abort());
  await page.goto(new URL('../../docs/seed-catalog-review/reference-package/index.html',import.meta.url).href);
  assert.equal(await page.locator('main article').count(),96);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode();})));
  assert.ok(await page.locator('img').evaluateAll(images=>images.every(image=>image.naturalWidth===900&&image.naturalHeight===900&&image.alt.includes('no fotografía'))));
  for(const width of [320,360,375,400,1280]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'gallery overflow at '+width);
    if([320,1280].includes(width))await page.screenshot({path:path.join(captures,`gallery-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS Chromium: 96 local PNGs decode, correct intrinsic dimensions/alt, no horizontal overflow at 320/360/375/400/1280. This is a gallery, NOT DB/catalog persistence.');
  console.log('Screenshots:',captures);
  console.log('Gallery:',fileURLToPath(new URL('../../docs/seed-catalog-review/reference-package/index.html',import.meta.url)));
} finally {await browser.close();}

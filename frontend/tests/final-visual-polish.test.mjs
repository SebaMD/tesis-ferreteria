import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const source = await read('src/components/Pagination.jsx');
// Exercise the component's pure algorithms without requiring a JSX runtime.
const algorithms = new Function(source.slice(source.indexOf('function getVisiblePages'), source.indexOf('function PageItems')) + '\nreturn {getVisiblePages,getCompactVisiblePages};')();
test('mobile pagination includes endpoints and neighbors without duplicates or single-page ellipses', () => {
  for (const total of [0, 1, 2, 3, 5, 6, 12, 18, 1000]) for (let page = 1; page <= Math.max(total, 1); page++) {
    const items = algorithms.getCompactVisiblePages(page, total);
    const numbers = items.filter(value => typeof value === 'number');
    assert.equal(new Set(numbers).size, numbers.length);
    if (!total) { assert.deepEqual(items, []); continue; }
    for (const value of [1, total, page - 1, page, page + 1].filter(value => value > 0 && value <= total)) assert.ok(numbers.includes(value));
    for (let i = 1; i < numbers.length; i++) assert.notEqual(numbers[i] - numbers[i - 1], 2);
    if (total <= 6) assert.deepEqual(numbers, Array.from({ length: total }, (_, i) => i + 1));
  }
  assert.deepEqual(algorithms.getCompactVisiblePages(1, 18), [1, 2, 'ellipsis-2', 18]);
  assert.deepEqual(algorithms.getCompactVisiblePages(5, 18), [1, 'ellipsis-1', 4, 5, 6, 'ellipsis-6', 18]);
});
test('desktop pagination algorithm is identical to the initial committed version', () => {
  const original = execFileSync('git', ['show', 'HEAD:frontend/src/components/Pagination.jsx'], { encoding: 'utf8' });
  const desktop = value => value.slice(value.indexOf('function getVisiblePages'), value.indexOf('function getCompactVisiblePages')).replace(/\r\n/g, '\n');
  assert.equal(desktop(source), desktop(original));
});
test('authentication centering is opt-in and leaves other verification panel instances unchanged', async () => {
  const panel = await read('src/components/EmailVerificationPanel.jsx');
  assert.match(panel, /centerHeadingOnMobile = false/);
  for (const file of ['ClientEmailVerificationPage', 'InternalEmailVerificationPage']) assert.match(await read(`src/pages/${file}.jsx`), /centerHeadingOnMobile/);
  for (const file of ['CheckoutPage', 'ClientAccountPage', 'DeliveryQuotesPage']) assert.doesNotMatch(await read(`src/pages/${file}.jsx`), /centerHeadingOnMobile/);
});
test('decorative text is removed and existing actions keep their accessible names and handlers', async () => {
  assert.doesNotMatch(await read('src/pages/LoginPage.jsx'), /ACCESO SEGURO/);
  assert.match(await read('src/pages/LoginPage.jsx'), />V1\.0<\/span>/);
  assert.match(await read('index.html'), /<title>Ferreteria FYF<\/title>/);
  const sales = await read('src/pages/SalesPage.jsx');
  assert.match(sales, /sale-review-action[\s\S]*?aria-label="Revisar solicitud de devolución"[\s\S]*?openReviewModal\(sale\)/);
  assert.match(sales, /sale-return-action[^`]*`\}[\s\S]*?openDirectReturnModal\(sale\)/);
});

test('compact pagination adapts to measured space without hiding a single page behind ellipses', () => {
  const layout = { availableWidth: 180, digitWidth: 8, ellipsisWidth: 12, gap: 4 };
  for (const total of [2, 3, 5, 6, 12, 18]) for (let page = 1; page <= total; page++) {
    const items = algorithms.getCompactVisiblePages(page, total, layout);
    const numbers = items.filter(value => typeof value === 'number');
    for (const n of [1, page, total]) assert.ok(numbers.includes(n));
    assert.equal(numbers.length, new Set(numbers).size);
    for (let i = 1; i < numbers.length; i++) assert.notEqual(numbers[i] - numbers[i - 1], 2);
    const cost = items.reduce((sum, n) => sum + (typeof n === 'number' ? Math.max(32, String(n).length * 8 + 14) : 12), (items.length - 1) * 4);
    assert.ok(cost <= layout.availableWidth);
  }
  assert.ok(algorithms.getCompactVisiblePages(5, 18, layout).length < algorithms.getCompactVisiblePages(5, 18).length);
});

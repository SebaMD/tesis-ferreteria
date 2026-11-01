import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../src/' + path, import.meta.url), 'utf8');

test('audit detail expands full width only on mobile without changing its toggle', async () => {
  const css = await read('styles/styles.css');
  assert.match(css, /\.audit-detail-action \{ width: 96px;/);
  assert.match(css, /@media\(max-width:620px\) \{\s*\.audit-event-summary[^}]*\}\s*\.audit-detail-action \{ width: 100%; justify-self: stretch; \}/);
  const audit = await read('components/ProductAuditHistory.jsx');
  assert.match(audit, /aria-expanded=\{expanded.has\(event.id\)\}/);
  assert.match(audit, /hidden=\{!expanded.has\(event.id\)\}/);
});

test('notice editors share an inline surface, image field, cancel and orange save actions', async () => {
  const presentation = await read('components/CustomerNoticeManager.jsx');
  const automatic = await read('components/DeliveryNoticeImage.jsx');
  for (const source of [presentation, automatic]) {
    assert.match(source, /import NoticeInlineEditor/);
    assert.match(source, /<NoticeInlineEditor ref=\{editorRef\}/);
    assert.match(source, /className="product-positive-action" type="submit"|type="submit" className="product-positive-action"/);
  }
  assert.match(automatic, /editing&&<div className="mt-3">/);
  assert.doesNotMatch(automatic, /AppModal|<textarea|type="text"|type="number"/);
  assert.match(automatic, /announcement.revision/);
  assert.match(automatic, /disabled=\{busy\|\|\(!file&&!remove\)\}/);
  assert.match(automatic, /if\(!busy&&\(file\|\|remove\)\)save\(\)/);
  assert.match(automatic, /<NoticeImageField/);
});

test('inline Escape cancels only its draft and restores the existing edit trigger', async () => {
  const frame = await read('components/NoticeInlineEditor.jsx');
  assert.match(frame, /event.key !== "Escape"/);
  assert.match(frame, /event.stopPropagation\(\)/);
  assert.match(frame, /if \(!busy\) onCancel\(\)/);
  assert.match(frame, /trigger\?\.isConnected/);
  assert.match(frame, /trigger.focus\(\{ preventScroll: true \}\)/);
  assert.match(frame, /customer-notice-editor grid min-w-0/);
});

test('category footer uses equal-width actions and primary orange styling in both themes', async () => {
  const products = await read('pages/ProductsPage.jsx');
  const footer = products.slice(products.indexOf('<div className={formActionsClass}>', products.indexOf('Categorías existentes')), products.indexOf('title="Eliminar categoría"'));
  assert.match(footer, /className="product-positive-action" type="submit" disabled=\{submittingCategory\}/);
  assert.match(footer, /Guardar categoría/);
  assert.match(footer, /closeCategoryForm/);
  const css = await read('styles/styles.css');
  assert.match(css, /\.admin-form-actions, \.variant-editor-actions \{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.product-positive-action,\s*:is\(\.admin-form-actions, \.variant-editor-actions\) button\[type="submit"\]:not\(\[class\*="critical"\]\):not\(\[class\*="red-"\]\) \{ background: var\(--color-rust-500\)/);
  assert.match(css, /\.product-positive-action:disabled \{ opacity: \.5; cursor: not-allowed;/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createId } from '../src/helpers/createId.js';

test('UUID v4 fallback uses secure random values without randomUUID, including HTTP/mobile API shape', () => {
  const provider = { getRandomValues: values => webcrypto.getRandomValues(values) };
  const ids = new Set(Array.from({ length: 10000 }, () => createId(provider)));
  assert.equal(ids.size, 10000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('native generator retains its receiver; missing secure randomness fails closed', () => {
  const provider = { randomUUID() { assert.equal(this, provider); return 'native-uuid'; } };
  assert.equal(createId(provider), 'native-uuid');
  assert.throws(() => createId({}), /generación segura/);
  assert.throws(() => createId(null), /generación segura/);
});
test('version/variant bits are applied without replacing random entropy with timestamps or Math.random', () => {
  assert.equal(createId({ getRandomValues: values => values.fill(0xff) }), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
test('new product/family drafts and option creation work when browser has no randomUUID', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: values => webcrypto.getRandomValues(values) } });
  try {
    const { newBundleRow, newBundleAttribute, reconcileAttributeOptions } = await import('../src/helpers/productBundleForm.js');
    const row = newBundleRow(2), attribute = newBundleAttribute();
    assert.ok(row.key); assert.deepEqual(row.selections, ['', '']);
    const populated = reconcileAttributeOptions(attribute, 'Negro\nAzul');
    assert.equal(new Set(populated.draftOptions.map(o => o.key)).size, 2);
    assert.equal(reconcileAttributeOptions(populated, 'Negro\nAzul').draftOptions[0].key, populated.draftOptions[0].key);
  } finally { Object.defineProperty(globalThis, 'crypto', original); }
});
test('all frontend consumers share the generator; render failures have an explicit fallback', async () => {
  async function scan(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root);
      if (entry.isDirectory()) await scan(url);
      else if (/\.jsx?$/.test(entry.name) && entry.name !== 'createId.js') {
        assert.doesNotMatch(await readFile(url, 'utf8'), /crypto(?:\?\.)?\.?(?:randomUUID)/, url.pathname);
      }
    }
  }
  await scan(new URL('../src/', import.meta.url));
  const helper = await readFile(new URL('../src/helpers/createId.js', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /Math.random|Date.now/);
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /<AppErrorBoundary><Root\s*\/>/);
});

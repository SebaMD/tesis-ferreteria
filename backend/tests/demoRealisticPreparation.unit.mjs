// File-only checks. No DB client, network, seed, migration or publication.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildPlan, validateGenerationRecords, visualCautions } from '../scripts/prepare-demo-realistic-review.mjs';
import { demoProducts } from '../dist/db/demo/catalog.js';
import { checkDemoImagePackage, demoImageIdentity, imageIsAuthorized } from '../dist/db/demo/imageManifest.js';

const root = fileURLToPath(new URL('../../docs/seed-catalog-review/', import.meta.url));
const packageRoot = path.join(root, 'realistic-package');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = await json(path.join(packageRoot, 'review.json'));
const entries = await json(path.join(packageRoot, 'extracted-images.json'));
const plan = await buildPlan();
const records = [];
for (const file of (await readdir(packageRoot)).filter(f => /^generation-(records|batch-\d+)\.json$/.test(f))) {
  records.push(...await json(path.join(packageRoot, file)));
}

test('96 SKU each have an individual physical-article generation and immutable identity', () => {
  assert.equal(plan.length, 96);
  assert.equal(records.length, 96);
  assert.equal(report.products.length, 96);
  assert.doesNotThrow(() => validateGenerationRecords(records, plan));
  assert.equal(new Set(records.map(r => r.generatedFile)).size, 96);
  assert.equal(new Set(report.products.map(r => r.sha256)).size, 96);
  assert.equal(new Set(report.products.map(r => r.originalSha256)).size, 96);
  for (const product of demoProducts) {
    const image = report.products.find(p => p.productKey === product.key);
    assert.ok(image, product.key);
    assert.equal(image.identitySha256, demoImageIdentity(product));
    assert.equal(image.sourceSpecification, product.specification);
    assert.equal(image.generationTool, 'BUILT_IN_IMAGE_GEN');
    assert.equal(image.assetKind, 'REALISTIC_REFERENCE_ILLUSTRATION');
    assert.ok(image.prompt.includes('Ilustración referencial'));
    assert.equal(image.generatedFile, records.find(r => r.productKey === product.key).generatedFile);
    assert.ok(image.bytes < 5 * 1024 * 1024);
    assert.ok(image.width <= 960 && image.height <= 960);
    assert.ok(!image.file.includes('\\'));
  }
});

test('all 96 WebP files pass the existing importer preflight without becoming authorized', async () => {
  assert.equal(entries.length, 96);
  const before = await readFile(path.join(packageRoot, 'extracted-images.json'));
  const checked = await checkDemoImagePackage(packageRoot);
  assert.equal(checked.ready, 0);
  assert.equal(checked.databaseChecked, false);
  assert.equal(checked.filesWritten, 0);
  assert.equal(checked.results.filter(r => r.result === 'AUTHORIZATION_PENDING').length, 96);
  for (const entry of entries) {
    assert.equal(entry.publish, false);
    assert.equal(entry.rightsStatus, 'PENDING_VISUAL_REVIEW');
    assert.equal(imageIsAuthorized(entry), false);
    const buffer = await readFile(path.join(packageRoot, entry.file));
    assert.equal(digest(buffer), entry.sha256);
    assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  }
  assert.deepEqual(await readFile(path.join(packageRoot, 'extracted-images.json')), before);
});

test('96 original cards and 13 pending supplier images retain their recorded hashes and rights', async () => {
  const cardRoot = path.join(root, 'reference-package');
  const cards = await json(path.join(cardRoot, 'extracted-images.json'));
  assert.equal(cards.length, 96);
  for (const card of cards) {
    assert.equal(digest(await readFile(path.join(cardRoot, card.file))), card.sha256);
  }
  const suppliers = await json(path.join(root, 'extracted-images.json'));
  assert.equal(suppliers.length, 13);
  for (const image of suppliers) {
    assert.equal(image.rightsStatus, 'PENDING_AUTHORIZATION');
    assert.equal(image.publish, false);
    assert.equal(digest(await readFile(path.join(root, image.file))), image.sha256);
  }
});

test('rejects unknown/duplicate keys, shared assets, unsafe filenames and missing provenance', () => {
  const first = records[0];
  assert.throws(() => validateGenerationRecords([first, first], plan), /duplicate/);
  assert.throws(() => validateGenerationRecords([{ ...first, productKey: 'unknown' }], plan), /Unknown/);
  assert.throws(() => validateGenerationRecords([first, { ...records[1], generatedFile: first.generatedFile }], plan), /shared/);
  assert.throws(() => validateGenerationRecords([{ ...first, generatedFile: '../escape.png' }], plan), /Invalid/);
  assert.throws(() => validateGenerationRecords([{ ...first, prompt: '' }], plan), /prompt/);
});

test('critical identity limitations remain explicit, no image is approved or published', () => {
  assert.deepEqual(report.summary, {
    sku: 96, preparedRealistic: 96, cardOnly: 0, manualReviewRequired: 96,
    authorizedSupplierPhotos: 0, published: 0, databaseAssociations: 0,
  });
  for (const p of plan.filter(p => p.name.startsWith('Soplete') || p.name.startsWith('Clavo') || p.supplierCode === '33')) {
    assert.ok(visualCautions(p).some(note => note.includes('PRIORITARIA')));
  }
  assert.ok(report.products.every(p => p.publish === false && p.requiredManualChecks.length >= 4));
});

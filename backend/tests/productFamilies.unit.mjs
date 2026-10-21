import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
// Imports do not connect; use a deliberately non-operational URL for pure validation.
process.env.DATABASE_URL = "postgresql://invalid@127.0.0.1:59999/unused";
const { variantKey, validateFamilyBody, validateDetachFamilyBody, validateFamilyStateBody } = await import("../dist/modules/productFamilies/productFamilies.service.js");
test("canonical combination is ordered by attribute, rejects foreign and duplicate options", () => {
  const attrs = [{ id: 1 }, { id: 2 }];
  const opts = [{ id: 10, attributeId: 1 }, { id: 11, attributeId: 1 }, { id: 20, attributeId: 2 }];
  assert.equal(variantKey(attrs, opts, [20, 10]), "10,20");
  for (const value of [[10], [10, 10], [10, 11], [10, 99], []]) assert.throws(() => variantKey(attrs, opts, value));
});
test("family attributes are configurable and normalized duplicates rejected", () => {
  const body = { name: "Malla", categoryId: 1, attributes: [{ name: "Grano", options: [{ label: "40" }, { label: "60" }] }] };
  assert.equal(validateFamilyBody(body).attributes[0].name, "Grano");
  assert.throws(() => validateFamilyBody({ ...body, attributes: [] }));
  assert.throws(() => validateFamilyBody({ ...body, attributes: [{ name: "Color", options: [{ label: " Blanco " }, { label: "blanco" }] }] }));
  assert.throws(() => validateFamilyBody({ ...body, price: 1 }));
});

test("detachment accepts only confirmed classification, bounded reason and concrete option IDs", () => {
  const body = { expectedFamilyId: 2, expectedOptionIds: [3, 5], reason: "  Agrupación administrativa  ", confirmed: true };
  assert.deepEqual(validateDetachFamilyBody(body), { ...body, reason: "Agrupación administrativa" });
  for (const input of [null, [], {}, { ...body, confirmed: false }, { ...body, reason: "corto" }, { ...body, reason: "x".repeat(501) },
    { ...body, expectedFamilyId: 0 }, { ...body, expectedOptionIds: [] }, { ...body, expectedOptionIds: [3, 3] },
    { ...body, expectedOptionIds: [3.5] }, { ...body, price: 999 }, { ...body, name: "Otro producto" }, { ...body, userId: 7 }]) {
    assert.throws(() => validateDetachFamilyBody(input));
  }
});

test("family state actions require explicit confirmation and a valid expected revision", () => {
  const valid = { confirmed: true, expectedUpdatedAt: "2026-10-20T15:00:00.000Z" };
  assert.deepEqual(validateFamilyStateBody(valid), valid);
  for (const body of [null, [], {}, { ...valid, confirmed: false }, { ...valid, expectedUpdatedAt: "invalid" },
    { ...valid, productIds: [] }, { ...valid, archivedAt: null }, { ...valid, userId: 1 }]) assert.throws(() => validateFamilyStateBody(body));
});

test("migration journal remains chronological so incremental runs cannot skip the archival migration", async () => {
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (let i = 1; i < journal.entries.length; i++) assert.ok(journal.entries[i].when > journal.entries[i - 1].when, journal.entries[i].tag);
  assert.equal(journal.entries[29].tag, "0029_family_archival");
  assert.equal(journal.entries[30].tag, "0030_delivery_tariffs");
});

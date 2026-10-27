import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
process.env.DATABASE_URL = "postgresql://invalid@127.0.0.1:59999/unused";
const { validateAttributeRename } = await import("../dist/modules/productFamilies/productAttributeRename.service.js");
const valid = () => ({ name: " Presentación   comercial ", reason: "  Corrección descriptiva del atributo  ", confirmed: true, expectedRevision: "a".repeat(64), operationKey: randomUUID() });
test("attribute rename normalizes descriptive text and preserves its explicit revision and key", () => {
  const body = valid(), parsed = validateAttributeRename(body);
  assert.equal(parsed.name, "Presentación comercial"); assert.equal(parsed.reason, body.reason.trim());
  assert.equal(parsed.expectedRevision, body.expectedRevision); assert.equal(parsed.operationKey, body.operationKey);
});
test("attribute rename rejects invalid text, missing consent/reason/version and additional commercial fields", () => {
  for (const body of [null, [], {}, ...["", " ", "a".repeat(61), "Color\0"].map(name => ({ ...valid(), name })),
    { ...valid(), reason: "corto" }, { ...valid(), reason: "x".repeat(501) }, { ...valid(), confirmed: false },
    { ...valid(), expectedRevision: "old" }, { ...valid(), operationKey: "short" }, { ...valid(), options: [] },
    { ...valid(), price: 99 }, { ...valid(), userId: 1 }]) assert.throws(() => validateAttributeRename(body));
});

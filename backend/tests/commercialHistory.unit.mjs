import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { historicalIdentityNote } = await import("../dist/modules/products/historicalIdentity.js");
test("historical identity provenance separates original, legacy reference, partial originals and unavailable data", () => {
  assert.match(historicalIdentityNote(null), /no registrada/);
  assert.equal(historicalIdentityNote({ origin: "ORIGINAL" }), "Identidad registrada al crear la operación");
  assert.match(historicalIdentityNote({ origin: "LEGACY_REFERENCE", capturedAt: "2026-10-27" }), /no acredita la identidad original/);
  assert.match(historicalIdentityNote({ origin: "LEGACY_PARTIAL", capturedAt: "2026-10-27" }), /Nombre y unidad originales/);
});
test("snapshot migration is additive and preserves identity guards rather than enabling historical renames", async () => {
  const migration = await readFile(new URL("../drizzle/0033_commercial_identity_snapshots.sql", import.meta.url), "utf8");
  assert.match(migration, /LEGACY_REFERENCE/); assert.match(migration, /LEGACY_PARTIAL/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE/); assert.match(migration, /BEFORE TRUNCATE/);
  assert.match(migration, /returned_quantity/);
  assert.doesNotMatch(migration, /DISABLE TRIGGER|DROP TRIGGER|CREATE OR REPLACE FUNCTION fyf_preserve_product_identity/);
});

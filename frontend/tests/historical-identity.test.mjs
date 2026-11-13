import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { identityProvenance } from "../src/helpers/historicalIdentity.js";
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
test("identity provenance never presents legacy references as original facts", () => {
  assert.equal(identityProvenance(undefined), null);
  assert.match(identityProvenance(null), /no registrada/);
  assert.match(identityProvenance({ origin: "ORIGINAL" }), /registrada en la operación/);
  assert.match(identityProvenance({ origin: "LEGACY_REFERENCE" }), /no acredita la identidad original/);
  assert.match(identityProvenance({ origin: "LEGACY_PARTIAL" }), /Nombre y unidad originales/);
});
test("history screens expose provenance and movement filters do not reclassify old records using current products", async () => {
  for (const file of ["pages/SalesPage.jsx", "pages/ProductsPage.jsx", "pages/DeliveryQuotesPage.jsx", "components/orders/OrderDetailModal.jsx", "components/orders/OrderSummaryCard.jsx", "components/orders/AdministrativeOrderCard.jsx"]) assert.match(await read(file), /HistoricalIdentityNote/);
  const inventory = await read("pages/ProductsPage.jsx");
  assert.match(inventory, /movement.historicalIdentity\?\.identity\?\.category/);
  assert.doesNotMatch(inventory, /productById.get\(String\(movement.productId\)\)/);
  const note = await read("components/HistoricalIdentityNote.jsx");
  assert.match(note, /break-words/); assert.match(note, /capturedAt/);
  assert.match(await read("components/orders/OrderSummaryCard.jsx"), /grid-cols-\[minmax\(0,1fr\)\]/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attributeRenameStorageKey, readPendingAttributeRename } from "../src/helpers/attributeRename.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("pending rename is scoped to administrator and family and never updates its original revision", () => {
  const pending = { id: 3, name: "Medida", body: { name: "Presentación", reason: "Corrección descriptiva", confirmed: true,
    expectedRevision: "a".repeat(64), operationKey: "12345678-1234-1234-1234-123456789012" } };
  const values = new Map([[attributeRenameStorageKey(1, 2), JSON.stringify(pending)]]);
  const storage = { getItem: key => values.get(key) };
  assert.deepEqual(readPendingAttributeRename(1, 2, storage), pending);
  assert.equal(readPendingAttributeRename(9, 2, storage), null);
  assert.equal(readPendingAttributeRename(1, 9, storage), null);
  assert.equal(readPendingAttributeRename(1, 2, { getItem: () => "{" }), null);
  assert.equal(readPendingAttributeRename(1, 2, { getItem: () => JSON.stringify({ ...pending, body: { ...pending.body, expectedRevision: "invalid" } }) }), null);
});
test("independent action blocks dirty drafts, suspends the editor and only reloads after a confirmed rename", async () => {
  const editor = await read("components/ProductBundleEditor.jsx");
  assert.match(editor, /action="Renombrar atributo"/);
  assert.match(editor, /if\(dirty\)\{toast.warning\("Guarda o descarta los cambios pendientes antes de renombrar/);
  assert.match(editor, /!reloadConfirm && !renameTarget/);
  assert.match(editor, /a.id && user.role === "ADMIN"/);
  const renamedHandler = editor.slice(editor.indexOf("onRenamed={"), editor.indexOf("<AppModal open={singleVariant}"));
  assert.match(renamedHandler, /await load\(familyId\)/);
  assert.match(renamedHandler, /data-rename-attribute/);
  assert.match(editor, /disabled=\{definitionLocked\}/);
});
test("rename dialog sends only descriptive data and preserves the exact operation through uncertain responses", async () => {
  const dialog = await read("components/ProductAttributeRenameDialog.jsx"), service = await read("services/productFamilies.service.js");
  assert.doesNotMatch(dialog, /saveProductBundleRequest|bundlePayload|rowChange/);
  assert.match(dialog, /expectedRevision: revision, operationKey: crypto.randomUUID\(\)/);
  assert.match(dialog, /renameFamilyAttributeRequest\(familyId, target.id, frozen.current\)/);
  assert.match(dialog, /getAttributeRenameOperationRequest\(familyId, target.id, frozen.current.operationKey\)/);
  assert.match(dialog, /Reintentar mismo renombrado/);
  assert.match(dialog, /if \(!busy && !uncertain\) onClose/);
  assert.match(dialog, /role="alert"/); assert.match(dialog, /aria-describedby=\{explanationId\}/);
  assert.match(service, /attributes\/\$\{attributeId\}\/rename/);
});

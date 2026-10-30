import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL("../src/"+p,import.meta.url),"utf8");
test("quick variant view and states toggle independently with shared desktop/mobile wiring",async()=>{
 const s=await read("pages/ProductsPage.jsx");
 assert.match(s,/setEnabled\(value => !value\)/);
 assert.doesNotMatch(s,/disabled=\{variantsOnly/);
 for(const state of ["variantsOnly", "showInactiveProducts","lowStockOnly","outOfStockOnly"]) assert.ok(s.includes(state));
 assert.match(s,/aria-pressed=\{enabled\}/);
});
test("editor sections simplify attributes and retain hidden row drafts with invalid recovery",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/Atributos \(\{draft.attributes.length\}\)/);assert.match(s,/Nombre del atributo \{i\+1\}/);
 assert.doesNotMatch(s,/<h4[^>]*>Atributo /);assert.match(s,/useState\(!familyId\)/);
 assert.match(s,/aria-expanded=\{variantsOpen\}/);assert.match(s,/hidden=\{!variantsOpen\}/);
 assert.match(s,/control.willValidate && !control.validity.valid/);
 assert.match(s,/section === "attributes"\) setAttributesOpen\(true\)/);
 assert.match(s,/if \(variantKey\) \{ setVariantsOpen\(true\); openRow\(variantKey\)/);
});
test("conflict recovery is explicit and confirms discarding draft, preserving version checks",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.doesNotMatch(s,/Consultar estado actualizado/);assert.match(s,/conflict && \(familyId \|\| conversionId\)/);
 assert.match(s,/Descartar borrador y recargar/);assert.match(s,/latest.revision!==draft.revision/);
 assert.match(s,/setConflict\(true\)/);assert.match(s,/statusTarget.updatedAt/);
});
test("specific images remain pending and accessible, and commercial groups stay separate",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/<ProductImagesManager compact disabled=\{locked\} pendingFiles=\{commonFiles\}/);assert.match(s,/<ProductImagesManager/);
 assert.match(s,/files:\[\.\.\.row.files,\.\.\.selected\]/);assert.match(s,/onRemovePending=/);
 assert.match(s,/variant-editor-actions/);assert.match(s,/product-positive-action/);
});
test("availability wording changes without changing concrete cart calculations",async()=>{
 const s=await read("components/ProductEstimatedAvailability.jsx");
 assert.match(s,/Disponible para agregar/);assert.doesNotMatch(s,/Disponible estimado para agregar/);
 assert.match(s,/getProductCartAvailability\(product, items\)/);
});

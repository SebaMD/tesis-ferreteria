import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {bundleRequiresConfirmation,bundleDraft,conversionDraft} from "../src/helpers/productBundleForm.js";
const read=p=>readFile(new URL("../src/"+p,import.meta.url),"utf8");
test("ordinary saves are direct while conversion and saved-photo removal require confirmation",()=>{
 assert.equal(bundleRequiresConfirmation(bundleDraft(null,{name:"Nuevo"})),false);
 assert.equal(bundleRequiresConfirmation({familyId:1}),false);
 assert.equal(bundleRequiresConfirmation({familyId:1,rows:[{originalImageIds:[2],images:[]}]}),true);
 assert.equal(bundleRequiresConfirmation(conversionDraft({product:{id:98,name:"Original",price:1000},revision:"v1"})),true);
});
test("direct save keeps validation, in-flight guard, operation key and recovery",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/guard.current \|\| !validateDraft\(\)/);assert.match(s,/if \(bundleRequiresConfirmation\(draft\)\) setConfirmSave\(true\);\s*else void save\(\)/);
 assert.match(s,/saveProductBundleRequest\(frozen.current\)/);assert.match(s,/sessionStorage.setItem/);
 assert.match(s,/setUncertain\(true\)/);
});
test("floating option hover is transient while check and keyboard remain distinct",async()=>{
 const s=await read("components/AppSelect.jsx"),css=await read("styles/styles.css");
 assert.match(s,/!transientOptionHighlight && isActive/);assert.match(s,/data-keyboard-active=/);
 assert.match(s,/setKeyboardNavigation\(keyboard\)/);assert.match(s,/setKeyboardNavigation\(false\); setActiveIndex/);
 assert.match(s,/isSelected && <Check/);assert.match(css,/inventory-variant-popup .*:hover/);
 assert.match(css,/inventory-variant-popup .*aria-selected="true".*background: var\(--color-slate-100\)/);
});
test("stock column stays textual but option alerts remain",async()=>{
 const s=await read("components/GroupedInventoryTable.jsx");
 assert.match(s,/alert = false/);assert.match(s,/alert && product.status/);
 assert.match(s,/<StockBadge product=\{option.product\} role=\{role\} alert/);
 assert.match(s,/text-critical-600/);assert.match(s,/text-rust-600/);
});
test("attributes preserve drafts, expose restrictions and open for invalid fields",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/\[attributesOpen, setAttributesOpen\] = useState\(!familyId\)/);assert.match(s,/aria-expanded=\{attributesOpen\}/);
 assert.match(s,/hidden=\{!attributesOpen\}/);assert.match(s,/disabled=\{locked \|\| \(definitionLocked && !familyId\)\}/);
 assert.match(s,/Una dimensión nueva se incorpora por separado, asignando una opción a todos los artículos/);
 assert.match(s,/Solo cambia el nombre descriptivo; conserva opciones e identificadores/);
 assert.match(s,/disabled=\{hasExisting\}/);
});
test("barcode uses existing keyboard scanner and never submits on Enter",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/useBarcodeScanner\(/);assert.match(s,/target.dataset.bundleBarcode/);
 assert.match(s,/ScanBarcode aria-hidden="true"/);assert.match(s,/Haz clic aquí y escanea, o escribe el código/);
 assert.match(s,/if\(e.key==="Enter"\)e.preventDefault\(\)/);
});
test("common photographs stay explicit and individual maintenance is integrated",async()=>{
 const s=await read("components/ProductBundleEditor.jsx");
 assert.match(s,/<details[^>]*><summary[^>]*>Fotografías comunes/);
 assert.match(s,/draft.rows.filter\(r=>r.useCommon\)/);assert.match(s,/sin reemplazar sus fotos/);
 assert.doesNotMatch(s,/Detalle individual|Imágenes y datos individuales|setPendingIndividual/);assert.match(s,/<ProductImagesManager/);
 assert.match(s,/Descripción individual/);assert.match(s,/Unidad de este artículo/);
 assert.match(s,/<h4[^>]*>.*Producto #.*badgeClass/);
});

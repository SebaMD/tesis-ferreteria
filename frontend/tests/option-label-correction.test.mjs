import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {optionLabelStorageKey,pendingOptionLabel} from '../src/helpers/optionLabelCorrection.js';
import {variantOptionState} from '../src/helpers/productVariants.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('pending label correction retains target, exact command and original revision scoped to actor/family',()=>{
 const saved={target:{attributeId:2,optionId:3,attributeName:'Medida',label:'400ml'},command:{label:'400 ml',reason:'Formato descriptivo',confirmed:true,expectedRevision:'a'.repeat(64),operationKey:'12345678-1234-1234-1234-123456789012'}};
 const storage={getItem:k=>k===optionLabelStorageKey(1,2)?JSON.stringify(saved):null};assert.deepEqual(pendingOptionLabel(1,2,storage),saved);assert.equal(pendingOptionLabel(2,2,storage),null);assert.equal(pendingOptionLabel(1,3,storage),null);
});
test('persisted labels open a separate audited operation and dirty commercial drafts remain intact',async()=>{
 const s=await read('components/ProductBundleEditor.jsx');assert.match(s,/a.draftOptions.find\(o=>o.key===row.selections\[i\]\)/);assert.match(s,/Corregir etiqueta compartida \$\{selected.label\}/);assert.match(s,/if\(dirty\)\{toast.warning\("Guarda o descarta explícitamente el borrador antes de corregir la etiqueta/);assert.match(s,/Boolean\(optionLabelTarget\)/);assert.match(s,/<OptionLabelCorrectionDialog/);assert.match(s,/data-option-label/);assert.doesNotMatch(s,/label="Etiqueta compartida"/);
});
test('dialog lists inactive affected SKUs and freezes only the label command for uncertain recovery',async()=>{
 const s=await read('components/OptionLabelCorrectionDialog.jsx');assert.match(s,/row.selections\[attributeIndex\]===option.key/);assert.match(s,/"Activa":"Inactiva"/);assert.match(s,/expectedRevision:draft.revision/);assert.match(s,/event\?\.stopPropagation\(\)/);assert.match(s,/api.post\(path,frozen.current\)/);assert.match(s,/Consultar resultado/);assert.match(s,/if\(!busy&&!uncertain\)onClose/);assert.match(s,/minLength=\{8\}/);assert.doesNotMatch(s,/bundlePayload|setBundleRowOption|saveProductBundle/);
});
test('a changed display label keeps the concrete combination selected by ID, including sparse families',()=>{
 const variants=[{id:1,status:true,availableStock:5,variantValues:[{attributeId:10,optionId:20,label:'Rjo'},{attributeId:11,optionId:30,label:'400ml'}]},{id:2,status:true,availableStock:5,variantValues:[{attributeId:10,optionId:21,label:'Azul'},{attributeId:11,optionId:31,label:'200ml'}]}];
 const before=variantOptionState(variants,variants[0],10,20);variants[0].variantValues[0].label='Rojo';assert.equal(variantOptionState(variants,variants[0],10,20).variant.id,before.variant.id);assert.equal(variantOptionState(variants,variants[0],10,999),null);
});

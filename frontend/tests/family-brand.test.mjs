import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {brandCorrectionKey,pendingBrandCorrection} from '../src/helpers/familyBrand.js';
test('brand recovery is scoped and preserves the frozen expected revision',()=>{
 const storage=new Map(),body={brand:'Toro Negro',reason:'Corrección descriptiva',expectedRevision:'a'.repeat(64),operationKey:'12345678-1234-1234-1234-123456789012',confirmed:true};
 const store={getItem:key=>storage.get(key)};storage.set(brandCorrectionKey(1,2),JSON.stringify(body));
 assert.deepEqual(pendingBrandCorrection(1,2,store),body);assert.equal(pendingBrandCorrection(2,2,store),null);assert.equal(pendingBrandCorrection(1,3,store),null);
 storage.set(brandCorrectionKey(1,2),'invalid');assert.equal(pendingBrandCorrection(1,2,store),null);
});
test('family brand field opens only an independent operation on a clean draft',async()=>{
 const s=await readFile(new URL('../src/components/ProductBundleEditor.jsx',import.meta.url),'utf8');
 assert.match(s,/action="Corregir marca"/);assert.match(s,/if\(dirty\)\{toast.warning\("Guarda o descarta explícitamente el borrador antes de corregir la marca/);
 assert.match(s,/familyId&&user.role==="ADMIN"/);assert.match(s,/suspended=\{nameCorrectionOpen \|\| categoryDialog \|\| brandDialog/);
 assert.match(s,/<FamilyBrandDialog/);assert.match(s,/setBrandDialog\(false\);await load\(familyId\)/);
});
test('brand dialog keeps confirmation, exact command, recovery and no commercial bundle writes',async()=>{
 const s=await readFile(new URL('../src/components/FamilyBrandDialog.jsx',import.meta.url),'utf8');
 assert.match(s,/event\?\.stopPropagation\(\)/);assert.match(s,/expectedRevision:draft.revision/);assert.match(s,/api.post\(path,frozen.current\)/);
 assert.match(s,/sessionStorage.setItem\(key,JSON.stringify\(body\)\)/);assert.match(s,/setUncertain\(true\)/);assert.match(s,/if\(!busy&&!uncertain\)onClose/);
 assert.match(s,/misma marca y fabricante/);assert.doesNotMatch(s,/bundlePayload|saveProductBundleRequest|\/bundle/);
});

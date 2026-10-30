import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {auditReadableRows} from '../src/helpers/auditPresentation.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('table family action uses actual family ID and unfiltered SKU states; simple status and editor remain individual',async()=>{
 const [table,page,editor]=await Promise.all(['components/GroupedInventoryTable.jsx','pages/ProductsPage.jsx','components/ProductBundleEditor.jsx'].map(read));
 assert.match(table,/onFamilyStatus\(group.representative.familyId\)/);assert.match(table,/allProducts.filter/);assert.match(table,/Desactivar familia/);assert.match(table,/Activación individual en Editar/);assert.doesNotMatch(table,/Activar familia/);
 assert.match(page,/allProducts=\{products\}/);assert.match(table,/onStatus\(product\)/);assert.match(editor,/deactivateProductRequest\(statusTarget.id,statusTarget.updatedAt\)/);
});
test('family confirmation preserves independent revision, cancel, reason, uncertain recovery and original inactive counts',async()=>{
 const dialog=await read('components/FamilyDeactivationDialog.jsx');for(const s of ['getProductBundleRequest(familyId)','expectedRevision: bundle.revision','crypto.randomUUID()','sessionStorage','Consultar resultado','Reintentar misma desactivación','previamente inactivas','No se archiva ni elimina','Cancelar'])assert.ok(dialog.includes(s),s);
 assert.doesNotMatch(dialog,/saveProductBundle|status: true|archivedAt:/);
});
test('family deactivation audit is a reversible availability change, never physical deletion or SKU addition',()=>{
 const rows=auditReadableRows({operation:'FAMILY_DEACTIVATE',changes:[{field:'Disponibilidad de variantes',before:[{id:1,name:'SKU',active:true},{id:2,name:'Inactiva',active:false}],after:[{id:1,name:'SKU',active:false},{id:2,name:'Inactiva',active:false}]}]});assert.equal(rows.length,1);assert.equal(rows[0].before,'Activo');assert.equal(rows[0].after,'Desactivado (no eliminado)');
});

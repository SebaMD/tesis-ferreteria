import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inventoryPickerProducts,groupInventoryProducts,filterInventoryProducts,inventoryExportRows,selectedInventoryProduct} from '../src/helpers/inventoryGroups.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('administrative family picker includes inactive siblings without changing filters, counts or exports',()=>{
 const products=[{id:105,familyId:24,name:'Activo',status:true,currentStock:3},{id:106,familyId:24,name:'Inactivo',status:false,currentStock:0},{id:107,familyId:25,name:'Otra familia',status:false}];
 const filtered=filterInventoryProducts(products,{canViewInactive:true});
 const [group]=groupInventoryProducts(filtered,products);
 for(const role of ['ADMIN','MANAGER']){
  const options=inventoryPickerProducts(group,products,role);
  assert.deepEqual(options.map(p=>p.id),[105,106]);
  assert.equal(selectedInventoryProduct({...group,products:options},106).status,false);
 }
 assert.deepEqual(inventoryPickerProducts(group,products,'CASHIER').map(p=>p.id),[105]);
 assert.deepEqual(inventoryExportRows(filtered,'ADMIN').map(p=>p.id),[105]);
 assert.equal(group.products.length,1);
 const inactive=groupInventoryProducts([products[1]],products)[0];
 assert.deepEqual(inventoryPickerProducts(inactive,products,'ADMIN').map(p=>p.id),[106]);
});
test('catalog presentation precedes the unique automatic card; only image is editable inline',async()=>{
 const manager=await read('components/CustomerNoticeManager.jsx'),image=await read('components/DeliveryNoticeImage.jsx');
 assert.ok(manager.indexOf('customer-notice-presentation')<manager.indexOf('<DeliveryNoticeImage'));
 assert.equal((manager.match(/<DeliveryNoticeImage/g)||[]).length,1);
 assert.match(image,/aria-label="Editar imagen del aviso automático de despacho"/);
 assert.match(image,/<NoticeInlineEditor ref=\{editorRef\}/);
 assert.doesNotMatch(image,/<AppModal/);
 assert.doesNotMatch(image,/<textarea|type="text"|type="number"/);
 assert.match(image,/content=live\|\|announcement/);
 assert.match(image,/content.kind==='LOCAL_FIXED'&&announcement.savedImageUrl/);
 assert.match(image,/function close\(\)\{if\(busy\)return;cancel\(\);setEditing\(false\)/);
});
test('pencil dialogs explicitly opt in to primary-field focus while retaining disabled and nested restoration guards',async()=>{
 for(const component of ['FamilyBrandDialog','FamilyCategoryDialog','OptionLabelCorrectionDialog','ProductAttributeRenameDialog','ProductClassificationAction'])assert.match(await read(`components/${component}.jsx`),/initialFocusSelector="fieldset input"/);
 const modal=await read('components/AppModal.jsx');
 assert.match(modal,/querySelector\(initialFocusSelector\)/);
 assert.match(modal,/!initial.matches\(':disabled'\)/);
 assert.match(modal,/top.contains\(previousActiveElement\)/);
 assert.match(modal,/event.key === "Escape"/);
 const control=await read('components/AuditedValueControl.jsx');
 assert.match(control,/<button[^>]*onClick=\{onClick\}/);
 assert.doesNotMatch(control,/<div[^>]*onClick/);
});
test('inventory history headings are compact and share responsive title/navigation layout',async()=>{
 for(const file of ['pages/ProductsPage.jsx','pages/ProductAuditHistoryPage.jsx'])assert.match(await read(file),/inventory-section-header/);
 assert.match(await read('pages/ProductsPage.jsx'),/Movimientos de unidades de inventario/);
 assert.match(await read('pages/ProductAuditHistoryPage.jsx'),/No incluye movimientos de stock/);
 assert.match(await read('styles/styles.css'),/\.inventory-section-header \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) auto/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productNameDraftIsDirty} from '../src/helpers/productNameCorrection.js';
import {classificationStorageKey,pendingProductClassification} from '../src/helpers/productClassification.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
test('simple historical brand/category use independent audited controls; new and no-history keep normal fields',async()=>{
 const page=await read('pages/ProductsPage.jsx'),ui=await read('components/ProductClassificationAction.jsx');
 assert.match(page,/editingProduct\?\.hasHistory&&!editingProduct.familyId/);assert.match(page,/ProductClassificationAction field="category"/);assert.match(page,/ProductClassificationAction field="brand"/);
 for(const s of ['AuditedValueControl','AppModal','if(dirty)','Motivo','previousValue:previous','expectedRevision:product.updatedAt','sessionStorage.setItem','frozen.current','Consultar resultado','Reintentar misma corrección','event?.stopPropagation()','busy||uncertain','setConfirmed(false)'])assert.ok(ui.includes(s),s);
 assert.match(ui,/user.role!=="ADMIN"/);assert.match(ui,/classification-corrections/);assert.doesNotMatch(ui,/unitMeasure:|stock:|price:/);
});
test('price, image or classification draft changes prevent independent corrections without discarding anything',()=>{
 const p={name:'SKU',brand:'Bosch',categoryId:1,price:10,minimumStock:0,status:true,inStoreOnly:false,unitMeasure:'unidad'};
 assert.equal(productNameDraftIsDirty(p,'unidad',p),false);
 for(const changed of [{price:11},{brand:'Otra'},{categoryId:2}])assert.equal(productNameDraftIsDirty({...p,...changed},'unidad',p),true);
 assert.equal(productNameDraftIsDirty(p,'unidad',p,[{name:'image.png'}]),true);
});
test('uncertain command recovery is scoped to admin/product/field and preserves the exact body',()=>{
 const key=classificationStorageKey(1,105,'brand'),command={field:'brand',value:'Bosch',previousValue:'Boschh',confirmed:true,reason:'Corrección descriptiva',expectedRevision:'2026-10-29T00:00:00.000Z',operationKey:'12345678-1234-1234-1234-123456789012'};
 const memory=new Map([[key,JSON.stringify(command)]]),storage={getItem:k=>memory.get(k)||null};
 assert.deepEqual(pendingProductClassification(key,'brand',storage),command);
 assert.equal(pendingProductClassification(key,'category',storage),null);
 assert.equal(pendingProductClassification(classificationStorageKey(2,105,'brand'),'brand',storage),null);
 for(const invalid of [{...command,operationKey:'x'},{...command,confirmed:false},{...command,expectedRevision:'bad'},{...command,reason:''}]){memory.set(key,JSON.stringify(invalid));assert.equal(pendingProductClassification(key,'brand',storage),null);}
});

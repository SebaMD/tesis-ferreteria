import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProductClassification} from '../dist/modules/products/productClassification.service.js';
import {auditDTO} from '../dist/modules/productAudits/productAudits.dto.js';
const b={field:'brand',value:' Bosch ',previousValue:'Boschh',reason:'Corrección descriptiva de registro',confirmed:true,expectedRevision:'2026-10-29T10:00:00.000Z',operationKey:'12345678-1234-1234-1234-123456789012'};
test('classification commands accept only one validated field and an explicit previous value',()=>{
 assert.equal(validateProductClassification(b).value,'Bosch');
 assert.equal(validateProductClassification({...b,field:'category',value:2,previousValue:1}).value,2);
 for(const v of [{field:'unit'},{value:''},{value:'a\nb'},{value:'x'.repeat(101)},{reason:'corto'},{confirmed:false},{previousValue:1},{expectedRevision:'old'},{stock:2},{field:'category',value:0},{field:'category',value:1,previousValue:null}])assert.throws(()=>validateProductClassification({...b,...v}));
});
test('administrative history projects classification corrections without exposing raw audit or keys',()=>{
 const d=auditDTO({id:1,created_at:'2026-10-29T10:00:00Z',product_id:105,family_id:null,user_id:1,actor_name:'Admin',reason:b.reason,operation:'PRODUCT_CLASSIFICATION_CORRECTION',previous:{product:{password:'NEVER'},category:{id:1,name:'Antes'}},next:{field:'category',category:{id:2,name:'Después'},operationKey:'NEVER'}});
 assert.equal(d.subject.productId,105);assert.equal(d.changes[0].before.name,'Antes');assert.equal(d.changes[0].after.name,'Después');assert.ok(!JSON.stringify(d).includes('NEVER'));
});

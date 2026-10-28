import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateFamilyCategory} from '../dist/modules/productFamilies/familyCategory.service.js';
test('family reclassification requires explicit consent, reason, revision and a strict category-only contract',()=>{
 const b={categoryId:2,reason:'Reclasificación justificada',expectedRevision:'a'.repeat(64),operationKey:'12345678-1234-1234-1234-123456789012',confirmed:true};
 assert.equal(validateFamilyCategory(b).categoryId,2);
 for(const change of [{categoryId:0},{categoryId:'2'},{confirmed:false},{reason:'corto'},{expectedRevision:'x'},{price:1},{brand:'Otro'}])assert.throws(()=>validateFamilyCategory({...b,...change}));
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateFamilyDeactivation} from '../dist/modules/productFamilies/familyDeactivation.service.js';
const valid={operationKey:'a'.repeat(24),expectedRevision:'b'.repeat(64),reason:'Desactivación administrativa',confirmed:true};
test('family deactivation accepts only an explicit independent revisioned command',()=>{
 assert.deepEqual(validateFamilyDeactivation(valid),valid);
 for(const patch of [{confirmed:false},{reason:'corto'},{expectedRevision:'old'},{operationKey:'x'},{price:1},{status:true},{productIds:[1]}])assert.throws(()=>validateFamilyDeactivation({...valid,...patch}));
});

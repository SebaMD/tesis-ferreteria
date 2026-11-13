import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {activationSourceProducts,validateFamilyActivation} from '../dist/modules/productFamilies/familyActivation.service.js';
import {auditDTO} from '../dist/modules/productAudits/productAudits.dto.js';
const revision='a'.repeat(64), prior='b'.repeat(64), key='test-operation-key-123456', reason='Motivo de prueba suficiente';
const members=[1,2,3].map(id=>({id,status:false}));
const source={familyId:1,reason,previous:{revision:prior,variants:[{id:1,status:true},{id:2,status:true},{id:3,status:false}]},next:{operation:'FAMILY_DEACTIVATE',familyId:1,operationKey:key,revision,productIds:[1,2],previouslyInactiveProductIds:[3],variants:members,requestHash:createHash('sha256').update(JSON.stringify({familyId:1,operationKey:key,expectedRevision:prior,reason,confirmed:true})).digest('hex')}};
test('activation source restores only original active IDs, never guesses from inactivity',()=>{
  assert.deepEqual(activationSourceProducts(source,1,members,revision),{productIds:[1,2],previouslyInactiveProductIds:[3]});
  for(const mutate of [s=>s.next.productIds.push(3),s=>s.next.previouslyInactiveProductIds=[],s=>s.previous.variants[2].status=true,s=>s.next.variants=[],s=>s.next.requestHash='old',s=>s.previous={},s=>s.next.revision='stale',s=>s.familyId=2,s=>s.next.variants[0].status=true]){const copy=structuredClone(source);mutate(copy);assert.throws(()=>activationSourceProducts(copy,1,members,revision));}
  assert.throws(()=>activationSourceProducts(source,1,[...members,{id:4,status:false}],revision));
  assert.throws(()=>activationSourceProducts(source,1,[{id:1,status:true},...members.slice(1)],revision));
});
test('activation command requires explicit confirmation, source ID, revision, reason and stable key',()=>{
 const valid={operationKey:key,expectedRevision:revision,reason,confirmed:true,sourceEventId:9};
 assert.deepEqual(validateFamilyActivation(valid),valid);
 for(const patch of [{sourceEventId:0},{sourceEventId:'9'},{sourceEventId:1.5},{confirmed:false},{expectedRevision:'x'},{productIds:[1,2]},{status:true},{reason:'no'}]) assert.throws(()=>validateFamilyActivation({...valid,...patch}));
});
test('activation audit exposes its source and availability without command secrets',()=>{
 const dto=auditDTO({id:10,family_id:1,product_id:null,user_id:1,actor_name:'Admin',created_at:'2026-11-05T12:00:00Z',operation:'FAMILY_ACTIVATE',reason,previous:{variants:members},next:{operation:'FAMILY_ACTIVATE',sourceEventId:9,familyName:'Prueba',requestHash:'SECRET',operationKey:'SECRET',variants:[{id:1,status:true},{id:2,status:true},{id:3,status:false}]}});
 assert.equal(dto.operation,'FAMILY_ACTIVATE');assert.equal(dto.changes[0].after,9);assert.ok(!JSON.stringify(dto).includes('SECRET'));
});

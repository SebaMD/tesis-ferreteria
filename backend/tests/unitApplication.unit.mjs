import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateUnitEligibilityQuery} from '../dist/modules/productFamilies/productUnitEligibility.service.js';
const input={unitMeasure:' metro   lineal ',expectedRevision:'a'.repeat(64)};
test('unit preview validates and normalizes its read-only query without accepting unrelated writes',()=>{
 assert.equal(validateUnitEligibilityQuery(input).unitMeasure,'metro lineal');
 for(const change of [{unitMeasure:''},{unitMeasure:['caja']},{unitMeasure:'x'.repeat(51)},{unitMeasure:'uni\ndad'},{expectedRevision:'old'},{price:1}])assert.throws(()=>validateUnitEligibilityQuery({...input,...change}));
});

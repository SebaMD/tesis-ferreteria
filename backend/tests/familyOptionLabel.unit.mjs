import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateOptionLabelCorrection} from '../dist/modules/productFamilies/familyOptionLabel.service.js';
const body={label:' Extra   grande ',reason:'Corrección descriptiva de formato',expectedRevision:'a'.repeat(64),operationKey:'12345678-1234-1234-1234-123456789012',confirmed:true};
test('option label command is normalized, explicit, versioned and rejects unrelated commercial fields',()=>{
 assert.equal(validateOptionLabelCorrection(body).label,'Extra grande');
 for(const change of [{label:''},{label:'x'.repeat(101)},{label:'Hola\nOtro'},{label:null},{confirmed:false},{reason:'corto'},{expectedRevision:'vieja'},{operationKey:'x'},{unitMeasure:'caja'},{optionId:4},{price:1}])assert.throws(()=>validateOptionLabelCorrection({...body,...change}));
});

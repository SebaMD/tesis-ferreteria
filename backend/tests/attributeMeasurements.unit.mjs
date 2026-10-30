import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attributeMeasurementUnits,normalizeAttributeNumber,validateAttributeMeasurement,attributeOptionLabel} from '../dist/modules/productFamilies/attributeMeasurements.js';
import {validateFamilyBody} from '../dist/modules/productFamilies/productFamilies.service.js';
import {validateFamilyDimension} from '../dist/modules/productFamilies/familyDimension.service.js';

test('attribute magnitudes are independent of SKU units and accept the seven canonical units',()=>{
 for(const [measurementKind,units] of Object.entries(attributeMeasurementUnits))for(const unitCode of units){
  assert.deepEqual(validateAttributeMeasurement({measurementKind,unitCode}),{measurementKind,unitCode});
  assert.equal(attributeOptionLabel('100',unitCode),`100 ${unitCode}`);
 }
 assert.deepEqual(validateAttributeMeasurement({}),{});assert.equal(attributeOptionLabel('400 ml',null),'400 ml');
 for(const v of [{measurementKind:'length',unitCode:'kg'},{measurementKind:'volume',unitCode:'ml'},{measurementKind:'mass'},{unitCode:'mm'},{measurementKind:'unknown',unitCode:'mm'}])assert.throws(()=>validateAttributeMeasurement(v));
});
test('exact decimal normalization rejects suffixes, zeros, signs, scientific notation and excessive precision',()=>{
 for(const [input,expected] of [['00100.000','100'],['0,250000','0.25'],['999999999999.999999','999999999999.999999']])assert.equal(normalizeAttributeNumber(input),expected);
 for(const invalid of ['100 mm','1e3','-1','+1','0','0,0','NaN','1 000','1,000.5','1.0000001','1000000000000'])assert.throws(()=>normalizeAttributeNumber(invalid));
});
test('family and audited dimension contracts normalize numeric duplicates without changing legacy text',()=>{
 const base={name:'Familia',categoryId:1,attributes:[{name:'Longitud',measurementKind:'length',unitCode:'mm',options:[{label:'0100,000'},{label:'200'}]}]};
 assert.deepEqual(validateFamilyBody(base).attributes[0].options,[{label:'100'},{label:'200'}]);
 assert.throws(()=>validateFamilyBody({...base,attributes:[{...base.attributes[0],options:[{label:'1'},{label:'1.0'}]}]}),/repetidas/);
 assert.throws(()=>validateFamilyBody({...base,attributes:[{...base.attributes[0],options:[{label:'100 mm'}]}]}),/números/);
 assert.equal(validateFamilyBody({...base,attributes:[{name:'Medida',options:[{label:'100 mm'}]}]}).attributes[0].options[0].label,'100 mm');
 const command={name:'Peso',measurementKind:'mass',unitCode:'kg',options:['01,50','2'],assignments:[{productId:1,optionIndex:0}],reason:'Definición explícita del peso',confirmed:true,expectedRevision:'a'.repeat(64),operationKey:'b'.repeat(24)};
 assert.deepEqual(validateFamilyDimension(command).options,['1.5','2']);assert.throws(()=>validateFamilyDimension({...command,options:['1','1.00']}),/duplicadas/);
});
test('0041 is additive, chained to 0040 and forbids persisted conversions without rewriting captures',async()=>{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 assert.equal(journal.entries.find(e=>e.idx===41).tag,'0041_attribute_measurements');assert.equal(journal.entries.find(e=>e.idx===40).tag,'0040_local_fixed_delivery');
 const previous=JSON.parse(await readFile('drizzle/meta/0040_snapshot.json','utf8')),next=JSON.parse(await readFile('drizzle/meta/0041_snapshot.json','utf8'));
 assert.equal(next.prevId,previous.id);assert.ok(next.tables['public.family_attributes'].columns.unit_code);assert.ok(next.tables['public.family_attributes'].checkConstraints.family_attribute_measurement_check);
 const sql=await readFile('drizzle/0041_attribute_measurements.sql','utf8');
 assert.doesNotMatch(sql,/DISABLE TRIGGER|UPDATE commercial_identity_snapshots|UPDATE family_attribute_options|UPDATE products|DROP /i);
 assert.match(sql,/CREATE TRIGGER attribute_measurement_guard/);assert.match(sql,/CREATE TRIGGER quantitative_option_guard/);assert.match(sql,/CREATE OR REPLACE FUNCTION fyf_capture_commercial_identity/);
});

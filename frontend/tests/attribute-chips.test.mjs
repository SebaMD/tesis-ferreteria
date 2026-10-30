import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectedAttributeNames,inlineDimensionDraft} from '../src/helpers/attributeSuggestions.js';
import {bundleDraft,newBundleRow,bundlePayload} from '../src/helpers/productBundleForm.js';
test('chips distinguish normalized duplicates, custom names, empty Otro and atomic one-dimension limit',()=>{
 assert.equal(selectedAttributeNames(['Color','Medida'],false,'',[],8).valid,true);
 assert.equal(selectedAttributeNames(['Color','Medida'],false,'',[],1).valid,false);
 assert.equal(selectedAttributeNames(['Color'],false,'',['  COLOR '],8).valid,false);
 assert.equal(selectedAttributeNames(['Medida'],true,' medida ',[],8).valid,false);
 assert.deepEqual(selectedAttributeNames([],true,'',[],1),{names:[''],valid:true});
 assert.equal(selectedAttributeNames([],false,'',[],8).valid,false);
});
test('inline options are explicit for every active/inactive member and preserve shared option indices',()=>{
 const rows=[{id:10,status:true},{id:11,status:false},{id:12,status:true}];
 const d=inlineDimensionDraft(' Color ',{10:' Negro ',11:'negro',12:'Azul'},rows);
 assert.equal(d.valid,true);assert.deepEqual(d.options,['Negro','Azul']);assert.deepEqual(d.assignments,[{productId:10,optionIndex:0},{productId:11,optionIndex:0},{productId:12,optionIndex:1}]);
 assert.equal(inlineDimensionDraft('Color',{10:'Negro'},rows).valid,false);
});
test('new rows capture their unit and keep it when the general default changes',()=>{
 const d=bundleDraft(null,{name:'Pintura',categoryId:1,unitMeasure:'unidad'});d.rows.push({...newBundleRow(1),unitMeasure:'caja'});
 d.unitMeasure='metro';assert.deepEqual(d.rows.map(r=>r.unitMeasure??d.unitMeasure),['unidad','caja']);
 // The payload retains each explicit individual unit rather than propagating a changed default.
 d.attributes[0].name='Color';d.attributes[0].draftOptions=[{key:'red',label:'Rojo'},{key:'blue',label:'Azul'}];d.attributes[0].optionsText='Rojo\nAzul';
 d.rows.forEach((r,i)=>{r.selections=[i===0?'red':'blue'];r.price=1000;});
 const p=bundlePayload(d,'operation',[],[]);assert.equal(p.unitMeasure,'metro');assert.equal(p.variants[0].unitMeasure,'unidad');assert.equal(p.variants[1].unitMeasure,'caja');
});

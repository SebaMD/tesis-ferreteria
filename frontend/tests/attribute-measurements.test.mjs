import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {ATTRIBUTE_MEASUREMENTS,normalizeAttributeNumber,attributeOptionLabel,validAttributeMeasurement,legacyMeasurementCandidate} from '../src/helpers/attributeMeasurements.js';
import {bundleDraft,newBundleRow,newBundleAttribute,setBundleRowOption,bundleRowLabels,bundleRowValues,bundlePayload} from '../src/helpers/productBundleForm.js';
import {inlineDimensionDraft} from '../src/helpers/attributeSuggestions.js';
import {dimensionDraft} from '../src/helpers/familyDimension.js';
import {auditReadableRows} from '../src/helpers/auditPresentation.js';
import {historicalVariantLabel} from '../src/helpers/historicalIdentity.js';
import {variantLabel,variantOptionState} from '../src/helpers/productVariants.js';

test('all seven attribute units format one suffix, independently of SKU selling units',()=>{
 for(const [measurementKind,value] of Object.entries(ATTRIBUTE_MEASUREMENTS))for(const unitCode of value.units){assert.equal(validAttributeMeasurement({measurementKind,unitCode}),true);assert.equal(attributeOptionLabel('001,50',unitCode),`1.5 ${unitCode}`);}
 assert.equal(attributeOptionLabel('Rojo',null),'Rojo');assert.equal(validAttributeMeasurement({measurementKind:'length',unitCode:'kg'}),false);
 for(const value of ['0','-1','1e3','100 mm','1 000','1.0000001'])assert.throws(()=>normalizeAttributeNumber(value));
});
test('draft values stay numeric, duplicate numbers share an option and display labels include units',()=>{
 let d=bundleDraft(null,{name:'Listón',categoryId:1,price:1000,unitMeasure:'metro'});
 d.attributes[0]={...d.attributes[0],name:'Longitud',measurementKind:'length',unitCode:'mm'};
 d.attributes.push({...newBundleAttribute(),name:'Color'});d.rows[0].selections.push('');d.rows.push(newBundleRow(2,{price:1000,unitMeasure:'unidad'}));
 d=setBundleRowOption(d,d.rows[0].key,0,'0100,00');d=setBundleRowOption(d,d.rows[1].key,0,'100');
 d=setBundleRowOption(d,d.rows[0].key,1,'Rojo');d=setBundleRowOption(d,d.rows[1].key,1,'Azul');
 assert.equal(d.attributes[0].draftOptions.length,1);assert.deepEqual(bundleRowValues(d,d.rows[0]),['100','Rojo']);assert.deepEqual(bundleRowLabels(d,d.rows[0]),['100 mm','Rojo']);
 const p=bundlePayload(d,'a'.repeat(24),[],[]);assert.equal(p.family.attributes[0].unitCode,'mm');assert.deepEqual(p.family.attributes[0].options,[{label:'100'}]);assert.deepEqual(p.variants.map(v=>v.unitMeasure),['metro','unidad']);
 const cancelled=structuredClone(d);let pending=setBundleRowOption(d,d.rows[0].key,0,'200');assert.equal(bundleRowLabels(cancelled,cancelled.rows[0])[0],'100 mm');assert.equal(bundleRowLabels(pending,pending.rows[0])[0],'200 mm');assert.equal(d.rows[0].unitMeasure,'metro');
 pending=setBundleRowOption(d,d.rows[0].key,0,'100 mm');assert.throws(()=>bundlePayload(pending,'b'.repeat(24),[],[]));
});
test('stored quantitative IDs and individual SKU units survive draft load and ordinary save',()=>{
 const family={id:24,name:'Familia',categoryId:1,brand:null,description:null,attributes:[{id:30,name:'Longitud',measurementKind:'length',unitCode:'cm',options:[{id:89,label:'10',attributeId:30},{id:90,label:'20',attributeId:30}]}]};
 const variants=[{id:105,name:'SKU A',price:1000,unitMeasure:'unidad',minimumStock:0,status:true,hasHistory:true,variantOptionIds:[89]},{id:106,name:'SKU B',price:2000,unitMeasure:'metro',minimumStock:0,status:false,hasHistory:true,variantOptionIds:[90]}];
 const d=bundleDraft({family,variants,revision:'a'.repeat(64)});const p=bundlePayload(d,'c'.repeat(24),[],[]);
 assert.deepEqual(p.family.attributes[0].options.map(o=>o.id),[89,90]);assert.deepEqual(p.variants.map(v=>v.id),[105,106]);assert.deepEqual(p.variants.map(v=>v.unitMeasure),['unidad','metro']);assert.deepEqual(bundleRowLabels(d,d.rows[0]),['10 cm']);
});
test('controlled inline dimension canonicalizes values, requires all assignments and freezes its unit in recovery contract',()=>{
 const rows=[{id:105},{id:106},{id:110}],m={measurementKind:'volume',unitCode:'mL'};
 const result=inlineDimensionDraft('Capacidad',{105:'0100.00',106:'100',110:'200'},rows,m);assert.ok(result.valid);assert.deepEqual(result.options,['100','200']);assert.deepEqual(result.assignments.map(a=>a.optionIndex),[0,0,1]);assert.equal(result.unitCode,'mL');
 assert.equal(inlineDimensionDraft('Capacidad',{105:'100',106:'100',110:'200 mL'},rows,m).valid,false);assert.equal(inlineDimensionDraft('Capacidad',{105:'100'},rows,m).valid,false);
 assert.equal(dimensionDraft('Peso','1\n1.00',{105:'0',106:'0',110:'1'},rows,{measurementKind:'mass',unitCode:'kg'}).valid,false);
});
test('legacy eligibility is diagnostic only: labels and IDs remain intact; mixed and nonnumeric labels are not candidates',()=>{
 const a={id:30,options:[{id:89,label:'100 mm'},{id:90,label:'200 mm'}]},before=structuredClone(a);assert.equal(legacyMeasurementCandidate(a),'mm');assert.deepEqual(a,before);
 assert.equal(legacyMeasurementCandidate({...a,options:[{label:'100 mm'},{label:'20 cm'}]}),null);assert.equal(legacyMeasurementCandidate({...a,options:[{label:'Grande'}]}),null);
 assert.equal(legacyMeasurementCandidate({...a,options:[{label:'100 mm'},{label:'0100 mm'}]}),null);
});
test('audit dimension additions retain the structured unit and formatted labels without fictitious previous values',()=>{
 const rows=auditReadableRows({operation:'DIMENSION_ADD',changes:[{field:'Atributo incorporado',after:{name:'Longitud'}},{field:'Unidad descriptiva del atributo',after:'mm'},{field:'Opciones incorporadas',after:[{id:1,label:'100 mm'}]}]});assert.equal(rows[1].after,'mm');assert.ok(rows.every(r=>r.before===undefined));assert.match(rows[2].after,/100 mm/);
});
test('UI uses separate descriptive measurement controls and leaves historical values and SKU units protected',async()=>{
 const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');const [editor,fields,dimension]=await Promise.all(['components/ProductBundleEditor.jsx','components/AttributeMeasurementFields.jsx','components/FamilyDimensionDialog.jsx'].map(read));
 assert.match(fields,/if \(attribute.id\)/);assert.match(fields,/disabled=\{disabled \|\| hasValues\}/);assert.match(editor,/!a.unitCode/);assert.match(editor,/bundleRowValues/);assert.match(editor,/Unidad individual/);assert.match(editor,/row.hasHistory\|\|row.isOriginal/);
 assert.match(dimension,/measurementFields\(config\)/);assert.match(dimension,/optionLabel\(config.options/);assert.match(dimension,/Cancelar nueva dimensión/);
});
test('cart uses formatted current characteristics; historical orders use captured labels only and selection stays ID-based',async()=>{
 const a={id:105,status:true,currentStock:5,variantValues:[{attributeId:1,attribute:'Longitud',optionId:10,label:'100 mm'},{attributeId:2,attribute:'Color',optionId:20,label:'Rojo'}]};
 const b={id:106,status:true,currentStock:5,variantValues:[{attributeId:1,attribute:'Longitud',optionId:11,label:'200 mm'},{attributeId:2,attribute:'Color',optionId:21,label:'Azul'}]};
 assert.equal(variantLabel(a),'Longitud: 100 mm · Color: Rojo');assert.equal(variantOptionState([a,b],a,1,11).variant.id,106);assert.equal(variantOptionState([a,b],a,1,999),null);
 const capture={origin:'ORIGINAL',identity:{family:{attributes:[{name:'Longitud',label:'100 mm',value:'100',unitCode:'mm'}]}}};const before=structuredClone(capture);assert.equal(historicalVariantLabel(capture),'Longitud: 100 mm');assert.equal(historicalVariantLabel(null),'');assert.deepEqual(capture,before);
 const cart=await readFile(new URL('../src/pages/ClientCartPage.jsx',import.meta.url),'utf8'),checkout=await readFile(new URL('../src/pages/CheckoutPage.jsx',import.meta.url),'utf8');assert.match(cart,/variantLabel\(row.product\)/);assert.match(checkout,/variantLabel\(row.product\)/);
});

test('adding another draft attribute keeps canonical numeric inputs separate from formatted labels',async()=>{
 const editor=await readFile(new URL('../src/components/ProductBundleEditor.jsx',import.meta.url),'utf8');
 const handler=editor.slice(editor.indexOf('const addAttributes ='),editor.indexOf('useBarcodeScanner({'));
 assert.match(handler,/r\.optionTexts\?\.\[i\]\?\?bundleRowValues\(draft,r\)\[i\]/);
 assert.doesNotMatch(handler,/bundleRowLabels/);
 let draft=bundleDraft(null,{name:'Longitud',price:1000,categoryId:1});
 draft.attributes[0]={...draft.attributes[0],name:'Longitud',measurementKind:'length',unitCode:'mm'};
 draft=setBundleRowOption(draft,draft.rows[0].key,0,'100');
 delete draft.rows[0].optionTexts;
 assert.deepEqual(bundleRowValues(draft,draft.rows[0]),['100']);
 assert.deepEqual(bundleRowLabels(draft,draft.rows[0]),['100 mm']);
});

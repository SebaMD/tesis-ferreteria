import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { changeGeneralUnit, unitApplicationPlan, applyUnitApplication, validUnit, unitSelectionPlan, applyUnitSelection } from '../src/helpers/productUnits.js';
import { bundleDraft, newBundleRow, bundlePayload, setBundleRowOption } from '../src/helpers/productBundleForm.js';

const rows=()=>[{key:'new-a',name:'Variante A',unitMeasure:'unidad',initialStock:6,minimumStock:2,price:1000,status:true,files:[],selections:['red']},
  {key:'new-b',name:'Variante B',unitMeasure:'caja',initialStock:0,minimumStock:3,price:2000,status:false,files:[],selections:['blue']}];
test('general unit changes do not propagate; future rows capture the new default',()=>{
 const d={unitMeasure:'unidad',rows:rows()},before=structuredClone(d);
 const next=changeGeneralUnit(d,'metro');assert.deepEqual(next.rows.map(r=>r.unitMeasure),['unidad','caja']);assert.deepEqual(d,before);
 assert.equal(newBundleRow(1,next).unitMeasure,'metro');
 const legacy=changeGeneralUnit({unitMeasure:'kg',rows:[{key:'legacy'}]},'caja');assert.equal(legacy.rows[0].unitMeasure,'kg');
});
test('explicit all-row application updates only units in eligible new rows and includes inactive rows',()=>{
 const d={unitMeasure:' metro ',rows:rows()},before=structuredClone(d),plan=unitApplicationPlan(d);
 assert.equal(plan.changing,2);assert.equal(plan.blocked,0);assert.equal(plan.canApply,true);
 const result=applyUnitApplication(d,plan);assert.equal(result.applied,true);assert.deepEqual(result.draft.rows.map(r=>r.unitMeasure),['metro','metro']);assert.equal(result.count,2);
 for(let i=0;i<d.rows.length;i++){const {unitMeasure,...a}=result.draft.rows[i];const {unitMeasure:old,...b}=before.rows[i];assert.deepEqual(a,b);assert.ok(unitMeasure!==old);assert.equal(result.draft.rows[i].files,d.rows[i].files);}
 assert.deepEqual(d,before);
});
test('same-unit rows are counted but never rewritten; historical rows with same unit do not block new changes',()=>{
 const same={key:'sku',id:105,name:'Histórica',unitMeasure:'metro',hasHistory:true,currentStock:9,status:false};
 const d={unitMeasure:'metro',rows:[same,...rows()]},plan=unitApplicationPlan(d),result=applyUnitApplication(d,plan);
 assert.equal(plan.same,1);assert.equal(plan.changing,2);assert.equal(result.applied,true);assert.equal(result.draft.rows[0],same);
});
test('a changed historical SKU blocks the whole action, never a silent partial application',()=>{
 const d={unitMeasure:'caja',rows:[{key:'sku',id:105,unitMeasure:'unidad',hasHistory:true},...rows()]},plan=unitApplicationPlan(d);
 assert.equal(plan.blocked,1);assert.equal(plan.changing,1);assert.equal(plan.same,1);assert.equal(plan.canApply,false);assert.match(plan.rows[0].reason,/historial/);
 const result=applyUnitApplication(d,plan);assert.equal(result.applied,false);assert.equal(result.draft,d);
});
test('existing rows without history are not declared eligible without a pending-commitment contract',()=>{
 const d={unitMeasure:'metro',rows:[{key:'sku',id:108,unitMeasure:'unidad',hasHistory:false},...rows()]},plan=unitApplicationPlan(d);
 assert.equal(plan.blocked,1);assert.match(plan.rows[0].reason,/compromisos pendientes/);assert.equal(applyUnitApplication(d,plan).applied,false);
 assert.match(unitApplicationPlan({...d,rows:[{key:'sku',id:108,unitMeasure:'unidad'}]}).rows[0].reason,/verificación completa/);
});
test('conversion original stays protected; preview and cancellation do not mutate the draft',()=>{
 const d={unitMeasure:'caja',rows:[{key:'original',id:105,isOriginal:true,unitMeasure:'unidad',hasHistory:false},...rows()]},before=structuredClone(d),plan=unitApplicationPlan(d);
 assert.equal(plan.blocked,1);assert.match(plan.rows[0].reason,/conversión/);assert.deepEqual(d,before); // cancellation discards only the plan
});
test('stale previews, invalid units and semantic aliases are not silently accepted',()=>{
 const d={unitMeasure:'metro',rows:rows()},plan=unitApplicationPlan(d);
 assert.equal(applyUnitApplication(changeGeneralUnit(d,'kg'),plan).applied,false);
 assert.equal(applyUnitApplication({...d,rows:d.rows.map((r,i)=>i? r:{...r,unitMeasure:'kg'})},plan).applied,false);
 for(const invalid of ['', ' '.repeat(3), 'x'.repeat(51), 'uni\ndad',null])assert.equal(validUnit(invalid),false);
 assert.equal(unitApplicationPlan({unitMeasure:'Unidad',rows:[{key:'old',id:105,hasHistory:true,unitMeasure:'unidad'}]}).blocked,1);
});
test('payload preserves explicit units and stock when applying to a new family',()=>{
 let d=bundleDraft(null,{name:'Pintura',categoryId:1,unitMeasure:'unidad',price:1000});d.attributes[0].name='Color';d=setBundleRowOption(d,d.rows[0].key,0,'Rojo');d.rows.push(newBundleRow(1,d));d=setBundleRowOption(d,d.rows[1].key,0,'Azul');
 d.rows.forEach(row=>{row.price=1000;});
 d=changeGeneralUnit(d,'caja');const unmodified=bundlePayload(d,'key-before',[],[]);assert.deepEqual(unmodified.variants.map(v=>v.unitMeasure),['unidad','unidad']);
 const changed=applyUnitApplication(d,unitApplicationPlan(d)).draft,p=bundlePayload(changed,'key-after',[],[]);assert.deepEqual(p.variants.map(v=>v.unitMeasure),['caja','caja']);assert.deepEqual(p.variants.map(v=>v.initialStock),unmodified.variants.map(v=>v.initialStock));
});
test('unit UI requires preview/confirmation and uses no write endpoint; historical controls stay locked',async()=>{
 const ui=await readFile(new URL('../src/components/ProductUnitApplicationDialog.jsx',import.meta.url),'utf8'),editor=await readFile(new URL('../src/components/ProductBundleEditor.jsx',import.meta.url),'utf8');
 for(const text of ['AppModal','Vista previa del borrador','setConfirmed','No se realizará una aplicación parcial','Aplicar al borrador','Cancelar','disabled={!plan.canApply || !confirmed || plan.loading || Boolean(plan.error)}'])assert.ok(ui.includes(text),text);
 assert.doesNotMatch(ui,/api\.(post|patch|delete)|fetch\(/);assert.match(editor,/label="Unidad general"/);assert.doesNotMatch(editor,/>Aplicar a todas las variantes<\/button>/);assert.match(editor,/onCommit=\{openUnitPreview\}/);assert.match(editor,/locked\|\|row.hasHistory\|\|row.isOriginal/);assert.match(editor,/Boolean\(unitPreview\)/);
});

test('backend preview enables existing active and inactive SKUs without rewriting their other fields',()=>{
 const d={familyId:42,revision:'a'.repeat(64),unitMeasure:'metro',rows:[{...rows()[0],id:105,hasHistory:false},{...rows()[1],id:106,hasHistory:false}]};
 const eligibility={familyId:42,revision:d.revision,target:'metro',variants:d.rows.map(r=>({productId:r.id,unitMeasure:r.unitMeasure,state:'eligible',reason:'Sin compromisos'}))};
 const plan=unitApplicationPlan(d,eligibility),result=applyUnitApplication(d,plan);
 assert.equal(plan.changing,2);assert.equal(plan.canApply,true);assert.equal(result.applied,true);
 assert.deepEqual(result.draft.rows.map(r=>r.unitMeasure),['metro','metro']);
 assert.deepEqual(result.draft.rows.map(({unitMeasure,...r})=>r),d.rows.map(({unitMeasure,...r})=>r));
 for(const invalid of [{...eligibility,familyId:43},{...eligibility,revision:'b'.repeat(64)},{...eligibility,target:'kg'}])assert.equal(unitApplicationPlan(d,invalid).canApply,false);
 const blocked={...eligibility,variants:[eligibility.variants[0],{...eligibility.variants[1],state:'blocked',reason:'Solicitud de despacho abierta'}]};
 const denied=unitApplicationPlan(d,blocked);assert.equal(denied.blocked,1);assert.equal(denied.canApply,false);assert.match(denied.rows[1].reason,/Solicitud/);assert.equal(applyUnitApplication(d,denied).draft,d);
});

test('preview queries are read-only and do not silently update the saved revision',async()=>{
 const service=await readFile(new URL('../src/services/productFamilies.service.js',import.meta.url),'utf8'),editor=await readFile(new URL('../src/components/ProductBundleEditor.jsx',import.meta.url),'utf8');
 assert.match(service,/api.get\(`\/product-families\/\$\{id\}\/unit-eligibility`/);
 assert.match(editor,/unitPreviewRequest.current\+\+/);assert.match(editor,/getFamilyUnitEligibilityRequest\(draft.familyId,plan.target,draft.revision\)/);
 assert.match(editor,/setUnitPreview\(unitSelectionPlan\(draft,target,eligibility\)\)/);assert.match(editor,/unitProblem\.productId/);
});

test('selector preview is tentative; confirm updates default and individual units together, cancellation changes nothing',()=>{
 const draft={unitMeasure:'unidad',rows:rows()},original=structuredClone(draft);
 const plan=unitSelectionPlan(draft,'metro');assert.equal(plan.canApply,true);assert.deepEqual(draft,original);
 const applied=applyUnitSelection(draft,plan);assert.equal(applied.applied,true);assert.equal(applied.draft.unitMeasure,'metro');assert.deepEqual(applied.draft.rows.map(r=>r.unitMeasure),['metro','metro']);assert.deepEqual(draft,original);
 assert.equal(unitSelectionPlan(draft,' unidad ').canApply,false);
 assert.equal(applyUnitSelection({...draft,rows:draft.rows.map((r,i)=>i?r:{...r,unitMeasure:'kg'})},plan).applied,false);
 const same={unitMeasure:'unidad',rows:[{key:'same',id:105,unitMeasure:'metro',hasHistory:true}]};
 const defaultOnly=applyUnitSelection(same,unitSelectionPlan(same,'metro'));assert.equal(defaultOnly.applied,true);assert.equal(defaultOnly.count,0);assert.equal(defaultOnly.draft.rows[0],same.rows[0]);
});

test('selector preserves mixed individual drafts on rejection; existing/inactive eligibility is still required',()=>{
 const d={familyId:42,revision:'a'.repeat(64),unitMeasure:'unidad',rows:rows().map((r,i)=>({...r,id:105+i,hasHistory:false}))};
 const eligibility={familyId:42,revision:d.revision,target:'metro',variants:d.rows.map(r=>({productId:r.id,state:'eligible',reason:'Sin compromisos'}))};
 const result=applyUnitSelection(d,unitSelectionPlan(d,'metro',eligibility));assert.equal(result.applied,true);assert.equal(result.draft.rows[1].status,false);
 const blocked={...eligibility,variants:eligibility.variants.map((r,i)=>i?{...r,state:'blocked',reason:'Solicitud pendiente'}:r)};
 assert.equal(applyUnitSelection(d,unitSelectionPlan(d,'metro',blocked)).draft,d);
 assert.equal(applyUnitSelection({...d,revision:'b'.repeat(64)},unitSelectionPlan(d,'metro',eligibility)).applied,false);
});

test('combobox commits only explicit selection/Enter or edited blur, never load, focus or each keystroke',async()=>{
 const field=await readFile(new URL('../src/components/ProductFormFields.jsx',import.meta.url),'utf8');
 assert.match(field,/committed.current = false; onChange/);assert.match(field,/onCommit\?\.\(option.label\)/);assert.match(field,/if \(!committed.current\)/);
 assert.match(field,/onFocus=\{\(\) => \{ if\(!idle\)setOpen\(true\); \}\}/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditReadableRows,auditReadableValue} from '../src/helpers/auditPresentation.js';
import {groupInventoryProducts,inventoryGroupIdentity,inventoryExportRows,selectedInventoryProduct} from '../src/helpers/inventoryGroups.js';

test('family row identity is not the selected SKU ID; concrete selection/export remain unchanged',()=>{
 const products=[{id:105,familyId:8,name:'Activa',status:true,currentStock:4,price:1000},{id:108,familyId:8,name:'Inactiva',status:false,currentStock:0,price:2000},{id:99,name:'Simple',status:true,currentStock:1}];
 const before=structuredClone(products),groups=groupInventoryProducts(products),family=groups.find(g=>g.kind==='family');
 assert.equal(inventoryGroupIdentity(family),'Familia #8');assert.equal(inventoryGroupIdentity(groups.find(g=>g.kind==='product')),'Producto #99');
 assert.equal(selectedInventoryProduct(family,108).id,108);assert.equal(inventoryGroupIdentity(family),'Familia #8');
 assert.deepEqual(inventoryExportRows(products,'ADMIN').map(r=>r.id),[105,108,99]);assert.deepEqual(products,before);
 assert.equal(inventoryGroupIdentity({kind:'family',products:[{}]}),'Familia');assert.equal(inventoryGroupIdentity({kind:'product',products:[{}]}),'Producto');
});

test('dimension summary uses recorded names/labels only and keeps full arrays available without mutation',()=>{
 const event={operation:'DIMENSION_ADD',changes:[{field:'Atributo incorporado',before:null,after:{id:7,name:'Tamaño'}},{field:'Opciones incorporadas',before:null,after:Array.from({length:8},(_,i)=>({id:i+1,label:`${100+i*100} mm`}))},{field:'Asignaciones nuevas',before:null,after:[{productId:105,optionId:1}]}]};
 const before=structuredClone(event),rows=auditReadableRows(event);assert.equal(rows[0].after,'Tamaño');assert.equal(rows[0].kind,'addition');assert.equal(rows[0].before,undefined);assert.match(rows[1].after,/100 mm, 200 mm, 300 mm, 400 mm/);assert.match(rows[1].after,/800 mm/);assert.match(rows[2].items[0],/Producto #105: 100 mm/);assert.deepEqual(event,before);
 assert.deepEqual(auditReadableRows({operation:'DIMENSION_ADD',changes:[{field:'Atributo incorporado',after:{id:7,name:null}}]}),[]);
});

test('short corrections have descriptive comparisons; missing data and large structures are not invented',()=>{
 assert.deepEqual(auditReadableRows({operation:'OPTION_LABEL_CORRECTION',changes:[{field:'Etiqueta · atributo #7 · opción #1',before:'400ml',after:'400 ml'}]}),[{kind:'change',label:'Etiqueta compartida',before:'400ml',after:'400 ml'}]);
 assert.equal(auditReadableValue({id:8,name:null}),'#8 (nombre no registrado)');assert.equal(auditReadableValue({productId:105,unknown:'internal'}),null);
 assert.equal(auditReadableValue(null),'No registrado / no aplica');
 const rows=auditReadableRows({operation:'BUNDLE_SAVE',changes:[{field:'Artículos registrados',before:[{id:105}],after:[{id:105},{id:108}]}]});assert.equal(rows[0].label,'Producto agregado');assert.match(rows[0].after,/Producto #108/);
});

test('pencils share input border, preserve label association and audited operation; footer has three ordered actions',async()=>{
 const editor=await readFile(new URL('../src/components/ProductBundleEditor.jsx',import.meta.url),'utf8'),dimension=await readFile(new URL('../src/components/FamilyDimensionDialog.jsx',import.meta.url),'utf8'),css=await readFile(new URL('../src/styles/styles.css',import.meta.url),'utf8');
 assert.match(editor,/htmlFor=\{`option-input-/);assert.match(editor,/bundle-option-control relative/);assert.match(editor,/canCorrect\?"pr-12!"/);assert.match(editor,/aria-haspopup="dialog" aria-label=\{`Corregir etiqueta compartida/);
 assert.match(editor,/disabled=\{locked\|\|conflict\} onClick=\{event=>\{if\(dirty\)/);assert.match(editor,/setOptionLabelTarget\(\{attributeId:a.id,optionId:selected.id/);
 assert.match(editor,/className="bundle-footer-actions".*Cancelar.*!dimensionDialog&&previewAction.*type="submit"/);
 assert.match(dimension,/Cancelar nueva dimensión<\/button>\{previewAction\}<button.*disabled=\{busy\|\|uncertain\}/);
 assert.match(css,/\.bundle-footer-actions \{ display: grid; grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/\.bundle-footer-actions\[hidden\] \{ display: none/);
 assert.match(editor,/draft.familyId&&!draft.conversion&&!embedded/);assert.match(editor,/Familia #\{draft.familyId\}/);
});

test('audit UI hides internal diagnostics without removing administrative summaries or contextual help',async()=>{
 const ui=await readFile(new URL('../src/components/ProductAuditHistory.jsx',import.meta.url),'utf8');
 for(const text of ['Agrupa las variantes de un producto','aria-describedby="audit-family-help"','event.at','auditResponsible(event)','Ver todos los productos afectados','event.reason','auditReadableRows(event)','Ver asignaciones por producto','información disponible arriba'])assert.ok(ui.includes(text),text);
 for(const text of ['Alcance de la información registrada','Ver detalles técnicos','JSON.stringify','<pre','event.source','event.limits','Registro técnico'])assert.ok(!ui.includes(text),text);
 assert.doesNotMatch(ui,/<details[^>]*\bopen(?:[ =>])/);assert.ok(!ui.includes('dangerouslySetInnerHTML'));
});

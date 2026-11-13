import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditReadableRows} from '../src/helpers/auditPresentation.js';
const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');

test('pencils use shared, directly targeted hover and keyboard styles without changing other action icons',async()=>{
 const [css,audited,table,editor]=await Promise.all(['styles/styles.css','components/AuditedValueControl.jsx','components/GroupedInventoryTable.jsx','components/ProductBundleEditor.jsx'].map(read));
 assert.match(css,/\.inventory-pencil-button:not\(:disabled\):hover/);
 assert.match(css,/\.dark \.inventory-pencil-button:not\(:disabled\):hover/);
 assert.match(css,/\.inventory-pencil-button:focus-visible/);
 assert.doesNotMatch(css,/\.inventory-edit-trigger:hover[^\n]*color: var\(--color-rust/);
 assert.match(audited,/<div className="inventory-edit-value/);assert.match(audited,/inventory-pencil-button/);
 const button=audited.match(/<button[\s\S]*?<\/button>/g);assert.equal(button.length,1);assert.doesNotMatch(button[0].slice(button[0].indexOf('<Pencil')),/\{value\}|<span/);
 assert.doesNotMatch(audited,/<(?:div|span)[^>]*(?:onClick|onKeyDown)/);
 assert.match(audited,/disabled=\{disabled\} onClick=\{onClick\}/);assert.match(audited,/aria-describedby=\{help\?id:undefined\}/);
 assert.match(table,/<button[^>]*onClick=\{\(\) => onEdit\(product\)\}[^>]*><Pencil[^>]*\/>Editar<\/button>/);
 assert.doesNotMatch(table,/<span>Editar<\/span>/);
 assert.match(audited,/select-text/);assert.match(audited,/title="Editar"/);
 assert.match(editor,/bundle-option-pencil inventory-pencil-button/);
 assert.match(editor,/optionLabelReturn.current=event.currentTarget;setOptionLabelTarget/);
});

test('individual unit pencil is a real button focusing the existing combobox, not an independent save or historical correction',async()=>{
 const [fields,editor]=await Promise.all(['components/ProductFormFields.jsx','components/ProductBundleEditor.jsx'].map(read));
 assert.match(fields,/editIcon && <button ref=\{editButton\} type="button" title="Editar" className="inventory-pencil-button product-lookup-pencil" disabled=\{disabled\}/);
 assert.match(fields,/aria-label=\{`Editar \$\{label.toLocaleLowerCase\("es"\)\}\`\}/);
 assert.match(fields,/onClick=\{\(\) => \{ setEditing\(true\); setOpen\(true\); requestAnimationFrame\(\(\)=>inputRef.current\?\.focus\(\)\); \}\}/);
 assert.match(fields,/readOnly=\{idle\} tabIndex=\{idle \? -1/);assert.match(fields,/if\(!idle\)setOpen\(true\)/);
 assert.match(fields,/editIcon \? "pr-12!"/);
 assert.match(editor,/editIcon=\{!\(row.hasHistory\|\|row.isOriginal\)\}/);
 assert.match(editor,/disabled=\{locked\|\|row.hasHistory\|\|row.isOriginal\}/);
 assert.doesNotMatch(fields,/api\.(post|patch)|saveProduct|correctUnit/);
});

test('incomplete events retain verified information without links to removed diagnostics or invented values',()=>{
 const event={operation:'DIMENSION_ADD',changes:[{field:'Atributo incorporado',after:{id:30,name:null}},{field:'Opciones incorporadas',after:[{id:91,label:null}]}],source:{records:[{id:10,type:'DIMENSION_ADD'}]},limits:['Dato incompleto']};
 const original=structuredClone(event),rows=auditReadableRows(event);
 assert.equal(rows.length,1);assert.equal(rows[0].label,'Opciones agregadas (1)');assert.match(rows[0].after,/No se registraron/);assert.doesNotMatch(rows[0].after,/técnico|diagnóstico/);
 assert.deepEqual(event,original);assert.deepEqual(auditReadableRows({operation:'OTHER',changes:[]}),[]);
});

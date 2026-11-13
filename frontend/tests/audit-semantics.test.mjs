import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditReadableRows,auditLocalDate,auditResponsible} from '../src/helpers/auditPresentation.js';

test('dimension incorporation preserves prior classification as context, never a removal/comparison',()=>{
 const event={operation:'DIMENSION_ADD',changes:[
  {field:'Atributo incorporado',before:null,after:{id:30,name:'Tamaño'}},
  {field:'Opciones incorporadas',before:null,after:[{id:89,label:'100 mm'},{id:90,label:'200 mm'}]},
  {field:'Clasificación anterior',before:[{productId:105,attributeId:25,optionId:77}],after:null},
  {field:'Asignaciones nuevas',before:null,after:[{productId:105,optionId:89},{productId:106,optionId:90}]}]};
 const original=JSON.stringify(event),rows=auditReadableRows(event);
 assert.deepEqual(rows.map(r=>r.kind),['addition','addition','addition']);assert.ok(rows.every(r=>r.before===undefined));
 assert.equal(rows[0].label,'Nuevo atributo');assert.match(rows[2].items[1],/Producto #106: 200 mm/);
 assert.equal(JSON.stringify(event),original);assert.ok(original.includes('attributeId'));
});

test('mixed save separates added SKU and corrected values; absent products are not declared deleted',()=>{
 const event={operation:'BUNDLE_SAVE',changes:[{field:'Artículos registrados',before:[{id:105,name:'A',unit:'unidad'},{id:99,name:'Otro'}],after:[{id:105,name:'A',unit:'metro'},{id:110,name:'Nuevo'}]}]};
 const rows=auditReadableRows(event);assert.equal(rows.length,2);assert.equal(rows[0].kind,'change');assert.equal(rows[0].before,'unidad');assert.equal(rows[0].after,'metro');assert.equal(rows[1].kind,'addition');assert.match(rows[1].after,/Producto #110/);assert.ok(!rows.some(r=>/eliminad/i.test(r.label+r.after)));
});

test('corrections compare old/new; conversion does not add the original again; deactivation is not deletion',()=>{
 for(const operation of ['PRODUCT_NAME_CORRECTION','PRODUCT_CLASSIFICATION_CORRECTION','FAMILY_BRAND_CORRECTION','FAMILY_CATEGORY_CHANGE','ATTRIBUTE_RENAME','OPTION_LABEL_CORRECTION']){
  const [row]=auditReadableRows({operation,changes:[{field:'Dato',before:'rojo',after:'naranjo'}]});assert.equal(row.kind,'change');assert.equal(row.before,'rojo');assert.equal(row.after,'naranjo');
 }
 const rows=auditReadableRows({operation:'CONVERT_SIMPLE',subject:{productId:105},changes:[{field:'Producto original',before:{id:105,name:'Original'},after:{id:105,familyId:1}},{field:'Artículos guardados con la conversión',before:null,after:[{id:105,name:'Original'},{id:110,name:'Nueva'}]}]});
 assert.equal(rows[0].kind,'context');assert.equal(rows.filter(r=>r.kind==='addition').length,1);assert.match(rows[1].after,/#110/);
 assert.match(auditReadableRows({operation:'ARCHIVE'})[0].after,/no eliminada/);
 assert.match(auditReadableRows({operation:'DETACH'})[0].after,/no el producto/);
 assert.equal(auditReadableRows({operation:'OTHER',changes:[{field:'Dato previo',before:'Viejo',after:null} ]})[0].kind,'context');
});

test('dates are local and concise, actor name does not expose redundant numeric ID; DTO stays intact',()=>{
 const event={at:'2026-10-29T15:34:59.000Z',actor:{id:123,name:'Administradora Prueba'},source:{table:'product_family_events',records:[{id:114,type:'DIMENSION_ADD'}]}};
 const before=JSON.stringify(event);const date=auditLocalDate(event.at);assert.match(date,/29-10-2026/);assert.match(date,/12:34/);assert.doesNotMatch(date,/59/);
 assert.equal(auditResponsible(event),'Administradora Prueba');assert.doesNotMatch(auditResponsible(event),/123/);assert.equal(auditResponsible({actor:{id:4}}),'Responsable no registrado');assert.equal(auditLocalDate('invalid'),'Fecha no registrada');assert.equal(JSON.stringify(event),before);
});

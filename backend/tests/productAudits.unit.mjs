import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAuditQuery } from '../dist/modules/productAudits/productAudits.service.js';
import { auditDTO, auditText } from '../dist/modules/productAudits/productAudits.dto.js';

test('audit filters validate bounds, real dates, operations and precise keyset cursors', () => {
  assert.equal(validateAuditQuery({}).limit, 25);
  assert.equal(validateAuditQuery({limit:'100',productId:'15',familyId:'3',from:'2026-10-01',to:'2026-10-31'}).productId,15);
  const cursor=Buffer.from(JSON.stringify({at:'2026-10-28T11:12:13.123456Z',id:42})).toString('base64url');
  assert.deepEqual(validateAuditQuery({cursor}).cursor,{at:'2026-10-28T11:12:13.123456Z',id:42});
  for(const input of [{limit:'101'},{limit:'0'},{limit:'2.5'},{productId:'1;drop'},{productId:['1']},{familyId:'-1'},{operation:'toString'},{operation:'missing'},{from:'2026-02-30'},{from:'2026-10-30',to:'2026-10-01'},{cursor:'invalid'},{cursor:Buffer.from(JSON.stringify({at:'2026-02-30T11:12:13.123456Z',id:1})).toString('base64url')},{raw:true}])assert.throws(()=>validateAuditQuery(input));
});

test('numbered audit pages are bounded, fixed at ten and cannot mix cursor modes', () => {
  assert.equal(validateAuditQuery({page:'3'}).page,3);
  assert.equal(validateAuditQuery({page:'3'}).limit,10);
  assert.equal(validateAuditQuery({page:'1000000',limit:'10'}).page,1000000);
  assert.equal(validateAuditQuery({limit:'100'}).page,null);
  for(const page of ['0','-1','1.2','01','1e2','1000001','9007199254740993','', ['1'], 2]) assert.throws(()=>validateAuditQuery({page}));
  for(const limit of ['0','-10','1.5','11','100','101', ['10']]) assert.throws(()=>validateAuditQuery({page:'1',limit}));
  assert.throws(()=>validateAuditQuery({page:'1',cursor:'anything'}));
});

const base={id:1,created_at:'2026-10-28T11:12:13.000001Z',product_id:105,family_id:37,user_id:1,actor_name:'Admin Prueba',reason:'Corrección descriptiva',previous:{product:{id:105,name:'Anterior',password:'NEVER',customer:{phone:'NEVER'}}},next:{operation:'PRODUCT_NAME_CORRECTION',name:'Posterior',operationKey:'NEVER',requestHash:'NEVER',revision:'NEVER'},operation:'PRODUCT_NAME_CORRECTION'};
test('audit DTO is an explicit projection, not raw JSON; credentials and emails are redacted',()=>{
  const dto=auditDTO(base);assert.equal(dto.changes[0].before,'Anterior');assert.equal(dto.changes[0].after,'Posterior');assert.ok(!JSON.stringify(dto).includes('NEVER'));
  assert.ok(!auditText('token=VERYSECRET usuario@example.test Bearer abc123').includes('VERYSECRET'));
  assert.ok(!auditText('token=VERYSECRET usuario@example.test Bearer abc123').includes('usuario@example.test'));
  assert.ok(!auditText('Contacto 12.345.678-5 +56 9 1234 5678').includes('12.345.678'));
  assert.ok(!auditText('Contacto 12.345.678-5 +56 9 1234 5678').includes('1234 5678'));
  assert.equal(auditDTO({...base,reason:'',user_id:null}).actor,null);
  assert.ok(auditDTO({...base,reason:'',user_id:null}).limits.some(v=>v.includes('motivo')));
});
test('audit projection covers family corrections, linked dimensions, conversion and untyped legacy events',()=>{
  const brand=auditDTO({...base,operation:'FAMILY_BRAND_CORRECTION',next:{previousBrand:'Negor',brand:'Negro'}});assert.equal(brand.changes[0].after,'Negro');
  const category=auditDTO({...base,operation:'FAMILY_CATEGORY_CHANGE',previous:{category:{id:1,name:'A'}},next:{category:{id:2,name:'B'}}});assert.equal(category.changes[0].before.id,1);
  const dimension=auditDTO({...base,operation:'DIMENSION_ADD',next:{attributeId:4,productIds:[105,108]},authorization:{previous:{state:{members:[{values:[{product_id:105,attribute_id:1,option_id:2}]}]}},next:{attribute:{id:4,name:'Color'},options:[{id:9,label:'Negro'}],assignments:[{productId:105,optionId:9}]}}});
  assert.equal(dimension.changes[0].after.name,'Color');assert.equal(dimension.changes[2].before[0].optionId,2);
  const legacy=auditDTO({...base,operation:'ASSOCIATION',next:{familyId:3}});assert.equal(legacy.source.originalType,null);
  assert.ok(auditDTO({...base,operation:'BUNDLE_SAVE'}).limits.some(v=>v.includes('automático')));
  assert.equal(auditDTO({...base,operation:'toString'}).operation,'OTHER');
});

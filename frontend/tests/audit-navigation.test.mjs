import {test} from 'node:test';import assert from 'node:assert/strict';
import {auditEmptyFilters,auditQueryFromSearch,auditQueryToSearch} from '../src/helpers/auditNavigation.js';
test('audit filters and opaque cursor survive URL navigation/reload without passing unknown keys',()=>{
 const q={...auditEmptyFilters,operation:'DIMENSION_ADD',productId:'105',familyId:'24',from:'2026-10-01',to:'2026-10-29',limit:'10',cursor:'opaque_cursor-1',unknown:'private'};
 const restored=auditQueryFromSearch(auditQueryToSearch(q));const {unknown,...expected}=q;assert.equal(unknown,'private');assert.deepEqual(restored,expected);
 assert.deepEqual(auditQueryFromSearch(''),{...auditEmptyFilters,cursor:null});
});
test('empty/reset filters never invent an operation or an earlier cursor',()=>{
 const q=auditQueryFromSearch('?extra=secret&productId=105');assert.equal(q.operation,'');assert.equal(q.cursor,null);assert.equal(q.productId,'105');assert.ok(!auditQueryToSearch(q).includes('secret'));
});

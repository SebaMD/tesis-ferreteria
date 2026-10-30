import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {filterInventoryProducts,groupInventoryProducts,inventoryExportRows,inventoryGroupIdentity,selectedInventoryProduct} from '../src/helpers/inventoryGroups.js';
const data=[
 {id:1,familyId:24,familyName:'Familia prueba',name:'Disponible',status:true,currentStock:10,minimumStock:2,categoryId:1},
 {id:2,familyId:24,familyName:'Familia prueba',name:'Bajo',status:true,currentStock:2,minimumStock:2,categoryId:1},
 {id:3,familyId:24,familyName:'Familia prueba',name:'Agotado',status:true,currentStock:0,minimumStock:2,categoryId:1},
 {id:4,familyId:24,familyName:'Familia prueba',name:'Inactivo',status:false,currentStock:0,minimumStock:2,categoryId:1},
 {id:5,name:'Simple',status:true,currentStock:0,minimumStock:1,categoryId:2},
];
const ids=rows=>rows.map(p=>p.id).sort();
test('all eight combinations use SKU state OR, independently of structure AND',()=>{
 for(let mask=0;mask<8;mask++){
  const inactive=Boolean(mask&1),low=Boolean(mask&2),out=Boolean(mask&4);
  const expected=mask?data.filter(p=>(inactive&&p.id===4)||(low&&p.id===2)||(out&&[3,5].includes(p.id))):data.filter(p=>p.status);
  for(const variantsOnly of [false,true]){
   const actual=filterInventoryProducts(data,{inactive,low,out,variantsOnly,canViewInactive:true});
   assert.deepEqual(ids(actual),ids(expected.filter(p=>!variantsOnly||p.familyId)));
   const groups=groupInventoryProducts(actual,data);
   assert.ok(groups.every(g=>g.products.length));
   assert.deepEqual(ids(groups.flatMap(g=>g.products)),ids(actual));
   assert.deepEqual(inventoryExportRows(actual,'ADMIN').map(r=>r.id).sort(),ids(actual));
  }
 }
});
test('search and category AND states, empty results, permissions and inactive identity',()=>{
 const options={inactive:true,out:true,canViewInactive:true,category:'1',search:'inactivo'};
 assert.deepEqual(ids(filterInventoryProducts(data,options)),[4]);
 assert.deepEqual(filterInventoryProducts(data,{...options,category:'2'}),[]);
 assert.deepEqual(ids(filterInventoryProducts(data,{inactive:true,out:true,canViewInactive:false})),[3,5]);
 const family=groupInventoryProducts(filterInventoryProducts(data,options),data)[0];
 assert.equal(inventoryGroupIdentity(family),'Familia #24');assert.equal(selectedInventoryProduct(family,1).id,4);
 assert.equal(inventoryExportRows(family.products,'ADMIN')[0].estado,'Desactivado');
 assert.equal(inventoryGroupIdentity(groupInventoryProducts([data[4]])[0]),'Producto #5');
 assert.equal(data[0].status,true);
});
test('page counts and exports use filtered SKUs, group pagination is last; compact IDs and history controls',async()=>{
 const read=p=>readFile(new URL('../src/'+p,import.meta.url),'utf8');
 const page=await read('pages/ProductsPage.jsx'),table=await read('components/GroupedInventoryTable.jsx'),audit=await read('components/ProductAuditHistory.jsx'),css=await read('styles/styles.css');
 assert.match(page,/usePagination\(groupedProducts/);assert.match(page,/inventoryExportRows\(filteredProducts/);assert.match(page,/filteredProducts.length/);
 assert.doesNotMatch(table,/<td[^>]*>\{inventoryGroupIdentity\(group\)\}<small/);
 assert.match(table,/product.status === false \? "Desactivado"/);
 assert.match(css,/\.inventory-status-action \{ width: 145px/);
 assert.match(page,/Movimientos de unidades de inventario/);
 assert.match(audit,/audit-filter-action/);assert.match(audit,/audit-history-pagination/);
 assert.match(css,/\.audit-history-pagination > button:last-child \{ justify-self: end/);
 assert.match(audit,/aria-current="page"/);
});

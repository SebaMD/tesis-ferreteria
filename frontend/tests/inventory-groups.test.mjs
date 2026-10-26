import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { groupInventoryProducts,inventoryExportRows,selectedInventoryProduct } from "../src/helpers/inventoryGroups.js";
import { isLowStockProduct,isOutOfStockProduct } from "../src/helpers/inventory.js";
import { conversionDraft,bundlePayload,newBundleRow,reconcileAttributeOptions } from "../src/helpers/productBundleForm.js";
const data=[{id:1,name:"Simple",status:true,currentStock:5,minimumStock:1},...[2,3,4].map((id,i)=>({id,familyId:8,familyName:"Lubricante",name:`Presentación ${id}`,barcode:`990${id}`,status:true,currentStock:[2,1,0][i],minimumStock:2,price:id*100,variantValues:[{attribute:"Medida",label:String(id)}]})),{id:5,familyId:8,familyName:"Lubricante",name:"Inactiva",status:false,currentStock:0,minimumStock:2}];
test("concrete filters precede grouping, group pagination never splits a family",()=>{
 const visible=data.filter(p=>p.status),groups=groupInventoryProducts(visible);
 assert.equal(groups.length,2);const family=groups.find(g=>g.kind==="family");assert.equal(family.products.length,3);assert.equal(family.lowCount,2);assert.equal(family.outCount,1);assert.equal(family.currentStock,undefined);assert.equal(family.price,undefined);
 const low=groupInventoryProducts(visible.filter(isLowStockProduct),visible);assert.equal(low.length,1);assert.deepEqual(low[0].products.map(p=>p.id).sort(),[2,3]);assert.equal(low[0].totalVariants,3);assert.equal(low[0].outCount,0);
 const out=groupInventoryProducts(visible.filter(isOutOfStockProduct),visible);assert.deepEqual(out[0].products.map(p=>p.id),[4]);assert.equal(out[0].lowCount,0);
 const pages=groups.map(g=>[g]);assert.equal(pages.flat().filter(g=>g.kind==="family").length,1);
 for(const key of ["Presentación 3","9903","3"]){const matches=visible.filter(p=>p.name.includes(key)||String(p.id)===key||p.barcode===key);const result=groupInventoryProducts(matches,visible);assert.ok(result.some(g=>g.products.some(p=>p.id===3)));}
});
test("export uses one filtered row per concrete ID, no family stock or price",()=>{
 const filtered=data.filter(isLowStockProduct);const rows=inventoryExportRows([...filtered,filtered[0]],"ADMIN");assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),[2,3]);assert.deepEqual(rows.map(r=>r.stockActual),[2,1]);assert.equal(rows[0].familia,"Lubricante");assert.match(rows[0].atributos,/Medida/);
});
test("conversion draft keeps original identity and stock, never sends an original ENTRY",()=>{
 const p={id:41,name:"Lubricante 400 ml",categoryId:1,brand:"Rex",unitMeasure:"unidad",price:1500,currentStock:9,minimumStock:1,status:true,barcode:"12345",variantOptionIds:[]};
 const d=conversionDraft({product:p,revision:"a".repeat(64)});d.name="Lubricante";d.conversion.reason="Agrupar presentaciones existentes";
 d.attributes[0]=reconcileAttributeOptions({...d.attributes[0],name:"Presentación"},"400 ml\n150 ml");d.rows[0].selections=[d.attributes[0].draftOptions[0].key];d.rows.push({...newBundleRow(1,p),selections:[d.attributes[0].draftOptions[1].key],initialStock:3});
 const payload=bundlePayload(d,"operation",[],[]);assert.equal(payload.variants[0].id,41);assert.equal(payload.variants[0].name,p.name);assert.equal(payload.variants[0].initialStock,undefined);assert.equal(payload.variants[1].id,undefined);assert.equal(payload.variants[1].initialStock,3);assert.equal(payload.variants[1].barcode,null);assert.equal(payload.conversion.confirmed,true);assert.equal(d.rows[0].currentStock,9);
});
test("same-row variant selection stays accessible and restores original inventory actions",async()=>{
 const table=await readFile(new URL("../src/components/GroupedInventoryTable.jsx",import.meta.url),"utf8"),page=await readFile(new URL("../src/pages/ProductsPage.jsx",import.meta.url),"utf8");
 assert.match(table,/<AppSelect/);assert.match(table,/renderOption=/);assert.match(table,/renderValue=/);assert.doesNotMatch(table,/onMovement|SlidersHorizontal|<tbody id=|<details/);assert.match(table,/onEdit\(product\)/);assert.match(table,/onStatus\(product\)/);assert.match(page,/usePagination\(groupedProducts/);assert.match(page,/inventoryExportRows\(filteredProducts/);
});
test("selected row is a concrete filtered SKU, exact barcode or ID wins initially",()=>{
 const family=groupInventoryProducts(data.filter(p=>p.status))[0];
 assert.equal(selectedInventoryProduct(family,undefined,"9902").id,2);
 assert.equal(selectedInventoryProduct(family,undefined,"3").id,3);
 assert.equal(selectedInventoryProduct(family,2,"3").id,2);
 const low=groupInventoryProducts(data.filter(isLowStockProduct))[0];
 assert.equal(selectedInventoryProduct(low,4).id,low.products[0].id);
 assert.ok(low.products.every(isLowStockProduct));assert.equal(selectedInventoryProduct(low,3).currentStock,1);
 const out=groupInventoryProducts(data.filter(isOutOfStockProduct))[0];assert.equal(selectedInventoryProduct(out,2).id,4);
});

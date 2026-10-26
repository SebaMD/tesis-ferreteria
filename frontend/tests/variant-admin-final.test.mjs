import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { groupInventoryProducts, selectedInventoryProduct, inventoryExportRows } from "../src/helpers/inventoryGroups.js";
import { isLowStockProduct, isOutOfStockProduct } from "../src/helpers/inventory.js";
import { bundleDraft,bundleRowName,newBundleRow,setBundleRowOption,bundleDraftSignature } from "../src/helpers/productBundleForm.js";
const read=p=>readFile(new URL(`../src/${p}`,import.meta.url),"utf8");
test("variant-only inventory combines concrete visibility, stock filters, grouping and export",()=>{
 const rows=[{id:1,status:true,currentStock:4,minimumStock:1},...Array.from({length:4},(_,i)=>({id:i+2,familyId:10,familyName:"Producto",name:`Variante ${i}`,status:i<2,currentStock:[1,0,5,0][i],minimumStock:2,price:1000+i}))];
 const filter=(inactive,condition=()=>true)=>rows.filter(p=>(inactive?p.status===false:p.status!==false)&&p.familyId&&condition(p));
 assert.deepEqual(filter(false).map(p=>p.id),[2,3]);assert.deepEqual(filter(true).map(p=>p.id),[4,5]);
 const low=groupInventoryProducts(filter(false,isLowStockProduct))[0];assert.equal(selectedInventoryProduct(low).id,2);assert.equal(low.lowCount,1);assert.equal(low.outCount,0);
 const out=groupInventoryProducts(filter(false,isOutOfStockProduct))[0];assert.equal(selectedInventoryProduct(out).id,3);
 const inactive=groupInventoryProducts(filter(true));assert.equal(inactive.length,1);assert.equal(inactive[0].products.length,2);assert.equal(inactive[0].lowCount,0);
 const exported=inventoryExportRows(filter(true),"ADMIN");assert.deepEqual(exported.map(p=>p.id),[4,5]);assert.deepEqual(exported.map(p=>p.stockActual),[5,0]);
 rows.forEach(p=>p.status=false);assert.equal(groupInventoryProducts(filter(true))[0].products.length,4);
});
test("suggested names replace the first presentation suffix and preserve manual names",()=>{
 let d=bundleDraft(null,{name:"Lubricante Rex 40 de 400 ml",categoryId:1,price:5990,minimumStock:5});d.attributes[0].name="Presentación";
 d=setBundleRowOption(d,d.rows[0].key,0,"400 ml");assert.equal(bundleRowName(d,d.rows[0]),"Lubricante Rex 40 de 400 ml");
 d.rows.push(newBundleRow(1,d));d=setBundleRowOption(d,d.rows[1].key,0,"150 ml");assert.equal(bundleRowName(d,d.rows[1]),"Lubricante Rex 40 de 150 ml");
 const signature=bundleDraftSignature(d);d.rows[1].price=3990;assert.notEqual(bundleDraftSignature(d),signature);
 d.rows[1].name="Nombre comercial propio";d.rows[1].nameCustomized=true;d=setBundleRowOption(d,d.rows[1].key,0,"200 ml");assert.equal(bundleRowName(d,d.rows[1]),"Nombre comercial propio");
});
test("restoring equivalent numeric inputs clears dirty state without concealing real edits",()=>{
 const draft=bundleDraft(null,{name:"Producto",price:"5990.00",minimumStock:5});
 const original=bundleDraftSignature(draft);
 draft.rows[0].price="5990";draft.rows[0].minimumStock="5";draft.rows[0].initialStock="0";
 assert.equal(bundleDraftSignature(draft),original);
 draft.rows[0].price="5991";assert.notEqual(bundleDraftSignature(draft),original);
 draft.rows[0].price="";assert.notEqual(bundleDraftSignature(draft),original);
 draft.rows[0].price="5990";draft.rows[0].status=false;assert.notEqual(bundleDraftSignature(draft),original);
});
test("inventory menu reuses portal positioning, outside click, keyboard and concrete selection",async()=>{
 const select=await read("components/AppSelect.jsx"),table=await read("components/GroupedInventoryTable.jsx"),page=await read("pages/ProductsPage.jsx");
 assert.match(select,/createPortal\(popup, document.body\)/);assert.match(select,/fixed z-1000/);assert.match(select,/pointerdown/);assert.match(select,/ArrowDown/);assert.match(select,/Escape/);
 assert.doesNotMatch(table,/<details|<summary/);assert.match(table,/renderValue=/);assert.match(table,/onStatus\(product\)/);assert.doesNotMatch(table,/onMovement/);
 assert.match(page,/variantsOnly && !product.familyId/);assert.match(page,/showInactiveProducts\}\|\$\{variantsOnly/);assert.match(page,/inventory-search/);
});
test("conversion stays inline and suspends only for sensitive confirmations without losing draft",async()=>{
 const page=await read("pages/ProductsPage.jsx"),editor=await read("components/ProductBundleEditor.jsx");
 assert.match(page,/suspended=\{bundleDialogActive\}/);assert.match(page,/<ProductBundleEditor inline conversionId=/);assert.match(page,/onBack=\{returnFromConversion\}/);
 assert.match(editor,/Atributos \(\{draft.attributes.length\}\)/);assert.match(editor,/Confirmar conversión del producto/);assert.match(editor,/onDialogChange\?\.\(confirmSave/);
 assert.doesNotMatch(page,/ProductFamilyTools|Gestión de familias|Administración avanzada|<ProductVariantFields/);
});
test("existing variant status is explicit, confirmed, versioned and blocked for dirty drafts",async()=>{
 const editor=await read("components/ProductBundleEditor.jsx"),service=await read("services/products.service.js");
 assert.match(editor,/dirty \|\| Boolean\(draft.conversion\)/);assert.match(editor,/latest.revision!==draft.revision/);assert.match(editor,/deactivateProductRequest\(statusTarget.id,statusTarget.updatedAt\)/);
 assert.match(editor,/updateProductRequest\(statusTarget.id,\{status:true\},statusTarget.updatedAt\)/);assert.match(editor,/Desactivar variante/);assert.match(editor,/Sí, activar/);assert.match(service,/"If-Match": JSON.stringify\(expectedUpdatedAt\)/);
 assert.match(editor,/row.id \? <>/);assert.match(editor,/Activo inicialmente/);assert.match(editor,/variant-online-control/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { productNameDraftIsDirty, productNameCorrectionStorageKey, readPendingProductNameCorrection } from "../src/helpers/productNameCorrection.js";
const read = path => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
test("independent name action rejects every compatible commercial draft change or pending photograph",()=>{
 const p={id:1,name:"Artículo",price:"1000.00",minimumStock:3,categoryId:1,brand:null,barcode:null,description:null,unitMeasure:"unidad",status:true,inStoreOnly:false};
 assert.equal(productNameDraftIsDirty({...p,price:1000},"unidad",p),false);
 for(const [key,value] of Object.entries({name:"Otro",brand:"Marca",barcode:"123",description:"Detalle",price:1001,minimumStock:4,categoryId:2,status:false,inStoreOnly:true,associationReason:"Cambio"}))assert.equal(productNameDraftIsDirty({...p,[key]:value},"unidad",p),true,key);
 assert.equal(productNameDraftIsDirty(p,"caja",p),true);assert.equal(productNameDraftIsDirty(p,"unidad",p,[{}]),true);
});
test("uncertain product correction remains scoped to actor, product, original revision and exact key",()=>{
 const value={id:105,name:"Artículo",body:{name:"Artículo corregido",reason:"Corrección descriptiva",expectedRevision:"2026-10-27T10:00:00.000Z",operationKey:"12345678-1234-1234-1234-123456789012",confirmed:true}};
 const storage={getItem:k=>k===productNameCorrectionStorageKey(1,105)?JSON.stringify(value):null};
 assert.deepEqual(readPendingProductNameCorrection(1,105,storage),value);assert.equal(readPendingProductNameCorrection(2,105,storage),null);assert.equal(readPendingProductNameCorrection(1,106,storage),null);
});
test("simple and family editors share the independent dialog, preserve drafts and suspend their parent modal",async()=>{
 const action=await read("components/ProductNameCorrectionAction.jsx"),dialog=await read("components/ProductAttributeRenameDialog.jsx"),bundle=await read("components/ProductBundleEditor.jsx"),page=await read("pages/ProductsPage.jsx");
 assert.match(action,/if \(dirty\)/);assert.match(action,/user.role !== "ADMIN"/);assert.match(action,/revision=\{baseline.updatedAt\}/);
 assert.match(dialog,/event\?\.stopPropagation\(\)/);assert.match(dialog,/getProductNameCorrectionRequest/);assert.match(dialog,/frozen.current/);assert.match(dialog,/same|mismo artículo comercial/);
 assert.match(bundle,/suspended=\{nameCorrectionOpen \|\| categoryDialog \|\| dimensionReview\}/);assert.match(page,/suspended=\{bundleDialogActive \|\| nameCorrectionOpen\}/);
 assert.match(bundle,/disabled=\{Boolean\(row.id\) \|\| row.isOriginal\}/);assert.match(page,/<ProductNameCorrectionAction asField/);
});

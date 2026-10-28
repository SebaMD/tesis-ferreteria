import {test} from "node:test";import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
import {dimensionDraft,dimensionStorageKey,pendingDimension}from"../src/helpers/familyDimension.js";
import {variantOptionState} from "../src/helpers/productVariants.js";
test("dimension draft never invents default options, requires inactive members and rejects duplicate labels",()=>{const rows=[{id:105,status:true},{id:108,status:false}];assert.equal(dimensionDraft("Color","Negro\nAzul",{},rows).valid,false);assert.equal(dimensionDraft("Color","Negro\nAzul",{105:"0"},rows).valid,false);const result=dimensionDraft(" Color ","Negro\nAzul",{105:"0",108:"0"},rows);assert.equal(result.valid,true);assert.deepEqual(result.assignments,[{productId:105,optionIndex:0},{productId:108,optionIndex:0}]);assert.equal(dimensionDraft("Color","Azul\n azul ",{105:"0",108:"1"},rows).valid,false);});
test("dimension recovery is actor/family scoped and keeps the original version",()=>{const b={name:"Color",options:["Negro"],assignments:[{productId:105,optionIndex:0}],reason:"Motivo suficiente",operationKey:"12345678-1234-1234-1234-123456789012",expectedRevision:"a".repeat(64),confirmed:true};const storage={getItem:k=>k===dimensionStorageKey(1,2)?JSON.stringify(b):null};assert.deepEqual(pendingDimension(1,2,storage),b);assert.equal(pendingDimension(2,2,storage),null);});
test("dimension dialog is independent, previews old/new values and never calls generic bundle save",async()=>{const read=p=>readFile(new URL(`../src/${p}`,import.meta.url),"utf8");const d=await read("components/FamilyDimensionDialog.jsx"),editor=await read("components/ProductBundleEditor.jsx");assert.match(d,/Antes:/);assert.match(d,/Después:/);assert.match(d,/setSelections\(\{\}\)/);assert.match(d,/dimension-additions/);assert.match(d,/frozen.current/);assert.doesNotMatch(d,/saveProductBundleRequest/);assert.match(editor,/setDimensionDialog\(true\)/);assert.match(editor,/categoryDialog \|\| dimensionDialog/);});
test("an added dimension still selects only real SKUs, never the missing Cartesian combinations",()=>{
 const sku=(id,measure,color,status=true)=>({id,status,availableStock:5,variantValues:[{attributeId:1,optionId:measure},{attributeId:2,optionId:color}]});
 const variants=[sku(105,10,20),sku(108,11,20,false),sku(109,10,21)];
 assert.equal(variantOptionState(variants,variants[1],2,21).variant.id,109);
 assert.equal(variantOptionState(variants,variants[2],1,11).variant.id,108);
 assert.equal(variantOptionState(variants,variants[2],1,11).available,false);
 assert.equal(variantOptionState(variants,variants[0],2,999),null);
});

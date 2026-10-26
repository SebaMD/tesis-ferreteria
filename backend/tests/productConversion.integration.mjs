import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testProductConversion({pool,call,categoryId,simple,users,snapshot}) {
 const originalRows=id=>pool.query("select * from products where id=$1",[id]).then(r=>r.rows[0]);
 const base=async id=>{
   const s=await call("GET",`/product-families/conversion/${id}`,null,"ADMIN"),p=s.product;
   return {operationKey:randomUUID(),conversion:{productId:id,expectedRevision:s.revision,reason:"Agrupación administrativa confirmada en prueba",confirmed:true},
     family:{name:`Familia convertida ${id}`,categoryId:p.categoryId,brand:p.brand,description:p.description,attributes:[{name:"Presentación",options:[{label:"400 ml"},{label:"150 ml"}]}]},unitMeasure:p.unitMeasure,
     variants:[{id,name:p.name,price:Number(p.price),barcode:p.barcode,minimumStock:p.minimumStock,status:p.status,inStoreOnly:p.inStoreOnly,selections:[0]},
       {name:`Nueva 150 ml ${id}`,price:990,initialStock:4,minimumStock:2,selections:[1]}]};
 };
 for(const role of [null,"MANAGER","CASHIER","WAREHOUSE","CLIENT"])await call("GET",`/product-families/conversion/${simple.id}`,null,role,role?403:401);
 const emptyBefore=await originalRows(simple.id),emptyBody=await base(simple.id);
 const emptyResult=await call("POST","/product-families/bundle",emptyBody,"ADMIN");
 assert.equal(emptyResult.productIds[0],simple.id);assert.equal((await originalRows(simple.id)).current_stock,emptyBefore.current_stock);
 assert.equal((await pool.query("select count(*) from inventory_movements where product_id=$1",[simple.id])).rows[0].count,"0");
 const p=await call("POST","/products",{categoryId,name:"Lubricante histórico 400 ml",brand:"Rex",price:1500,barcode:"99884400",unitMeasure:"unidad",minimumStock:2},"ADMIN",201);
 await call("POST","/inventory",{productId:p.id,movementType:"ENTRY",quantity:12,reason:"Ingreso previo a convertir"},"ADMIN",201);
 const sale=await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:p.id,quantity:2}]},"CASHIER",201);
 await call("POST",`/sales/${sale.id}/returns`,{reason:"Devolución previa a convertir",details:[{productId:p.id,quantity:1}]},"ADMIN");
 await call("POST","/promotions",{name:"Promoción del original preservada",type:"PERCENTAGE_DISCOUNT",percentage:10,isActive:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),productIds:[p.id],categoryIds:[]},"MANAGER",201);
 const quote=await call("POST","/online-orders/quote",{items:[{productId:p.id,quantity:1}],deliveryType:"PICKUP"});
 await call("POST","/online-orders/checkout",{items:[{productId:p.id,quantity:1}],deliveryType:"PICKUP",checkoutKey:randomUUID(),quoteFingerprint:quote.quoteFingerprint},"CLIENT",201);
 const referencesBefore=(await pool.query("select * from promotion_products where product_id=$1",[p.id])).rows;
 const paymentBefore=(await pool.query("select * from online_payments order by id")).rows;
 const original=await originalRows(p.id),before=await snapshot(),request=await base(p.id);
 const badIdentity=structuredClone(request);badIdentity.variants[0].name="Otro artículo";await call("POST","/product-families/bundle",badIdentity,"ADMIN",409);
 const badStock=structuredClone(request);badStock.variants[0].initialStock=5;await call("POST","/product-families/bundle",badStock,"ADMIN",400);
 const noOriginal=structuredClone(request);noOriginal.variants.shift();await call("POST","/product-families/bundle",noOriginal,"ADMIN",400);
 const collision=structuredClone(request);collision.variants[1].barcode="99884400";await call("POST","/product-families/bundle",collision,"ADMIN",400);
 assert.deepEqual(await snapshot(),before);
 await pool.query("create function fail_conversion_entry() returns trigger language plpgsql as $$ begin if NEW.quantity=778 then raise exception 'conversion rollback injected'; end if; return NEW; end $$; create trigger fail_conversion_entry before insert on inventory_movements for each row execute function fail_conversion_entry()");
 const failed=structuredClone(request);failed.variants[1].initialStock=778;
 failed.images=[{mimeType:"image/png",authorized:true,data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII="}];failed.variants.forEach(v=>{v.imageIndexes=[0];});
 await call("POST","/product-families/bundle",failed,"ADMIN",500,true);assert.deepEqual(await snapshot(),before);
 await pool.query("drop trigger fail_conversion_entry on inventory_movements; drop function fail_conversion_entry()");
 const [created,replay]=await Promise.all([call("POST","/product-families/bundle",request,"ADMIN"),call("POST","/product-families/bundle",request,"ADMIN")]);
 assert.deepEqual(created.productIds,replay.productIds);assert.notEqual(created.replayed,replay.replayed);
 const after=await snapshot(),current=await originalRows(p.id);
 for(const field of ["id","name","category_id","brand","unit_measure","price","barcode","current_stock","description","minimum_stock","status","in_store_only"])assert.deepEqual(current[field],original[field],field);
 for(const t of ["sales","sale_details","online_orders","online_order_items"])assert.deepEqual(after[t],before[t]);
 assert.deepEqual((await pool.query("select * from promotion_products where product_id=$1",[p.id])).rows,referencesBefore);
 assert.deepEqual((await pool.query("select * from online_payments order by id")).rows,paymentBefore);
 assert.equal((await call("GET",`/catalog/products/${p.id}`)).reservedQuantity,1);
 assert.deepEqual(after.inventory_movements.filter(m=>m.r.product_id===p.id),before.inventory_movements.filter(m=>m.r.product_id===p.id));
 const entry=after.inventory_movements.filter(m=>m.r.product_id===created.productIds[1]);assert.equal(entry.length,1);assert.equal(entry[0].r.movement_type,"ENTRY");assert.equal(entry[0].r.quantity,4);assert.equal(entry[0].r.user_id,users.ADMIN);
 assert.equal((await pool.query("select count(*) from product_family_events where product_id=$1 and next->>'operation'='CONVERT_SIMPLE'",[p.id])).rows[0].count,"1");
 const alternative=structuredClone(request);alternative.operationKey=randomUUID();await call("POST","/product-families/bundle",alternative,"ADMIN",409);
 const family=await call("GET",`/product-families/${created.familyId}/bundle`,null,"ADMIN");assert.deepEqual(family.variants.map(v=>v.id),created.productIds);
 const edit={operationKey:randomUUID(),familyId:created.familyId,expectedRevision:family.revision,family:{...request.family,attributes:family.family.attributes.map(a=>({id:a.id,name:a.name,options:a.options.map(o=>({id:o.id,label:o.label}))}))},unitMeasure:"unidad",
   variants:family.variants.map(v=>({id:v.id,name:v.name,price:Number(v.price)+(v.id===p.id?10:0),barcode:v.barcode,minimumStock:v.minimumStock,status:v.status,inStoreOnly:v.inStoreOnly,selections:family.family.attributes.map(a=>a.options.findIndex(o=>v.variantOptionIds.includes(o.id)))}))};
 await call("POST","/product-families/bundle",edit,"ADMIN");assert.equal((await originalRows(p.id)).current_stock,original.current_stock);
 assert.deepEqual((await pool.query("select * from online_payments order by id")).rows,paymentBefore);
 assert.deepEqual((await snapshot()).online_orders,before.online_orders);
 const catalog=await call("GET",`/catalog/products?search=${encodeURIComponent(request.family.name)}`);assert.equal(catalog.items[0].variants.length,2);
 await call("POST","/inventory",{productId:created.productIds[1],movementType:"ADJUSTMENT",quantity:1,reason:"Ajuste de una sola variante"},"ADMIN",201);
 assert.equal((await originalRows(p.id)).current_stock,original.current_stock);
 const detached=family.variants.find(v=>v.id===p.id);await call("POST",`/product-families/variants/${p.id}/detach`,{expectedFamilyId:created.familyId,expectedOptionIds:detached.variantOptionIds,reason:"Desvinculación para comprobar protección",confirmed:true},"ADMIN");
 await call("GET",`/product-families/conversion/${p.id}`,null,"ADMIN",409);
 const stale=await call("POST","/products",{categoryId,name:"Simple para concurrencia",price:100,unitMeasure:"unidad"},"ADMIN",201),staleBody=await base(stale.id);
 await call("PATCH",`/products/${stale.id}`,{price:110},"ADMIN");await call("POST","/product-families/bundle",staleBody,"ADMIN",409);
 const racing=await call("POST","/products",{categoryId,name:"Simple concurrente",price:200,unitMeasure:"unidad"},"ADMIN",201),raceBody=await base(racing.id);
 const races=await Promise.all([call("POST","/product-families/bundle",raceBody,"ADMIN",[200,409]),call("POST","/product-families/bundle",{...raceBody,operationKey:randomUUID()},"ADMIN",[200,409])]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);assert.equal((await pool.query("select count(*) from inventory_movements where product_id=$1",[racing.id])).rows[0].count,"0");
 console.log("PASS Parte B: conversion without/with sales/returns history, original ID/stock unchanged, ENTRY only new SKU, complete rollback, duplicate and concurrent retries, stale forms, detach recovery protection, catalog and per-variant adjustment");
}

import assert from "node:assert/strict";
export async function testVariantStatus({pool,call,body,snapshot}) {
 const payload=body();payload.family.name="Estados individuales de prueba";payload.variants.forEach(v=>{v.barcode=null;});
 const created=await call("POST","/product-families/bundle",payload,"ADMIN");
 const [id,other]=created.productIds;
 const get=()=>call("GET",`/products/${id}`,null,"ADMIN");
 const original=await get(),before=await snapshot();
 const header=p=>({"If-Match":JSON.stringify(p.updatedAt)});
 for(const role of [null,"MANAGER","CASHIER","WAREHOUSE","CLIENT"]) {
  await call("DELETE",`/products/${id}`,null,role,role?403:401,false,header(original));
  await call("PATCH",`/products/${id}`,{status:true},role,role?403:401,false,header(original));
 }
 await call("DELETE",`/products/${id}`,null,"ADMIN",400,false,{"If-Match":"invalid"});
 await call("DELETE",`/products/${id}`,null,"ADMIN",200,false,header(original));
 const inactive=await get();assert.equal(inactive.status,false);
 for(const key of ["id","name","familyId","price","barcode","currentStock","minimumStock","unitMeasure","variantKey","variantOptionIds"])assert.deepEqual(inactive[key],original[key],key);
 const mixed=await call("GET",`/catalog/products?search=${encodeURIComponent(payload.family.name)}`);assert.deepEqual(mixed.items[0].variants.map(p=>p.id),[other]);
 await call("POST","/online-orders/quote",{items:[{productId:id,quantity:1}],deliveryType:"PICKUP"},null,409);
 await call("POST","/sales",{paymentMethod:"efectivo",details:[{productId:id,quantity:1}]},"CASHIER",409);
 await call("PATCH",`/products/${id}`,{status:true},"ADMIN",409,false,header(original));
 const otherBefore=await call("GET",`/products/${other}`,null,"ADMIN");await call("DELETE",`/products/${other}`,null,"ADMIN",200,false,header(otherBefore));
 const hidden=await call("GET",`/catalog/products?search=${encodeURIComponent(payload.family.name)}`);assert.equal(hidden.items.length,0);
 for(const role of ["ADMIN","MANAGER"]) {const all=await call("GET","/products",null,role);assert.ok(created.productIds.every(pid=>all.some(p=>p.id===pid&&p.status===false)));}
 const races=await Promise.all([call("PATCH",`/products/${id}`,{status:true},"ADMIN",[200,409],false,header(inactive)),call("PATCH",`/products/${id}`,{status:true},"ADMIN",[200,409],false,header(inactive))]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 const active=await get();assert.equal(active.status,true);assert.equal(active.currentStock,original.currentStock);assert.equal((await call("GET",`/products/${other}`,null,"ADMIN")).status,false);
 const shown=await call("GET",`/catalog/products?search=${encodeURIComponent(payload.family.name)}`);assert.deepEqual(shown.items[0].variants.map(p=>p.id),[id]);
 const after=await snapshot();for(const table of ["inventory_movements","sale_details","sales","online_orders","online_order_items","product_variant_values","product_family_events"])assert.deepEqual(after[table],before[table],table);
 assert.equal((await pool.query("select count(*) from inventory_movements where product_id=$1 and movement_type='ENTRY'",[id])).rows[0].count,"1");
 console.log("PASS individual variant status: ADMIN only, stale/concurrent guards, mixed/all inactive families, public visibility, checkout/POS rejected inactive, identity/stock/history unchanged and no duplicate ENTRY");
}

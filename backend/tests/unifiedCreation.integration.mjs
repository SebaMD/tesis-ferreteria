import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testUnifiedCreation({ pool, call, body, snapshot, users }) {
  const directory=(await pool.query("show data_directory")).rows[0].data_directory.replaceAll("\\", "/");
  assert.match(directory, /\/fyf-bundle-test-[^/]+\/data$/);
  const single=body(); single.variants=single.variants.slice(0,1); single.variants[0].barcode=null;
  const before=await snapshot();
  await call("POST","/product-families/bundle",single,"ADMIN",400);
  assert.deepEqual(await snapshot(),before);

  const simple={...single,simple:true,operationKey:randomUUID(),family:{...single.family,attributes:[]},variants:[{...single.variants[0],selections:[],initialStock:7}]};
  simple.images=[{mimeType:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p0AAAAASUVORK5CYII=",authorized:true}];
  simple.variants[0].imageIndexes=[0];
  const [created,replayed]=await Promise.all([call("POST","/product-families/bundle",simple,"ADMIN",200,true),call("POST","/product-families/bundle",simple,"ADMIN",200,true)]);
  assert.equal(created.familyId,null); assert.deepEqual(created.productIds,replayed.productIds); assert.notEqual(created.replayed,replayed.replayed);
  const id=created.productIds[0], saved=await snapshot();
  assert.equal(saved.products.length,before.products.length+1); assert.equal(saved.product_families.length,before.product_families.length);
  const product=(await pool.query("select * from products where id=$1",[id])).rows[0];
  assert.equal(product.family_id,null); assert.equal(product.current_stock,7); assert.equal(Number(product.price),simple.variants[0].price);
  const movements=(await pool.query("select * from inventory_movements where product_id=$1",[id])).rows;
  assert.equal(movements.length,1); assert.equal(movements[0].movement_type,"ENTRY"); assert.equal(movements[0].quantity,7); assert.equal(movements[0].user_id,users.ADMIN);
  assert.equal((await pool.query("select count(*) from product_images where product_id=$1",[id])).rows[0].count,"1");
  assert.deepEqual(await call("GET",`/product-families/operations/${simple.operationKey}`,null,"ADMIN"),{familyId:null,productIds:[id]});
  await call("POST","/product-families/bundle",{...simple,variants:[{...simple.variants[0],initialStock:8}]},"ADMIN",409,true);
  assert.deepEqual(await snapshot(),saved);

  const conversion=await call("GET",`/product-families/conversion/${id}`,null,"ADMIN");
  const convert=body(); convert.variants.forEach(v=>v.barcode=null);
  convert.family={...convert.family,categoryId:product.category_id,brand:product.brand}; convert.unitMeasure=product.unit_measure;
  convert.conversion={productId:id,expectedRevision:conversion.revision,reason:"Agrupar artículo simple conservando su identidad",confirmed:true};
  convert.variants[0]={...convert.variants[0],id,name:product.name,price:Number(product.price)}; delete convert.variants[0].initialStock;
  const converted=await call("POST","/product-families/bundle",convert,"ADMIN");
  assert.equal(converted.productIds[0],id); assert.equal((await pool.query("select current_stock from products where id=$1",[id])).rows[0].current_stock,7);
  assert.deepEqual((await pool.query("select * from inventory_movements where product_id=$1",[id])).rows,movements);

  let bundle=await call("GET",`/product-families/${converted.familyId}/bundle`,null,"ADMIN");
  const other=bundle.variants.find(v=>v.id!==id);
  await call("POST",`/product-families/variants/${other.id}/detach`,{expectedFamilyId:other.familyId,expectedOptionIds:other.variantOptionIds,reason:"Preparar caso histórico de un miembro",confirmed:true},"ADMIN");
  bundle=await call("GET",`/product-families/${converted.familyId}/bundle`,null,"ADMIN");
  assert.equal(bundle.variants.length,1);
  const remaining=bundle.variants[0];
  const edit={operationKey:randomUUID(),familyId:bundle.family.id,expectedRevision:bundle.revision,
    family:{name:bundle.family.name,description:bundle.family.description,categoryId:bundle.family.categoryId,brand:bundle.family.brand,
      attributes:bundle.family.attributes.map(a=>({id:a.id,name:a.name,options:a.options.map(o=>({id:o.id,label:o.label}))}))},unitMeasure:remaining.unitMeasure,
    variants:[{id,name:remaining.name,price:Number(remaining.price),barcode:remaining.barcode,minimumStock:remaining.minimumStock,status:remaining.status,inStoreOnly:remaining.inStoreOnly,
      selections:bundle.family.attributes.map(a=>a.options.findIndex(o=>remaining.variantOptionIds.includes(o.id)))}]};
  await call("POST","/product-families/bundle",edit,"ADMIN");
  assert.equal((await pool.query("select current_stock from products where id=$1",[id])).rows[0].current_stock,7);
  console.log("PASS unified creation: new single family rejected without writes; explicit simple has one ID/ENTRY/image, concurrent retries and durable recovery; subsequent conversion preserves original stock and historical one-member family stays editable");
}

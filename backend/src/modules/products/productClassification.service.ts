import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productsTable as products, categoriesTable as categories, productFamilyEventsTable as events } from "../../db/schema/index.js";
import { ProductError } from "./products.service.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";
import { assertProductPromotionCompatibilityTx, PromotionError } from "../promotions/promotions.service.js";
const clean=(s:string)=>s.trim().replace(/\s+/g," ");
export function validateProductClassification(input:unknown){
 const b=input as Record<string,unknown>;
 if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["field","value","previousValue","reason","expectedRevision","operationKey","confirmed"].includes(k))
 || !["brand","category"].includes(String(b.field)) || typeof b.reason!=="string"||b.reason.trim().length<8||b.reason.trim().length>500
 || typeof b.expectedRevision!=="string"||!Number.isFinite(Date.parse(b.expectedRevision))||new Date(b.expectedRevision).toISOString()!==b.expectedRevision
 || typeof b.operationKey!=="string"||!/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)||b.confirmed!==true
 || (b.field==="brand"?(typeof b.value!=="string"||/[\u0000-\u001f\u007f]/.test(b.value)||!clean(b.value)||clean(b.value).length>100||(b.previousValue!==null&&typeof b.previousValue!=="string"))
 :(!Number.isSafeInteger(b.value)||Number(b.value)<1||!Number.isSafeInteger(b.previousValue)||Number(b.previousValue)<1))) throw new ProductError("Confirme campo, valor anterior, corrección válida y motivo de 8–500 caracteres con su revisión",400);
 return {field:b.field as "brand"|"category",value:b.field==="brand"?clean(b.value as string):Number(b.value),previousValue:b.previousValue,reason:b.reason.trim(),expectedRevision:b.expectedRevision,operationKey:b.operationKey,confirmed:true};
}
export async function productClassificationOperation(id:number,actorId:number,input?:unknown,key?:string){
 if(!Number.isSafeInteger(id)||id<1)throw new ProductError("Producto inválido",400);
 const b=input===undefined?null:validateProductClassification(input),operationKey=b?.operationKey||key||"";
 if(!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey))throw new ProductError("Operación inválida",400);
 const requestHash=b?createHash("sha256").update(JSON.stringify({id,...b})).digest("hex"):null;
 try{return await db.transaction(async tx=>{
  const actor=await tx.execute<{allowed:boolean}>(sql`select exists(select 1 from users u join roles r on r.id=u.role_id where u.id=${actorId} and u.status='ACTIVE' and r.name='ADMIN') allowed`);
  if(!actor.rows[0]?.allowed)throw new ProductError("Solo ADMIN puede corregir marca o categoría",403);
  const schema=await tx.execute<{ready:boolean}>(sql`select to_regprocedure('fyf_check_simple_classification(products,products)') is not null ready`);
  if(!schema.rows[0]?.ready)throw new ProductError("Esta corrección requiere la migración 0039 en este entorno. No se modificó ningún dato",409);
  await acquirePromotionPricingLock(tx);await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
  const [prior]=await tx.select().from(events).where(sql`${events.next}->>'operation'='PRODUCT_CLASSIFICATION_CORRECTION' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
  if(prior){if(prior.userId!==actorId)throw new ProductError("Operación de otro administrador",403);if(prior.productId!==id||(b&&(prior.next as {requestHash:string}).requestHash!==requestHash))throw new ProductError("La clave ya identifica otros datos",409);return {...prior.next as object,replayed:true};}
  if(!b)return null;
  const [p]=await tx.select().from(products).where(eq(products.id,id)).for("update");
  if(!p)throw new ProductError("Producto no encontrado",404);
  if(p.familyId!==null||p.variantKey!==null)throw new ProductError("Utiliza la operación familiar para un producto con variantes",409);
  const associations=await tx.execute(sql`select 1 from product_variant_values where product_id=${id} union all select 1 from product_family_events where product_id=${id} and family_id is not null limit 1`);
  if(associations.rows.length)throw new ProductError("El artículo tiene asociaciones familiares previas; requiere revisar su recuperación familiar",409);
  const previousValue=b.field==="brand"?p.brand:p.categoryId;
  if(p.updatedAt?.toISOString()!==b.expectedRevision||previousValue!==b.previousValue)throw new ProductError("El producto o valor anterior cambió. Recarga y revisa antes de confirmar",409);
  if(b.field==="brand"?clean(p.brand||"").toLocaleLowerCase("es")===String(b.value).toLocaleLowerCase("es"):p.categoryId===b.value)throw new ProductError("El valor normalizado no cambia",400);
  const [oldCategory]=await tx.select().from(categories).where(eq(categories.id,p.categoryId));
  const [destination]=await tx.select().from(categories).where(eq(categories.id,b.field==="category"?Number(b.value):p.categoryId)).for("share");
  if(!destination)throw new ProductError("Categoría destino no disponible",404);
  await tx.execute(sql`select fyf_assert_product_name_ready(${id})`);
  const duplicate=await tx.execute(sql`select id from products where id<>${id} and category_id=${destination.id} and lower(regexp_replace(btrim(name),'\\s+',' ','g'))=lower(regexp_replace(btrim(${p.name}),'\\s+',' ','g')) limit 1`);
  if(duplicate.rows.length)throw new ProductError("Ya existe un producto con ese nombre en la categoría destino",409);
  await assertProductPromotionCompatibilityTx(tx,{productId:id,productName:p.name,categoryId:destination.id,status:true});
  const raw=await tx.execute<{product:unknown;txid:string}>(sql`select to_jsonb(p) product,pg_current_xact_id()::text txid from products p where id=${id}`);
  const updatedAt=new Date(Math.max(Date.now(),(p.updatedAt?.getTime()||0)+1));
  const result={operation:"PRODUCT_CLASSIFICATION_CORRECTION",operationKey,requestHash,productId:id,field:b.field,value:b.value,previousValue,revision:updatedAt.toISOString(),...(b.field==="category"?{category:{id:destination.id,name:destination.name}}:{})};
  await tx.insert(events).values({productId:id,familyId:null,userId:actorId,reason:b.reason,previous:{product:raw.rows[0].product,transactionId:raw.rows[0].txid,category:{id:oldCategory.id,name:oldCategory.name}},next:result});
  await tx.update(products).set({...b.field==="brand"?{brand:String(b.value)}:{categoryId:Number(b.value)},updatedAt}).where(eq(products.id,id));
  return {...result,replayed:false};
 });}catch(error){
  if(error instanceof ProductError)throw error;if(error instanceof PromotionError)throw new ProductError(error.message,409);
  const e=error as {cause?:{code?:string;message?:string};code?:string;message?:string},detail=e.cause||e;
  if(["23514","23505","40P01","40001"].includes(detail.code||""))throw new ProductError(detail.code==="23514"?(detail.message||"Dependencia comercial pendiente"):"Conflicto concurrente o de unicidad; no se aplicó la corrección",409);throw error;
 }
}

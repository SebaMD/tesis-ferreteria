import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { categoriesTable as categories, productFamiliesTable as families, productsTable as products, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { FamilyError } from "./productFamilies.service.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";
import { assertProductPromotionCompatibilityTx, PromotionError } from "../promotions/promotions.service.js";

export function validateFamilyCategory(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["categoryId","reason","expectedRevision","operationKey","confirmed"].includes(k))
    || !Number.isSafeInteger(b.categoryId) || Number(b.categoryId)<1 || typeof b.reason!=="string" || b.reason.trim().length<8 || b.reason.trim().length>500
    || typeof b.expectedRevision!=="string" || !/^[a-f0-9]{64}$/.test(b.expectedRevision) || typeof b.operationKey!=="string" || !/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey) || b.confirmed!==true) throw new FamilyError("Confirme categoría, motivo de 8–500 caracteres y revisión vigente",400);
  return {categoryId:Number(b.categoryId),reason:b.reason.trim(),expectedRevision:b.expectedRevision,operationKey:b.operationKey,confirmed:true};
}
export async function familyCategoryOperation(id: number, actorId: number, input?: unknown, key?: string) {
  if (!Number.isSafeInteger(id)||id<1) throw new FamilyError("Familia inválida",400);
  const b=input===undefined?null:validateFamilyCategory(input);
  const operationKey=b?.operationKey||key||"";
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey))throw new FamilyError("Operación inválida",400);
  const requestHash=b?createHash("sha256").update(JSON.stringify({id,...b})).digest("hex"):null;
  try { return await db.transaction(async tx=>{
    const [u]=await tx.select({role:roles.name,status:users.status}).from(users).innerJoin(roles,eq(roles.id,users.roleId)).where(eq(users.id,actorId));
    if(!u||u.role!=="ADMIN"||u.status!=="ACTIVE")throw new FamilyError("Solo ADMIN puede reclasificar familias",403);
    await acquirePromotionPricingLock(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [prior]=await tx.select().from(events).where(sql`${events.next}->>'operation'='FAMILY_CATEGORY_CHANGE' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
    if(prior){
      if(prior.userId!==actorId)throw new FamilyError("La operación pertenece a otro administrador",403);
      if(prior.familyId!==id || (b && (prior.next as {requestHash:string}).requestHash!==requestHash))throw new FamilyError("La clave corresponde a otra operación");
      return {...prior.next as object,replayed:true};
    }
    if(!b)return null;
    const [family]=await tx.select().from(families).where(eq(families.id,id)).for("update");
    if(!family)throw new FamilyError("Familia no encontrada",404);
    if(family.archivedAt)throw new FamilyError("Reactive la familia antes de reclasificarla");
    const members=await tx.select().from(products).where(eq(products.familyId,id)).orderBy(asc(products.id)).for("update");
    const snapshot=await bundleSnapshot(id,tx);
    if(snapshot.revision!==b.expectedRevision)throw new FamilyError("La familia o sus artículos cambiaron. Recargue y revise antes de confirmar");
    const [destination]=await tx.select().from(categories).where(eq(categories.id,b.categoryId)).for("share");
    if(!destination)throw new FamilyError("Categoría destino no disponible",404);
    if(family.categoryId===b.categoryId)throw new FamilyError("La categoría no cambia",400);
    const collision=await tx.execute(sql`select 1 from product_families where id<>${id} and category_id=${b.categoryId} and lower(regexp_replace(btrim(name),'\\s+',' ','g'))=lower(regexp_replace(btrim(${family.name}),'\\s+',' ','g')) union all select 1 from products target join products member on member.family_id=${id} and target.id<>member.id and lower(regexp_replace(btrim(target.name),'\\s+',' ','g'))=lower(regexp_replace(btrim(member.name),'\\s+',' ','g')) where target.category_id=${b.categoryId} limit 1`);
    if(collision.rows.length)throw new FamilyError("Conflicto de nombres de familia o artículos en la categoría destino");
    for(const p of members){
      await tx.execute(sql`select fyf_assert_product_name_ready(${p.id})`);
      // Validate inactive members too: reclassification must not hide a future promotion collision.
      await assertProductPromotionCompatibilityTx(tx,{productId:p.id,productName:p.name,categoryId:b.categoryId,status:true});
    }
    const [previousCategory]=await tx.select().from(categories).where(eq(categories.id,family.categoryId));
    const updatedAt=new Date();
    await tx.update(families).set({categoryId:b.categoryId,updatedAt}).where(eq(families.id,id));
    await tx.update(products).set({categoryId:b.categoryId,updatedAt}).where(eq(products.familyId,id));
    const {revision}=await bundleSnapshot(id,tx);
    const next={operation:"FAMILY_CATEGORY_CHANGE",operationKey,requestHash,familyId:id,category:{id:destination.id,name:destination.name},productIds:members.map(p=>p.id),revision};
    await tx.insert(events).values({familyId:id,productId:null,userId:actorId,reason:b.reason,previous:{category:{id:family.categoryId,name:previousCategory.name},revision:snapshot.revision,productIds:members.map(p=>p.id)},next});
    return {...next,replayed:false};
  }); }catch(e){
    if(e instanceof FamilyError)throw e;
    if(e instanceof PromotionError)throw new FamilyError(e.message);
    const error=e as {cause?:{code?:string;message?:string};code?:string;message?:string};const detail=error.cause||error;
    if(detail.code==="23514")throw new FamilyError((detail.message||"Dependencia comercial pendiente").replaceAll("corregir el nombre","cambiar la categoría").replaceAll("corregir este nombre","reclasificar esta familia"));
    if(["23505","40P01","40001"].includes(detail.code||""))throw new FamilyError("Conflicto concurrente o nombre duplicado; no se aplicaron cambios");
    throw e;
  }
}

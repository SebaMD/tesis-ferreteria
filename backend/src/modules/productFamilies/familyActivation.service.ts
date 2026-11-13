import { createHash } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { productFamiliesTable as families, productsTable as products, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";
import { assertProductPromotionCompatibilityTx, PromotionError } from "../promotions/promotions.service.js";
import { editProductInTransaction } from "../products/products.service.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { FamilyError } from "./productFamilies.service.js";
import { validateFamilyDeactivation } from "./familyDeactivation.service.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const ids = (value: unknown): number[] | null => Array.isArray(value) && value.every(v => Number.isSafeInteger(v) && v > 0) && new Set(value).size === value.length ? [...value].sort((a,b)=>a-b) : null;
const same = (a: number[] | null, b: number[]) => a !== null && a.length === b.length && a.every((v,i)=>v===b[i]);
const blocked = () => new FamilyError("No se puede garantizar la activación selectiva. Utiliza la activación individual en Editar.", 409);

// Fail closed for legacy/incomplete events. Never infer affected SKU from current inactivity.
export function activationSourceProducts(source: { familyId: number | null; previous: unknown; next: unknown; reason: string }, familyId: number, members: { id: number; status: boolean }[], revision: string) {
  const before = object(source.previous), after = object(source.next);
  if (source.familyId !== familyId || after.familyId !== familyId || after.operation !== "FAMILY_DEACTIVATE"
    || typeof before.revision !== "string" || !/^[a-f0-9]{64}$/.test(before.revision)
    || after.revision !== revision || typeof after.operationKey !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(after.operationKey)
    || after.requestHash !== digest({familyId,operationKey:after.operationKey,expectedRevision:before.revision,reason:source.reason,confirmed:true})
    || !Array.isArray(before.variants) || !Array.isArray(after.variants) || !members.length || members.some(p=>p.status)) throw blocked();
  const previous = before.variants.map(object), next = after.variants.map(object);
  const currentIds = members.map(p=>p.id).sort((a,b)=>a-b);
  if (previous.some(p=>typeof p.status!=="boolean") || next.some(p=>p.status!==false)
    || !same(ids(previous.map(p=>p.id)),currentIds) || !same(ids(next.map(p=>p.id)),currentIds)) throw blocked();
  const productIds = ids(previous.filter(p=>p.status).map(p=>p.id))!;
  const inactiveIds = ids(previous.filter(p=>!p.status).map(p=>p.id))!;
  if (!productIds.length || !same(ids(after.productIds),productIds) || !same(ids(after.previouslyInactiveProductIds),inactiveIds)) throw blocked();
  return { productIds, previouslyInactiveProductIds: inactiveIds };
}

export function validateFamilyActivation(input: unknown) {
  const b = object(input);
  const { sourceEventId, ...command } = b;
  if (!Number.isSafeInteger(sourceEventId) || Number(sourceEventId) < 1) throw new FamilyError("Desactivación de origen inválida",400);
  return { ...validateFamilyDeactivation(command), sourceEventId: Number(sourceEventId) };
}
async function authorizeAndLock(tx: DbTransaction, actorId: number) {
  const [actor] = await tx.select({role:roles.name,status:users.status}).from(users).innerJoin(roles,eq(roles.id,users.roleId)).where(eq(users.id,actorId));
  if (!actor || actor.role!=="ADMIN" || actor.status!=="ACTIVE") throw new FamilyError("Solo ADMIN activo puede activar una familia",403);
  await acquirePromotionPricingLock(tx);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
}
async function candidate(tx: DbTransaction, id: number) {
  const [family] = await tx.select().from(families).where(eq(families.id,id)).for("update");
  if (!family) throw new FamilyError("Familia no encontrada",404);
  if (family.archivedAt) throw blocked();
  const members = await tx.select().from(products).where(eq(products.familyId,id)).orderBy(asc(products.id)).for("update");
  const snapshot = await bundleSnapshot(id,tx);
  const [source] = await tx.select().from(events).where(sql`${events.familyId}=${id} and ${events.next}->>'operation'='FAMILY_DEACTIVATE'`).orderBy(desc(events.id)).limit(1);
  if (!source) throw blocked();
  const restored = await tx.select({id:events.id}).from(events).where(sql`${events.next}->>'operation'='FAMILY_ACTIVATE' and ${events.next}->>'sourceEventId'=${String(source.id)}`).limit(1);
  if (restored.length) throw blocked();
  const selection = activationSourceProducts(source,id,members,snapshot.revision);
  for (const p of members.filter(p=>selection.productIds.includes(p.id))) {
    if (p.categoryId!==family.categoryId || (p.brand??"").trim().toLowerCase()!==(family.brand??"").trim().toLowerCase()) throw blocked();
    try { await assertProductPromotionCompatibilityTx(tx,{productId:p.id,productName:p.name,categoryId:p.categoryId,status:true}); }
    catch(e) { if(e instanceof PromotionError) throw new FamilyError(e.message,409); throw e; }
  }
  return {family,members,source,revision:snapshot.revision,...selection};
}
function validFamily(id: number) { if (!Number.isSafeInteger(id)||id<1) throw new FamilyError("Familia inválida",400); }
export async function getFamilyActivationEligibility(id: number, actorId: number) {
  validFamily(id);
  return db.transaction(async tx=>{
    await authorizeAndLock(tx,actorId);
    try { const c=await candidate(tx,id); return {eligible:true as const,familyId:id,familyName:c.family.name,sourceEventId:c.source.id,expectedRevision:c.revision,productIds:c.productIds,previouslyInactiveProductIds:c.previouslyInactiveProductIds}; }
    catch(e) { if(e instanceof FamilyError && e.statusCode===409) return {eligible:false as const,reason:e.message}; throw e; }
  });
}
export async function familyActivationOperation(id: number, actorId: number, input?: unknown, key?: string) {
  validFamily(id);
  const body=input===undefined?null:validateFamilyActivation(input), operationKey=body?.operationKey||key||"";
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey)) throw new FamilyError("Clave inválida",400);
  const requestHash=body?digest({familyId:id,...body}):null;
  return db.transaction(async tx=>{
    await authorizeAndLock(tx,actorId);
    const [prior]=await tx.select().from(events).where(sql`${events.next}->>'operation'='FAMILY_ACTIVATE' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
    if(prior) {
      if(prior.userId!==actorId) throw new FamilyError("Operación de otro administrador",403);
      if(prior.familyId!==id || (body && object(prior.next).requestHash!==requestHash)) throw new FamilyError("La clave ya identifica otros datos",409);
      return {...object(prior.next),replayed:true};
    }
    if(!body) return null;
    const c=await candidate(tx,id);
    if(c.source.id!==body.sourceEventId || c.revision!==body.expectedRevision) throw new FamilyError("La familia cambió. Cierra y revisa nuevamente antes de confirmar.",409);
    for(const p of c.members.filter(p=>c.productIds.includes(p.id))) await editProductInTransaction(tx,p.id,{status:true},actorId,p.updatedAt!.toISOString());
    const result={operation:"FAMILY_ACTIVATE",operationKey,requestHash,familyId:id,familyName:c.family.name,sourceEventId:c.source.id,productIds:c.productIds,previouslyInactiveProductIds:c.previouslyInactiveProductIds,revision:(await bundleSnapshot(id,tx)).revision};
    await tx.insert(events).values({familyId:id,productId:null,userId:actorId,reason:body.reason,
      previous:{revision:c.revision,variants:c.members.map(p=>({id:p.id,name:p.name,status:p.status}))},
      next:{...result,variants:c.members.map(p=>({id:p.id,name:p.name,status:c.productIds.includes(p.id)}))}});
    return {...result,replayed:false};
  });
}

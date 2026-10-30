import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productFamiliesTable as families, productsTable as products, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { FamilyError } from "./productFamilies.service.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";
import { assertProductPromotionCompatibilityTx, PromotionError } from "../promotions/promotions.service.js";

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
export function validateFamilyBrand(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["brand", "reason", "expectedRevision", "operationKey", "confirmed"].includes(k))
    || typeof b.brand !== "string" || /[\u0000-\u001f\u007f]/.test(b.brand) || !normalize(b.brand) || normalize(b.brand).length > 100
    || typeof b.reason !== "string" || b.reason.trim().length < 8 || b.reason.trim().length > 500
    || typeof b.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(b.expectedRevision)
    || typeof b.operationKey !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey) || b.confirmed !== true) throw new FamilyError("Confirme la misma marca comercial, un nombre de 1–100 caracteres y motivo de 8–500, con su revisión", 400);
  return { brand: normalize(b.brand), reason: b.reason.trim(), expectedRevision: b.expectedRevision, operationKey: b.operationKey, confirmed: true };
}

export async function familyBrandOperation(id: number, actorId: number, input?: unknown, key?: string) {
  if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("Familia inválida", 400);
  const b = input === undefined ? null : validateFamilyBrand(input), operationKey = b?.operationKey || key || "";
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey)) throw new FamilyError("Clave inválida", 400);
  const requestHash = b ? createHash("sha256").update(JSON.stringify({ familyId: id, ...b })).digest("hex") : null;
  try { return await db.transaction(async tx => {
    const [u] = await tx.select({ role: roles.name, status: users.status }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, actorId));
    if (!u || u.role !== "ADMIN" || u.status !== "ACTIVE") throw new FamilyError("Solo ADMIN puede corregir marcas", 403);
    const schema = await tx.execute<{ ready: boolean }>(sql`select to_regprocedure('fyf_verify_family_brand_audit()') is not null as ready`);
    if (!schema.rows[0].ready) throw new FamilyError("La corrección de marca requiere aplicar previamente la migración 0037 en este entorno. No se modificó ningún dato");
    await acquirePromotionPricingLock(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [prior] = await tx.select().from(events).where(sql`${events.next}->>'operation'='FAMILY_BRAND_CORRECTION' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
    if (prior) {
      if (prior.userId !== actorId) throw new FamilyError("Operación de otro administrador", 403);
      if (prior.familyId !== id || (b && (prior.next as { requestHash: string }).requestHash !== requestHash)) throw new FamilyError("La clave ya identifica otros datos");
      return { ...prior.next as object, replayed: true };
    }
    if (!b) return null;
    const [family] = await tx.select().from(families).where(eq(families.id, id)).for("update");
    if (!family) throw new FamilyError("Familia no encontrada", 404);
    if (family.archivedAt) throw new FamilyError("Reactive la familia antes de corregir su marca");
    const members = await tx.select().from(products).where(eq(products.familyId, id)).orderBy(asc(products.id)).for("update");
    const snapshot = await bundleSnapshot(id, tx);
    if (snapshot.revision !== b.expectedRevision) throw new FamilyError("La familia o sus artículos cambiaron. Recargue y revise antes de confirmar");
    if (!members.length) throw new FamilyError("La familia no tiene artículos asociados", 400);
    if (normalize(family.brand || "").toLocaleLowerCase("es") === b.brand.toLocaleLowerCase("es")) throw new FamilyError("La marca normalizada no cambia", 400);
    // Brand is not a uniqueness key. Existing category/name, barcode and combination keys remain unchanged.
    for (const p of members) {
      await tx.execute(sql`select fyf_assert_product_name_ready(${p.id})`);
      await tx.execute(sql`select fyf_verify_variant(${p.id})`);
      await assertProductPromotionCompatibilityTx(tx, { productId: p.id, productName: p.name, categoryId: p.categoryId, status: true });
    }
    const state = (await tx.execute<{ state: unknown }>(sql`select fyf_dimension_state(${id}) state`)).rows[0].state;
    const [authorization] = await tx.insert(events).values({ familyId: id, productId: null, userId: actorId, reason: b.reason,
      previous: { state, revision: snapshot.revision, transactionId: (await tx.execute<{ id: string }>(sql`select pg_current_xact_id()::text id`)).rows[0].id },
      next: { operation: "FAMILY_BRAND_AUTHORIZATION", operationKey, requestHash, brand: b.brand } }).returning();
    const updatedAt = new Date(Math.max(Date.now(), family.updatedAt.getTime() + 1, ...members.map(p => (p.updatedAt?.getTime() || 0) + 1)));
    await tx.update(families).set({ brand: b.brand, updatedAt }).where(eq(families.id, id));
    await tx.update(products).set({ brand: b.brand, updatedAt }).where(eq(products.familyId, id));
    const { revision } = await bundleSnapshot(id, tx);
    const result = { operation: "FAMILY_BRAND_CORRECTION", familyId: id, operationKey, requestHash, authorizationId: authorization.id, previousBrand: family.brand, brand: b.brand, productIds: members.map(p => p.id), revision };
    await tx.insert(events).values({ familyId: id, productId: null, userId: actorId, reason: b.reason, previous: { revision: snapshot.revision }, next: result });
    return { ...result, replayed: false };
  }); } catch (e) {
    if (e instanceof FamilyError) throw e;
    if (e instanceof PromotionError) throw new FamilyError(e.message);
    const error = e as { cause?: { code?: string; message?: string }; code?: string; message?: string }, detail = error.cause || error;
    if (detail.code === "23514") throw new FamilyError((detail.message || "Dependencia comercial pendiente").replaceAll("corregir el nombre", "corregir la marca").replaceAll("corregir este nombre", "corregir esta marca"));
    if (["23505", "40P01", "40001"].includes(detail.code || "")) throw new FamilyError("Conflicto concurrente o de unicidad; no se aplicó la corrección");
    throw e;
  }
}

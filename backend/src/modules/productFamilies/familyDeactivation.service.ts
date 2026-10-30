import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productFamiliesTable as families, productsTable as products, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";
import { editProductInTransaction } from "../products/products.service.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { assertNoPendingIdentityCommitments, FamilyError } from "./productFamilies.service.js";

export function validateFamilyDeactivation(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["operationKey", "expectedRevision", "reason", "confirmed"].includes(k))
    || typeof b.operationKey !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)
    || typeof b.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(b.expectedRevision)
    || typeof b.reason !== "string" || b.reason.trim().length < 8 || b.reason.trim().length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(b.reason)
    || b.confirmed !== true) throw new FamilyError("Confirma la familia, revisión y un motivo de 8 a 500 caracteres", 400);
  return { operationKey: b.operationKey, expectedRevision: b.expectedRevision, reason: b.reason.trim(), confirmed: true };
}

export async function familyDeactivationOperation(id: number, actorId: number, input?: unknown, key?: string) {
  if (!Number.isSafeInteger(id) || id < 1) throw new FamilyError("Familia inválida", 400);
  const body = input === undefined ? null : validateFamilyDeactivation(input), operationKey = body?.operationKey || key || "";
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey)) throw new FamilyError("Clave inválida", 400);
  const requestHash = body ? createHash("sha256").update(JSON.stringify({ familyId: id, ...body })).digest("hex") : null;
  return db.transaction(async tx => {
    const [actor] = await tx.select({ role: roles.name, status: users.status }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, actorId));
    if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new FamilyError("Solo ADMIN puede desactivar una familia", 403);
    // Same order as SKU editing and creation of commercial commitments.
    await acquirePromotionPricingLock(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [prior] = await tx.select().from(events).where(sql`${events.next}->>'operation'='FAMILY_DEACTIVATE' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
    if (prior) {
      if (prior.userId !== actorId) throw new FamilyError("Operación de otro administrador", 403);
      if (prior.familyId !== id || (body && (prior.next as { requestHash: string }).requestHash !== requestHash)) throw new FamilyError("La clave ya identifica otros datos");
      return { ...prior.next as object, replayed: true };
    }
    if (!body) return null;
    const [family] = await tx.select().from(families).where(eq(families.id, id)).for("update");
    if (!family) throw new FamilyError("Familia no encontrada", 404);
    if (family.archivedAt) throw new FamilyError("La familia está archivada; no se modificó ningún artículo");
    const members = await tx.select().from(products).where(eq(products.familyId, id)).orderBy(asc(products.id)).for("update");
    const snapshot = await bundleSnapshot(id, tx);
    if (snapshot.revision !== body.expectedRevision) throw new FamilyError("La familia o sus variantes cambiaron. Cierra y revisa nuevamente antes de confirmar");
    const affected = members.filter(p => p.status);
    if (!affected.length) throw new FamilyError("La familia no tiene variantes activas para desactivar");
    for (const p of affected) {
      try { await assertNoPendingIdentityCommitments(tx, p.id); }
      catch (e) { if (e instanceof FamilyError) throw new FamilyError(`No se puede desactivar Producto #${p.id}: ${e.message.replaceAll("cambiar la identidad del artículo", "desactivarlo").replaceAll("cambiar la identidad de este artículo", "desactivarlo")}`); throw e; }
    }
    for (const p of affected) await editProductInTransaction(tx, p.id, { status: false }, actorId, p.updatedAt!.toISOString());
    const { revision } = await bundleSnapshot(id, tx);
    const result = { operation: "FAMILY_DEACTIVATE", operationKey, requestHash, familyId: id, familyName: family.name,
      productIds: affected.map(p => p.id), previouslyInactiveProductIds: members.filter(p => !p.status).map(p => p.id), revision };
    await tx.insert(events).values({ familyId: id, productId: null, userId: actorId, reason: body.reason,
      previous: { revision: snapshot.revision, variants: members.map(p => ({ id: p.id, name: p.name, status: p.status })) },
      next: { ...result, variants: members.map(p => ({ id: p.id, name: p.name, status: false })) } });
    return { ...result, replayed: false };
  });
}

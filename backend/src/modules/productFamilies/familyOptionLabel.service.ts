import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productFamiliesTable as families, productsTable as products, familyAttributeOptionsTable as options, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { FamilyError } from "./productFamilies.service.js";
import { acquirePromotionPricingLock } from "../promotions/promotions.repository.js";

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
export function validateOptionLabelCorrection(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["label", "reason", "expectedRevision", "operationKey", "confirmed"].includes(k))
    || typeof b.label !== "string" || /[\u0000-\u001f\u007f]/.test(b.label) || !normalize(b.label) || normalize(b.label).length > 100
    || typeof b.reason !== "string" || b.reason.trim().length < 8 || b.reason.trim().length > 500
    || typeof b.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(b.expectedRevision)
    || typeof b.operationKey !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey) || b.confirmed !== true) throw new FamilyError("Confirme una etiqueta de 1–100 caracteres, motivo de 8–500 y revisión vigente", 400);
  return { label: normalize(b.label), reason: b.reason.trim(), expectedRevision: b.expectedRevision, operationKey: b.operationKey, confirmed: true };
}
export async function optionLabelOperation(familyId: number, attributeId: number, optionId: number, actorId: number, input?: unknown, key?: string) {
  if (![familyId, attributeId, optionId].every(id => Number.isSafeInteger(id) && id > 0)) throw new FamilyError("Identificador inválido", 400);
  const b = input === undefined ? null : validateOptionLabelCorrection(input), operationKey = b?.operationKey || key || "";
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(operationKey)) throw new FamilyError("Clave inválida", 400);
  const requestHash = b ? createHash("sha256").update(JSON.stringify({ familyId, attributeId, optionId, ...b })).digest("hex") : null;
  try { return await db.transaction(async tx => {
    const [actor] = await tx.select({ role: roles.name, status: users.status }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, actorId));
    if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new FamilyError("Solo ADMIN puede corregir etiquetas", 403);
    const schema = await tx.execute<{ ready: boolean }>(sql`select to_regprocedure('fyf_verify_option_label_audit()') is not null as ready`);
    if (!schema.rows[0].ready) throw new FamilyError("La corrección de etiquetas requiere la migración 0038. No se modificó ningún dato");
    await acquirePromotionPricingLock(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [prior] = await tx.select().from(events).where(sql`${events.next}->>'operation'='OPTION_LABEL_CORRECTION' and ${events.next}->>'operationKey'=${operationKey}`).limit(1);
    if (prior) {
      const previous = prior.next as { requestHash: string; attributeId: number; optionId: number };
      if (prior.userId !== actorId) throw new FamilyError("Operación de otro administrador", 403);
      if (prior.familyId !== familyId || previous.attributeId !== attributeId || previous.optionId !== optionId || (b && previous.requestHash !== requestHash)) throw new FamilyError("La clave ya identifica otros datos");
      return { ...prior.next as object, replayed: true };
    }
    if (!b) return null;
    const [family] = await tx.select().from(families).where(eq(families.id, familyId)).for("update");
    if (!family) throw new FamilyError("Familia no encontrada", 404);
    if (family.archivedAt) throw new FamilyError("Reactive la familia antes de corregir etiquetas");
    await tx.select().from(products).where(eq(products.familyId, familyId)).orderBy(asc(products.id)).for("update");
    const snapshot = await bundleSnapshot(familyId, tx);
    if (snapshot.revision !== b.expectedRevision) throw new FamilyError("La familia o sus artículos cambiaron. Recargue y revise antes de confirmar");
    const attribute = snapshot.family.attributes.find(a => a.id === attributeId), option = attribute?.options.find(o => o.id === optionId);
    if (!attribute || !option) throw new FamilyError("Opción no encontrada en este atributo y familia", 404);
    if (attribute.unitCode) throw new FamilyError("Un valor cuantitativo no es una etiqueta descriptiva corregible. Conserva su magnitud; para otro valor crea una opción y un SKU nuevo cuando corresponda");
    await tx.select().from(options).where(eq(options.id, optionId)).for("update");
    if (normalize(option.label).toLocaleLowerCase("es") === b.label.toLocaleLowerCase("es")) throw new FamilyError("La etiqueta normalizada no cambia", 400);
    if (attribute.options.some(o => o.id !== optionId && normalize(o.label).toLocaleLowerCase("es") === b.label.toLocaleLowerCase("es"))) throw new FamilyError("Ya existe una opción con esa etiqueta en el atributo");
    const affected = await tx.execute<{ id: number }>(sql`select product_id id from product_variant_values where family_id=${familyId} and attribute_id=${attributeId} and option_id=${optionId} order by product_id`);
    for (const { id } of affected.rows) await tx.execute(sql`select fyf_assert_product_name_ready(${id})`);
    const state = (await tx.execute<{ state: unknown }>(sql`select fyf_dimension_state(${familyId}) state`)).rows[0].state;
    const productIds = affected.rows.map(p => p.id);
    const [authorization] = await tx.insert(events).values({ familyId, productId: null, userId: actorId, reason: b.reason,
      previous: { state, revision: snapshot.revision, transactionId: (await tx.execute<{ id: string }>(sql`select pg_current_xact_id()::text id`)).rows[0].id },
      next: { operation: "OPTION_LABEL_AUTHORIZATION", operationKey, requestHash, attributeId, optionId, label: b.label, productIds } }).returning();
    await tx.update(options).set({ label: b.label }).where(eq(options.id, optionId));
    await tx.update(families).set({ updatedAt: new Date(Math.max(Date.now(), family.updatedAt.getTime() + 1)) }).where(eq(families.id, familyId));
    const { revision } = await bundleSnapshot(familyId, tx);
    const result = { operation: "OPTION_LABEL_CORRECTION", familyId, attributeId, optionId, operationKey, requestHash, authorizationId: authorization.id, previousLabel: option.label, label: b.label, productIds, revision };
    await tx.insert(events).values({ familyId, productId: null, userId: actorId, reason: b.reason, previous: { revision: snapshot.revision }, next: result });
    return { ...result, replayed: false };
  }); } catch (e) {
    if (e instanceof FamilyError) throw e;
    const error = e as { cause?: { code?: string; message?: string }; code?: string; message?: string }, detail = error.cause || error;
    if (detail.code === "23514") throw new FamilyError((detail.message || "No se pudo verificar la corrección").replaceAll("corregir el nombre", "corregir la etiqueta").replaceAll("corregir este nombre", "corregir esta etiqueta"));
    if (["23505", "40P01", "40001"].includes(detail.code || "")) throw new FamilyError("Conflicto concurrente o etiqueta duplicada. No se aplicó la corrección");
    throw e;
  }
}

import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { familyAttributesTable as attributes, productFamiliesTable as families, productFamilyEventsTable as events,
  productsTable as products, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { bundleSnapshot } from "./productBundle.service.js";
import { FamilyError } from "./productFamilies.service.js";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const identity = (value: string) => normalize(value).toLocaleLowerCase("es");
const validKey = (key: string) => /^[a-zA-Z0-9-]{20,80}$/.test(key);
export function validateAttributeRename(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyError("Revise el renombrado del atributo", 400);
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["name", "reason", "expectedRevision", "operationKey", "confirmed"].includes(key))
    || typeof body.name !== "string" || !normalize(body.name) || normalize(body.name).length > 60 || /[\u0000-\u001f\u007f]/.test(normalize(body.name))
    || typeof body.reason !== "string" || body.reason.trim().length < 8 || body.reason.trim().length > 500
    || typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)
    || typeof body.operationKey !== "string" || !validKey(body.operationKey) || body.confirmed !== true) {
    throw new FamilyError("Confirme un nombre de hasta 60 caracteres y un motivo de entre 8 y 500 caracteres, con la revisión vigente", 400);
  }
  return { name: normalize(body.name), reason: body.reason.trim(), expectedRevision: body.expectedRevision,
    operationKey: body.operationKey, confirmed: true as const };
}

async function authorizeAdmin(tx: DbTransaction, actorId: number) {
  const [actor] = await tx.select({ role: roles.name, status: users.status }).from(users)
    .innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, actorId));
  if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new FamilyError("Solo ADMIN puede renombrar atributos", 403);
}
async function priorOperation(tx: DbTransaction, key: string) {
  const [event] = await tx.select().from(events).where(sql`${events.next}->>'operationKey'=${key}`).limit(1);
  return event;
}
function operationResult(event: typeof events.$inferSelect, familyId: number, attributeId: number, actorId: number) {
  const next = event.next as { operation: string; attributeId: number; name: string; revision: string };
  if (event.userId !== actorId) throw new FamilyError("La operación pertenece a otro administrador", 403);
  if (next.operation !== "ATTRIBUTE_RENAME" || event.familyId !== familyId || next.attributeId !== attributeId) {
    throw new FamilyError("La clave ya identifica otra operación");
  }
  return { familyId, attributeId, previousName: (event.previous as { name: string }).name,
    name: next.name, revision: next.revision, replayed: true };
}
function validateIds(familyId: number, attributeId: number) {
  if (![familyId, attributeId].every(id => Number.isSafeInteger(id) && id > 0)) throw new FamilyError("Identificador inválido", 400);
}
export async function getAttributeRenameOperation(familyId: number, attributeId: number, key: string, actorId: number) {
  validateIds(familyId, attributeId);
  if (!validKey(key)) throw new FamilyError("Operación inválida", 400);
  return db.transaction(async tx => {
    await authorizeAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const event = await priorOperation(tx, key);
    return event ? operationResult(event, familyId, attributeId, actorId) : null;
  });
}
export async function renameFamilyAttribute(familyId: number, attributeId: number, input: unknown, actorId: number) {
  validateIds(familyId, attributeId);
  const body = validateAttributeRename(input);
  const requestHash = createHash("sha256").update(JSON.stringify({ familyId, attributeId, ...body })).digest("hex");
  return db.transaction(async tx => {
    await authorizeAdmin(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const prior = await priorOperation(tx, body.operationKey);
    if (prior) {
      const result = operationResult(prior, familyId, attributeId, actorId);
      if ((prior.next as { requestHash: string }).requestHash !== requestHash) throw new FamilyError("La clave ya se utilizó con otros datos; consulte su resultado");
      return result;
    }
    await tx.select({ id: families.id }).from(families).where(eq(families.id, familyId)).for("update");
    await tx.select({ id: products.id }).from(products).where(eq(products.familyId, familyId)).orderBy(asc(products.id)).for("update");
    const snapshot = await bundleSnapshot(familyId, tx);
    if (snapshot.revision !== body.expectedRevision) throw new FamilyError("La familia o sus variantes cambiaron. Recargue y revise el nombre antes de confirmar; no se aplicaron cambios.");
    if (snapshot.family.archivedAt) throw new FamilyError("Reactive la familia antes de renombrar sus atributos");
    const attribute = snapshot.family.attributes.find(item => item.id === attributeId);
    if (!attribute) throw new FamilyError("Atributo no encontrado en esta familia", 404);
    if (identity(attribute.name) === identity(body.name)) throw new FamilyError("El nombre normalizado no cambia; no es necesario registrar un renombrado", 400);
    if (snapshot.family.attributes.some(item => item.id !== attributeId && identity(item.name) === identity(body.name))) {
      throw new FamilyError("Ya existe un atributo con ese nombre en la familia");
    }
    await tx.update(attributes).set({ name: body.name }).where(eq(attributes.id, attributeId));
    await tx.update(families).set({ updatedAt: new Date() }).where(eq(families.id, familyId));
    const { revision } = await bundleSnapshot(familyId, tx);
    await tx.insert(events).values({ familyId, productId: null, userId: actorId, reason: body.reason,
      previous: { attributeId, name: attribute.name, revision: snapshot.revision },
      next: { operation: "ATTRIBUTE_RENAME", operationKey: body.operationKey, requestHash, attributeId, name: body.name, revision } });
    return { familyId, attributeId, previousName: attribute.name, name: body.name, revision, replayed: false };
  });
}

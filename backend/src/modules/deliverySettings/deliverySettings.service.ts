import { eq, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { deliveryPolicyRevisionsTable as revisions, deliverySettingsTable as settings, usersTable } from "../../db/schema/index.js";
import { DeliveryPolicyError } from "./deliveryPricing.js";

export async function currentDeliveryPolicy(tx: DbTransaction) {
  // Shared across quoting/checkout; saving takes the exclusive counterpart.
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext('fyf-delivery-policy'))`);
  const [row] = await tx.select({ policy: revisions }).from(settings)
    .innerJoin(revisions, eq(settings.currentRevisionId, revisions.id)).where(eq(settings.id, 1));
  return row?.policy ?? null;
}

export async function getDeliverySettings() {
  return db.transaction(async tx => {
    const policy = await currentDeliveryPolicy(tx);
    if (!policy) return null;
    const [actor] = await tx.select({ names: usersTable.names, surnames: usersTable.surnames }).from(usersTable).where(eq(usersTable.id, policy.createdBy));
    return { ...policy, responsible: actor ? `${actor.names} ${actor.surnames}` : "Usuario autorizado" };
  });
}

export function validateDeliverySettings(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DeliveryPolicyError("Configuración inválida", 400);
  const input = body as Record<string, unknown>;
  const allowed = ["expectedRevisionId", "pickupEnabled", "deliveryEnabled", "flatFee", "minimumProductsTotal", "freeShippingFrom", "isDemo"];
  if (Object.keys(input).some(k => !allowed.includes(k)) || allowed.some(k => !(k in input))) throw new DeliveryPolicyError("La configuración contiene campos faltantes o no permitidos", 400);
  if (input.expectedRevisionId !== null && (!Number.isSafeInteger(input.expectedRevisionId) || Number(input.expectedRevisionId) < 1)) throw new DeliveryPolicyError("Versión inválida", 400);
  for (const k of ["pickupEnabled", "deliveryEnabled", "isDemo"]) if (typeof input[k] !== "boolean") throw new DeliveryPolicyError("Las opciones deben ser verdaderas o falsas", 400);
  const amount = (key: string, nullable = false) => {
    const value = input[key];
    if (nullable && value === null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (key === "freeShippingFrom" ? 1 : 0) || value > 9999999999) throw new DeliveryPolicyError("Los montos deben ser pesos enteros válidos, sin decimales", 400);
    return value.toFixed(2);
  };
  return { expectedRevisionId: input.expectedRevisionId as number | null,
    pickupEnabled: input.pickupEnabled as boolean, deliveryEnabled: input.deliveryEnabled as boolean,
    isDemo: input.isDemo as boolean, flatFee: amount("flatFee")!,
    minimumProductsTotal: amount("minimumProductsTotal", true), freeShippingFrom: amount("freeShippingFrom", true) };
}

export async function saveDeliverySettings(actorId: number, body: unknown) {
  const { expectedRevisionId, ...values } = validateDeliverySettings(body);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-delivery-policy'))`);
    await tx.insert(settings).values({ id: 1 }).onConflictDoNothing();
    const [current] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
    if (current.currentRevisionId !== expectedRevisionId) throw new DeliveryPolicyError("Otro usuario autorizado cambió la configuración. Cierra y vuelve a abrir el formulario para revisar la versión vigente.");
    const [previous] = current.currentRevisionId ? await tx.select().from(revisions).where(eq(revisions.id, current.currentRevisionId)) : [];
    const [revision] = await tx.insert(revisions).values({ ...values, version: (previous?.version ?? 0) + 1, createdBy: actorId }).returning();
    await tx.update(settings).set({ currentRevisionId: revision.id }).where(eq(settings.id, 1));
    return revision;
  });
}

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { productsTable as products, productFamilyEventsTable as events, usersTable as users, rolesTable as roles } from "../../db/schema/index.js";
import { ProductError } from "./products.service.js";

const normalize = (name: string) => name.trim().replace(/\s+/g, " ");
const validKey = (key: string) => /^[a-zA-Z0-9-]{20,80}$/.test(key);
export function validateProductNameCorrection(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProductError("Corrección inválida", 400);
  const b = input as Record<string, unknown>;
  if (Object.keys(b).some(k => !["name", "reason", "expectedRevision", "operationKey", "confirmed"].includes(k))
    || typeof b.name !== "string" || /[\u0000-\u001f\u007f]/.test(b.name) || normalize(b.name).length < 2 || normalize(b.name).length > 150
    || typeof b.reason !== "string" || b.reason.trim().length < 8 || b.reason.trim().length > 500
    || typeof b.expectedRevision !== "string" || !Number.isFinite(Date.parse(b.expectedRevision)) || new Date(b.expectedRevision).toISOString() !== b.expectedRevision
    || typeof b.operationKey !== "string" || !validKey(b.operationKey) || b.confirmed !== true) {
    throw new ProductError("Confirme el mismo artículo, un nombre de 2 a 150 caracteres y motivo de 8 a 500 caracteres, con su revisión", 400);
  }
  return { name: normalize(b.name), reason: b.reason.trim(), expectedRevision: b.expectedRevision, operationKey: b.operationKey, confirmed: true };
}
async function authorize(tx: DbTransaction, actorId: number) {
  const [u] = await tx.select({ role: roles.name, status: users.status }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, actorId));
  if (!u || u.role !== "ADMIN" || u.status !== "ACTIVE") throw new ProductError("Solo ADMIN puede corregir nombres", 403);
}
function validateId(id: number) { if (!Number.isSafeInteger(id) || id < 1) throw new ProductError("Producto inválido", 400); }
async function prior(tx: DbTransaction, key: string) {
  const [event] = await tx.select().from(events).where(sql`${events.next}->>'operation'='PRODUCT_NAME_CORRECTION' and ${events.next}->>'operationKey'=${key}`).limit(1);
  return event;
}
function result(event: typeof events.$inferSelect, id: number, actorId: number) {
  if (event.userId !== actorId) throw new ProductError("Operación de otro administrador", 403);
  if (event.productId !== id) throw new ProductError("La clave corresponde a otro producto", 409);
  const next = event.next as { name: string; revision: string; requestHash: string };
  return { productId: id, previousName: (event.previous as { product: { name: string } }).product.name, name: next.name, revision: next.revision, replayed: true };
}
export async function getProductNameCorrection(id: number, key: string, actorId: number) {
  validateId(id); if (!validKey(key)) throw new ProductError("Operación inválida", 400);
  return db.transaction(async tx => {
    await authorize(tx, actorId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const event = await prior(tx, key); return event ? result(event, id, actorId) : null;
  });
}
export async function correctProductName(id: number, input: unknown, actorId: number) {
  validateId(id); const b = validateProductNameCorrection(input);
  const requestHash = createHash("sha256").update(JSON.stringify({ id, ...b })).digest("hex");
  try {
    return await db.transaction(async tx => {
      await authorize(tx, actorId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
      const event = await prior(tx, b.operationKey);
      if (event) {
        const replay = result(event, id, actorId);
        if ((event.next as { requestHash: string }).requestHash !== requestHash) throw new ProductError("La clave ya se usó con otros datos", 409);
        return replay;
      }
      const [p] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!p) throw new ProductError("Producto no encontrado", 404);
      if (p.updatedAt?.toISOString() !== b.expectedRevision) throw new ProductError("El producto cambió. Recarga y revisa antes de corregir su nombre", 409);
      if (normalize(p.name).toLocaleLowerCase("es") === b.name.toLocaleLowerCase("es")) throw new ProductError("El nombre normalizado no cambia", 400);
      await tx.execute(sql`select fyf_assert_product_name_ready(${id})`);
      const duplicate = await tx.execute(sql`select id from products where id<>${id} and category_id=${p.categoryId} and lower(regexp_replace(btrim(name),'\\s+',' ','g'))=lower(${b.name}) limit 1`);
      if (duplicate.rows.length) throw new ProductError("Ya existe un producto con ese nombre en la categoría", 409);
      const raw = await tx.execute<{ product: unknown; transaction_id: string }>(sql`select to_jsonb(p) product,pg_current_xact_id()::text transaction_id from products p where id=${id}`);
      const updatedAt = new Date(Math.max(Date.now(), (p.updatedAt?.getTime() ?? 0) + 1));
      await tx.insert(events).values({ productId: id, familyId: p.familyId, userId: actorId, reason: b.reason,
        previous: { product: raw.rows[0].product, transactionId: raw.rows[0].transaction_id },
        next: { operation: "PRODUCT_NAME_CORRECTION", operationKey: b.operationKey, requestHash, name: b.name, revision: updatedAt.toISOString() } });
      await tx.update(products).set({ name: b.name, updatedAt }).where(eq(products.id, id));
      return { productId: id, previousName: p.name, name: b.name, revision: updatedAt.toISOString(), replayed: false };
    });
  } catch (error) {
    if (error instanceof ProductError) throw error;
    const e = error as { cause?: { code?: string; message?: string }; code?: string; message?: string };
    const detail = e.cause || e;
    if (["23514", "23505", "40P01", "40001"].includes(detail.code || "")) throw new ProductError(detail.code === "23514" ? detail.message! : "Conflicto concurrente o nombre duplicado. No se aplicó la corrección; revisa antes de reintentar", 409);
    throw error;
  }
}

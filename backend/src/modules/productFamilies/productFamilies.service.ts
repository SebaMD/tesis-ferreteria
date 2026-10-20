import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { familyAttributesTable as attrs, familyAttributeOptionsTable as opts, productFamiliesTable as families,
  productVariantValuesTable as values, productFamilyEventsTable as events, productsTable as products } from "../../db/schema/index.js";

type Executor = typeof db | DbTransaction;
export class FamilyError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}
const normalized = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export type FamilyBody = { name: string; description: string | null; categoryId: number; brand: string | null;
  attributes: Array<{ id?: number; name: string; options: Array<{ id?: number; label: string }> }> };

export function validateFamilyBody(input: unknown): FamilyBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyError("Debe enviar una familia válida", 400);
  const b = input as Record<string, unknown>;
  if (Object.keys(b).some((k) => !["name", "description", "categoryId", "brand", "attributes"].includes(k))) throw new FamilyError("Campo de familia no permitido", 400);
  const text = (v: unknown, max: number, required = true) => {
    if (v == null && !required) return "";
    if (typeof v !== "string") throw new FamilyError("Texto de familia inválido", 400);
    const result = v.trim().replace(/\s+/g, " ");
    if ((required && !result) || result.length > max) throw new FamilyError("Texto vacío o demasiado largo", 400);
    return result;
  };
  const categoryId = Number(b.categoryId);
  if (!Number.isInteger(categoryId) || categoryId < 1 || !Array.isArray(b.attributes) || b.attributes.length < 1 || b.attributes.length > 8) throw new FamilyError("Seleccione categoría y entre 1 y 8 atributos", 400);
  const validId = (id: unknown) => id === undefined || (typeof id === "number" && Number.isInteger(id) && id > 0);
  const attributes = b.attributes.map((a: { id?: number; name: unknown; options: unknown }) => {
    if (!a || typeof a !== "object" || Array.isArray(a) || !validId(a.id) || Object.keys(a).some((key) => !["id", "name", "options"].includes(key))
      || !Array.isArray(a.options) || !a.options.length || a.options.length > 100) throw new FamilyError("Cada atributo necesita identificador y opciones válidas", 400);
    const options = a.options.map((o: { id?: number; label: unknown }) => {
      if (!o || typeof o !== "object" || Array.isArray(o) || !validId(o.id) || Object.keys(o).some((key) => !["id", "label"].includes(key))) throw new FamilyError("Opción inválida", 400);
      return { ...(o.id ? { id: o.id } : {}), label: text(o.label, 100) };
    });
    if (new Set(options.map((o) => normalized(o.label))).size !== options.length) throw new FamilyError("Hay opciones repetidas", 400);
    const optionIds = options.flatMap((o) => o.id ? [o.id] : []);
    if (new Set(optionIds).size !== optionIds.length) throw new FamilyError("Identificador de opción repetido", 400);
    return { ...(a.id ? { id: a.id } : {}), name: text(a.name, 60), options };
  });
  if (new Set(attributes.map((a) => normalized(a.name))).size !== attributes.length) throw new FamilyError("Hay atributos repetidos", 400);
  const attributeIds = attributes.flatMap((a) => a.id ? [a.id] : []);
  if (new Set(attributeIds).size !== attributeIds.length) throw new FamilyError("Identificador de atributo repetido", 400);
  return { name: text(b.name, 150), description: text(b.description, 3000, false) || null,
    categoryId, brand: text(b.brand, 100, false) || null, attributes };
}

export async function getFamily(id: number, executor: Executor = db) {
  const [family] = await executor.select().from(families).where(eq(families.id, id));
  if (!family) throw new FamilyError("Familia no encontrada", 404);
  const attributes = await executor.select().from(attrs).where(eq(attrs.familyId, id)).orderBy(asc(attrs.position), asc(attrs.id));
  const options = attributes.length ? await executor.select().from(opts).where(inArray(opts.attributeId, attributes.map((a) => a.id))).orderBy(asc(opts.position), asc(opts.id)) : [];
  return { ...family, attributes: attributes.map((a) => ({ ...a, options: options.filter((o) => o.attributeId === a.id) })) };
}
export async function listFamilies() {
  const rows = await db.select({ id: families.id }).from(families).orderBy(asc(families.name));
  return Promise.all(rows.map((f) => getFamilyForManagement(f.id)));
}

export async function familyManagementStatus(id: number, executor: Executor = db) {
  const result = await executor.execute<{ memberCount: number; hasHistory: boolean; hasProductHistory: boolean }>(sql`select
    (select count(*)::integer from ${products} where ${products.familyId}=${id}) as "memberCount",
    exists(select 1 from ${events} where ${events.familyId}=${id}
      or ${events.previous}->>'familyId'=${String(id)}
      or ${events.next}->>'familyId'=${String(id)}) as "hasHistory",
    exists(select 1 from ${events} where ${events.productId} is not null and (${events.familyId}=${id}
      or ${events.previous}->>'familyId'=${String(id)}
      or ${events.next}->>'familyId'=${String(id)})) as "hasProductHistory"`);
  return result.rows[0];
}

export async function getFamilyForManagement(id: number) {
  const family = await getFamily(id);
  const status = await familyManagementStatus(id);
  return { ...family, management: { ...status,
    state: family.archivedAt ? "ARCHIVED" : status.memberCount > 0 ? "IN_USE" : "EMPTY",
    canArchive: !family.archivedAt && status.memberCount === 0, canReactivate: Boolean(family.archivedAt) } };
}

export function validateFamilyStateBody(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyError("Confirme el cambio de estado", 400);
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["confirmed", "expectedUpdatedAt"].includes(key)) || body.confirmed !== true
    || typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    throw new FamilyError("Confirme el cambio y actualice la familia antes de continuar", 400);
  }
  return { confirmed: true as const, expectedUpdatedAt: new Date(body.expectedUpdatedAt).toISOString() };
}

export async function setFamilyArchived(id: number, archived: boolean, userId: number, expectedUpdatedAt: string) {
  await db.transaction(async (tx) => {
    // All family writes and associations share this lock and order.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    const [family] = await tx.select().from(families).where(eq(families.id, id)).for("update");
    if (!family) throw new FamilyError("Familia no encontrada", 404);
    if (family.updatedAt.toISOString() !== expectedUpdatedAt) throw new FamilyError("La familia cambió. Actualice sus datos y confirme nuevamente.");
    if (Boolean(family.archivedAt) === archived) throw new FamilyError(archived ? "La familia ya está archivada" : "La familia ya está activa");
    if (archived && (await familyManagementStatus(id, tx)).memberCount > 0) {
      throw new FamilyError("No se puede archivar: la familia tiene productos asociados, incluidos los inactivos. Primero desvincule los artículos mediante el procedimiento seguro.");
    }
    const archivedAt = archived ? new Date() : null;
    await tx.update(families).set({ archivedAt, updatedAt: new Date() }).where(eq(families.id, id));
    await tx.insert(events).values({ familyId: id, productId: null, userId,
      previous: { familyId: id, archivedAt: family.archivedAt?.toISOString() ?? null },
      next: { familyId: id, archivedAt: archivedAt?.toISOString() ?? null, operation: archived ? "ARCHIVE" : "REACTIVATE" },
      reason: archived ? "Archivado manual de familia sin productos" : "Reactivación manual de familia, sin recuperar asociaciones" });
  });
}

export type DetachFamilyBody = { expectedFamilyId: number; expectedOptionIds: number[]; reason: string; confirmed: true };

export function validateDetachFamilyBody(input: unknown): DetachFamilyBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyError("Confirme la desvinculación e indique su motivo", 400);
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["expectedFamilyId", "expectedOptionIds", "reason", "confirmed"].includes(key))
    || body.confirmed !== true || !Number.isSafeInteger(body.expectedFamilyId) || Number(body.expectedFamilyId) < 1
    || !Array.isArray(body.expectedOptionIds) || !body.expectedOptionIds.length || body.expectedOptionIds.length > 8
    || body.expectedOptionIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(body.expectedOptionIds).size !== body.expectedOptionIds.length
    || typeof body.reason !== "string" || body.reason.trim().length < 8 || body.reason.trim().length > 500) {
    throw new FamilyError("Confirme la familia y sus opciones e indique un motivo de entre 8 y 500 caracteres", 400);
  }
  return { expectedFamilyId: Number(body.expectedFamilyId), expectedOptionIds: body.expectedOptionIds,
    reason: body.reason.trim(), confirmed: true };
}

export async function detachProductFamily(productId: number, body: DetachFamilyBody, userId: number) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
      await tx.select({ id: families.id }).from(families).where(eq(families.id, body.expectedFamilyId)).for("update");
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
      if (!product) throw new FamilyError("Producto no encontrado", 404);
      const currentOptions = (product.variantKey ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b);
      const expectedOptions = [...body.expectedOptionIds].sort((a, b) => a - b);
      if (product.familyId !== body.expectedFamilyId || JSON.stringify(currentOptions) !== JSON.stringify(expectedOptions)) {
        throw new FamilyError("La asociación cambió o el producto ya fue desvinculado. Actualice el formulario antes de continuar.");
      }
      const family = await getFamily(body.expectedFamilyId, tx);
      const classification = await tx.select({ attributeId: attrs.id, attribute: attrs.name, optionId: opts.id, label: opts.label })
        .from(values).innerJoin(attrs, eq(attrs.id, values.attributeId)).innerJoin(opts, eq(opts.id, values.optionId))
        .where(eq(values.productId, productId)).orderBy(asc(attrs.id));
      // The identity trigger requires this audit in the same transaction. Never update commercial fields here.
      const [{ transactionId }] = (await tx.execute<{ transactionId: string }>(sql`select pg_current_xact_id()::text as "transactionId"`)).rows;
      await tx.insert(events).values({ productId, familyId: family.id, userId, reason: body.reason,
        previous: { familyId: family.id, familyName: family.name, variantKey: product.variantKey, attributes: classification, transactionId },
        next: { familyId: null, variantKey: null, attributes: [], operation: "DETACH" } });
      await tx.delete(values).where(eq(values.productId, productId));
      await tx.update(products).set({ familyId: null, variantKey: null }).where(eq(products.id, productId));
      return { productId, familyId: null, variantKey: null };
    });
  } catch (error) {
    const pgError = error as { code?: string; cause?: { code?: string } };
    if ((pgError?.cause?.code ?? pgError?.code) === "23514") {
      throw new FamilyError("La base conserva la protección anterior de identidad. Debe aplicarse la migración de desvinculación antes de continuar.");
    }
    throw error;
  }
}

export async function saveFamily(data: FamilyBody, id?: number, executor?: DbTransaction) {
  const perform = async (tx: DbTransaction) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
    let familyId = id;
    const old = id ? await getFamily(id, tx) : null;
    if (id) await tx.select({ id: families.id }).from(families).where(eq(families.id, id)).for("update");
    const members = id ? await tx.select({ id: products.id }).from(products).where(eq(products.familyId, id)).limit(1) : [];
    if (old?.archivedAt) throw new FamilyError("Reactive la familia antes de modificar sus datos");
    const protectedDefinition = Boolean(members.length || (id && (await familyManagementStatus(id, tx)).hasProductHistory));
    if (old && protectedDefinition && (old.categoryId !== data.categoryId || normalized(old.brand) !== normalized(data.brand))) throw new FamilyError("Con variantes o historial no se cambia categoría ni marca de la familia");
    if (old) {
      if (old.attributes.length !== data.attributes.length && protectedDefinition) throw new FamilyError("No agregue ni elimine dimensiones cuando existen variantes o historial");
      // Existing definitions are retained by ID. Used labels cannot change identity.
      for (const a of old.attributes) {
        const next = data.attributes.find((n) => n.id === a.id);
        if (!next || (protectedDefinition && normalized(next.name) !== normalized(a.name))) throw new FamilyError("Conserve los identificadores y nombres de los atributos existentes");
        for (const o of a.options) {
          const n = next.options.find((v) => v.id === o.id);
          if (!n || normalized(n.label) !== normalized(o.label)) throw new FamilyError("Conserve las opciones existentes; agregue una opción nueva para otro valor");
        }
      }
      await tx.update(families).set({ name: data.name, description: data.description, categoryId: data.categoryId, brand: data.brand, updatedAt: new Date() }).where(eq(families.id, old.id));
    } else {
      const [created] = await tx.insert(families).values({ name: data.name, description: data.description, categoryId: data.categoryId, brand: data.brand }).returning();
      familyId = created.id;
    }
    for (const [position, a] of data.attributes.entries()) {
      if (a.id && !old?.attributes.some((v) => v.id === a.id)) throw new FamilyError("Atributo ajeno a la familia");
      const attributeId = a.id ?? (await tx.insert(attrs).values({ familyId: familyId!, name: a.name, position }).returning())[0].id;
      if (a.id) await tx.update(attrs).set({ name: a.name, position }).where(eq(attrs.id, a.id));
      for (const [optionPosition, o] of a.options.entries()) {
        if (o.id && !old?.attributes.find((v) => v.id === a.id)?.options.some((v) => v.id === o.id)) throw new FamilyError("Opción ajena al atributo");
        if (!o.id) await tx.insert(opts).values({ attributeId, label: o.label, position: optionPosition });
      }
    }
    return familyId!;
  };
  return executor ? perform(executor) : db.transaction(perform);
}

export async function productHasHistory(id: number, executor: Executor = db) {
  const result = await executor.execute<{ found: boolean }>(sql`select exists(select 1 from sale_details where product_id=${id})
    or exists(select 1 from online_order_items where product_id=${id})
    or exists(select 1 from inventory_movements where product_id=${id}) as found`);
  return result.rows[0].found;
}

export function variantKey(attributes: Array<{ id: number }>, options: Array<{ id: number; attributeId: number }>, selected: number[]) {
  if (new Set(selected).size !== selected.length || selected.length !== attributes.length) throw new FamilyError("Seleccione una opción por atributo", 400);
  const chosen = selected.map((id) => options.find((o) => o.id === id));
  if (chosen.some((o) => !o) || new Set(chosen.map((o) => o!.attributeId)).size !== attributes.length
    || attributes.some((a) => !chosen.some((o) => o!.attributeId === a.id))) throw new FamilyError("Combinación inválida u opciones de otra familia", 400);
  return chosen.map((o) => o!).sort((a, b) => a.attributeId - b.attributeId).map((o) => o.id).join(",");
}

export async function assignVariant(tx: DbTransaction, productId: number, familyId: number | null,
  optionIds: number[], userId: number | null, reason: string, creating = false) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
  // Same lock order for all assignments within a family; DB UNIQUE resolves races.
  if (familyId) await tx.select({ id: families.id }).from(families).where(eq(families.id, familyId)).for("update");
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
  if (!p) throw new FamilyError("Producto no encontrado", 404);
  let key: string | null = null;
  const family = familyId ? await getFamily(familyId, tx) : null;
  if (family) {
    if (family.archivedAt) throw new FamilyError("La familia está archivada. Un ADMIN debe reactivarla antes de asociar productos.");
    if (family.categoryId !== p.categoryId || normalized(family.brand) !== normalized(p.brand)) throw new FamilyError("La variante debe conservar la categoría y marca de su familia");
    key = variantKey(family.attributes, family.attributes.flatMap((a) => a.options), optionIds);
    const duplicate = await tx.select({ id: products.id }).from(products).where(and(eq(products.familyId, familyId!), eq(products.variantKey, key))).limit(1);
    if (duplicate[0] && duplicate[0].id !== p.id) throw new FamilyError("Ya existe una variante con esta combinación");
  } else if (optionIds.length) throw new FamilyError("Un producto simple no tiene opciones de familia", 400);
  if (p.familyId === familyId && p.variantKey === key) return;
  if (p.familyId !== null && familyId === null) throw new FamilyError("Use la desvinculación con motivo y confirmación; no se permite quitar la familia al guardar otros campos.");
  const history = !creating && await productHasHistory(productId, tx);
  if (history && p.familyId !== null) throw new FamilyError("La variante tiene historial: no cambie su familia o combinación; cree otro producto");
  if (history && p.familyId === null) {
    const [detached] = await tx.select({ previous: events.previous }).from(events).where(and(eq(events.productId, productId), sql`${events.next}->>'operation'='DETACH'`)).orderBy(desc(events.id)).limit(1);
    const previous = detached?.previous as { familyId?: number; variantKey?: string } | undefined;
    if (previous && (previous.familyId !== familyId || previous.variantKey !== key)) throw new FamilyError("Producto desvinculado con historial: solo puede recuperar su familia y combinación originales; no lo transforme en otro artículo.");
  }
  if (history && reason.trim().length < 8) throw new FamilyError("Indique un motivo para asociar este producto con historial", 400);
  await tx.delete(values).where(eq(values.productId, productId));
  await tx.update(products).set({ familyId, variantKey: key }).where(eq(products.id, productId));
  if (family) await tx.insert(values).values(family.attributes.map((a) => ({
    productId, familyId: familyId!, attributeId: a.id, optionId: a.options.find((o) => optionIds.includes(o.id))!.id,
  })));
  await tx.insert(events).values({ productId, familyId, userId,
    previous: { familyId: p.familyId, variantKey: p.variantKey }, next: { familyId, variantKey: key }, reason: reason.trim() || "Creación de variante" });
}

export async function attachVariantValues<T extends { id: number }>(rows: T[]) {
  if (!rows.length) return rows.map((p) => ({ ...p, variantValues: [], variantOptionIds: [] }));
  const data = await db.select({ productId: values.productId, attributeId: attrs.id, attribute: attrs.name, optionId: opts.id, label: opts.label })
    .from(values).innerJoin(attrs, eq(attrs.id, values.attributeId)).innerJoin(opts, eq(opts.id, values.optionId)).where(inArray(values.productId, rows.map((p) => p.id))).orderBy(asc(attrs.position), asc(attrs.id));
  return rows.map((p) => ({ ...p, variantValues: data.filter((v) => v.productId === p.id), variantOptionIds: data.filter((v) => v.productId === p.id).map((v) => v.optionId) }));
}

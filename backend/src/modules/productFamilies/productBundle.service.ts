import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { productsTable as products, productFamilyEventsTable as events, productImagesTable as images } from "../../db/schema/index.js";
import { saveImageFile, removeStoredImageFile, validateImageBuffer } from "../../utils/imageFiles.js";
import { applyInventoryMovement } from "../inventory/inventory.service.js";
import { assertProductPromotionCompatibilityTx } from "../promotions/promotions.service.js";
import { createProductTx, findProductsByFamilyId, findProductsByIds } from "../products/products.repository.js";
import { editProductInTransaction } from "../products/products.service.js";
import { validateCreateProductBody, type ProductBody } from "../products/products.validation.js";
import { assignVariant, FamilyError, getFamily, productHasHistory, saveFamily, validateFamilyBody } from "./productFamilies.service.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lock = (tx: DbTransaction) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('fyf-product-families'))`);
type BundleImage = { mimeType: string; data: string; authorized: true };
type Variant = { id?: number; selections: number[]; product: ProductBody; initialStock: number; imageIndexes: number[];
  details?: { description?: string | null; unitMeasure?: string }; existingImages?: { imageIds: number[]; primaryImageId: number | null } };
export function validateProductBundle(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FamilyError("Conjunto inválido", 400);
  const b = input as Record<string, unknown>;
  const simple = b.simple === true;
  if (b.simple !== undefined && !simple) throw new FamilyError("Modo de producto inválido", 400);
  if (simple && (b.familyId != null || b.conversion != null)) throw new FamilyError("El guardado simple solo admite un artículo nuevo sin familia", 400);
  const c = b.conversion as Record<string, unknown> | undefined;
  if (c !== undefined && (!c || typeof c !== "object" || Array.isArray(c) || b.familyId != null
    || Object.keys(c).some(k => !["productId", "expectedRevision", "reason", "confirmed"].includes(k))
    || !Number.isSafeInteger(c.productId) || Number(c.productId) < 1 || c.confirmed !== true
    || typeof c.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(c.expectedRevision)
    || typeof c.reason !== "string" || c.reason.trim().length < 8 || c.reason.trim().length > 500)) throw new FamilyError("Confirme la conversión, actualice el producto e indique un motivo de entre 8 y 500 caracteres", 400);
  const conversion = c ? { productId: Number(c.productId), expectedRevision: c.expectedRevision as string, reason: (c.reason as string).trim(), confirmed: true as const } : null;
  if (Object.keys(b).some(k => !["operationKey", "familyId", "expectedRevision", "family", "unitMeasure", "variants", "images", "conversion", "simple"].includes(k))
    || typeof b.operationKey !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(b.operationKey)
    || (b.familyId != null && (!Number.isSafeInteger(b.familyId) || Number(b.familyId) < 1))) throw new FamilyError("Operación o familia inválida", 400);
  const family = validateFamilyBody(b.family, simple);
  if (simple && family.attributes.length !== 0) throw new FamilyError("Un producto simple no guarda atributos familiares", 400);
  if (b.familyId != null && (typeof b.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(b.expectedRevision))) throw new FamilyError("Recargue la familia antes de guardar", 400);
  if (b.familyId == null && family.attributes.some(a => a.id || a.options.some(o => o.id))) throw new FamilyError("Una familia nueva no puede reutilizar identificadores de atributos", 400);
  const imageList = b.images ?? [];
  if (!Array.isArray(imageList) || imageList.length > 12) throw new FamilyError("Máximo 12 imágenes por guardado", 400);
  let bytes = 0;
  const imageData: BundleImage[] = imageList.map(i => {
    if (!i || typeof i !== "object" || Object.keys(i).some(k => !["mimeType", "data", "authorized"].includes(k)) || i.authorized !== true
      || !["image/jpeg", "image/png", "image/webp"].includes(i.mimeType) || typeof i.data !== "string"
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(i.data)) throw new FamilyError("Revise la imagen y confirme su autorización de uso", 400);
    bytes += Buffer.byteLength(i.data, "base64");
    return { mimeType: i.mimeType, data: i.data, authorized: true };
  });
  if (bytes > 15 * 1024 * 1024) throw new FamilyError("Las imágenes del guardado no pueden superar 15 MB", 413);
  if (!Array.isArray(b.variants) || !b.variants.length || b.variants.length > 100) throw new FamilyError("Agregue entre 1 y 100 variantes concretas", 400);
  if (simple && (b.variants.length !== 1 || b.variants[0]?.id != null)) throw new FamilyError("El guardado simple solo admite un artículo nuevo", 400);
  const variants: Variant[] = b.variants.map(v => {
    if (!v || typeof v !== "object" || Object.keys(v).some(k => !["id", "selections", "name", "price", "barcode", "minimumStock", "initialStock", "status", "inStoreOnly", "imageIndexes", "description", "unitMeasure", "existingImages"].includes(k))
      || (v.id !== undefined && ((!b.familyId && v.id !== conversion?.productId) || !Number.isSafeInteger(v.id) || v.id < 1))
      || (v.id !== undefined && v.initialStock !== undefined)
      || !Array.isArray(v.selections) || v.selections.length !== family.attributes.length
      || v.selections.some((n: unknown, index: number) => !Number.isSafeInteger(n) || Number(n) < 0 || Number(n) >= family.attributes[index].options.length)) throw new FamilyError("Variante o combinación incompleta; no se permite modificar stock existente", 400);
    const quantity = v.initialStock ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) throw new FamilyError("Stock inicial entero inválido", 400);
    if (!Number.isSafeInteger(v.price) || v.price < 0 || v.price > 9999999999) throw new FamilyError("Precio CLP entero inválido", 400);
    const parsed = validateCreateProductBody({ categoryId: family.categoryId, brand: family.brand, description: v.description === undefined ? family.description : v.description, unitMeasure: v.unitMeasure === undefined ? b.unitMeasure : v.unitMeasure,
      name: v.name, price: v.price, barcode: v.barcode ?? null, minimumStock: v.minimumStock ?? 0, status: v.status ?? true, inStoreOnly: v.inStoreOnly ?? false });
    if (!parsed.success) throw new FamilyError(parsed.error, 400);
    const indexes = v.imageIndexes ?? [];
    if (!Array.isArray(indexes) || indexes.length > 8 || new Set(indexes).size !== indexes.length || indexes.some(i => !Number.isSafeInteger(i) || i < 0 || i >= imageData.length)) throw new FamilyError("Selección de imágenes inválida", 400);
    const selection = v.existingImages;
    if (selection !== undefined && (!v.id || !selection || typeof selection !== "object" || Array.isArray(selection)
      || Object.keys(selection).some(k => !["imageIds", "primaryImageId"].includes(k)) || !Array.isArray(selection.imageIds)
      || selection.imageIds.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1)
      || new Set(selection.imageIds).size !== selection.imageIds.length
      || (selection.imageIds.length ? !selection.imageIds.includes(selection.primaryImageId) : selection.primaryImageId !== null))) throw new FamilyError("Revise el orden y la fotografía principal del artículo", 400);
    return { ...(v.id ? { id: v.id } : {}), selections: v.selections, product: parsed.value, initialStock: quantity, imageIndexes: indexes,
      ...(v.description !== undefined || v.unitMeasure !== undefined ? { details: { ...(v.description !== undefined ? { description: parsed.value.description } : {}), ...(v.unitMeasure !== undefined ? { unitMeasure: parsed.value.unitMeasure } : {}) } } : {}),
      ...(selection ? { existingImages: { imageIds: selection.imageIds, primaryImageId: selection.primaryImageId } } : {}) };
  });
  const distinct = (items: unknown[], label: string) => { if (new Set(items).size !== items.length) throw new FamilyError(`${label} repetidos`, 400); };
  distinct(variants.map(v => v.selections.join(",")), "Combinaciones");
  distinct(variants.map(v => v.product.name.toLocaleLowerCase("es")), "Nombres de variante");
  distinct(variants.flatMap(v => v.product.barcode ? [v.product.barcode] : []), "Códigos de barra");
  distinct(variants.flatMap(v => v.id ? [v.id] : []), "Identificadores");
  if (conversion && (variants.filter(v => v.id === conversion.productId).length !== 1 || !variants.some(v => !v.id))) throw new FamilyError("Incluya el producto original una vez y al menos una variante nueva", 400);
  const copiedBytes = variants.reduce((sum, v) => sum + v.imageIndexes.reduce((s, i) => s + Buffer.byteLength(imageData[i].data, "base64"), 0), 0);
  if (copiedBytes > 30 * 1024 * 1024) throw new FamilyError("Las copias de imágenes por variante superan 30 MB; guarde menos imágenes por operación", 413);
  return { operationKey: b.operationKey, familyId: b.familyId == null ? null : Number(b.familyId), expectedRevision: b.expectedRevision as string | undefined,
    family, unitMeasure: b.unitMeasure as string, variants, images: imageData, ...(simple ? { simple: true as const } : {}), ...(conversion ? { conversion } : {}) };
}

async function conversionSnapshot(id: number, tx: DbTransaction) {
  const [product] = await tx.select().from(products).where(eq(products.id, id)).for("update");
  if (!product) throw new FamilyError("Producto no encontrado", 404);
  if (product.familyId !== null || product.variantKey !== null) throw new FamilyError("El producto ya pertenece a una familia. Abra la edición familiar.");
  // Conversion creates a NEW classification, never a route around historical recovery.
  const associations = await tx.select({ id: events.id }).from(events).where(and(eq(events.productId, id),
    sql`not (${events.familyId} is null and coalesce(${events.next}->>'operation', '')='SIMPLE_SAVE')`)).limit(1);
  const orphan = await tx.execute(sql`select 1 from product_variant_values where product_id=${id} limit 1`);
  if (associations.length || orphan.rows.length) throw new FamilyError("El producto tiene asociaciones familiares anteriores. Use la administración avanzada y sus reglas de recuperación; no puede convertirse en una familia nueva.");
  const pictures = await tx.select().from(images).where(eq(images.productId, id)).orderBy(asc(images.id));
  const hasHistory = await productHasHistory(id, tx);
  return { product, hasHistory, revision: digest({ product, pictures, hasHistory }) };
}
export async function getProductConversion(id: number) {
  return db.transaction(async tx => {
    await lock(tx);
    const snapshot = await conversionSnapshot(id, tx);
    const [view] = await findProductsByIds([id]);
    return { product: { ...view, ...snapshot.product, hasHistory: snapshot.hasHistory }, revision: snapshot.revision };
  });
}

async function bundleSnapshot(id: number, tx: DbTransaction) {
  const family = await getFamily(id, tx);
  const members = await tx.select().from(products).where(eq(products.familyId, id)).orderBy(asc(products.id));
  const pictureRows = await tx.select({ id: images.id, productId: images.productId, position: images.position, isPrimary: images.isPrimary }).from(images)
    .where(sql`${images.productId} in (select id from ${products} where ${products.familyId}=${id})`).orderBy(asc(images.id));
  return { family, revision: digest({ family, members, images: pictureRows }) };
}
export async function getProductBundle(id: number) {
  return db.transaction(async tx => {
    await lock(tx);
    await tx.select().from(products).where(eq(products.familyId, id)).orderBy(asc(products.id)).for("update");
    const snapshot = await bundleSnapshot(id, tx);
    const variants = await findProductsByFamilyId(id);
    const history = await tx.execute<{ id: number; has_history: boolean }>(sql`select p.id,
      (exists(select 1 from sale_details s where s.product_id=p.id)
       or exists(select 1 from online_order_items o where o.product_id=p.id)
       or exists(select 1 from inventory_movements m where m.product_id=p.id)) as has_history
      from products p where p.family_id=${id}`);
    return { ...snapshot, variants: variants.map(v => ({ ...v, hasHistory: history.rows.find(h => h.id === v.id)?.has_history ?? false })) };
  });
}
async function operation(tx: DbTransaction, key: string) {
  const [event] = await tx.select().from(events).where(sql`${events.next}->>'operation' in ('BUNDLE_SAVE','SIMPLE_SAVE') and ${events.next}->>'operationKey'=${key}`).limit(1);
  return event;
}
export async function getBundleOperation(key: string, actorId: number) {
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(key)) throw new FamilyError("Operación inválida", 400);
  return db.transaction(async tx => {
    await lock(tx); const event = await operation(tx, key);
    if (event && event.userId !== actorId) throw new FamilyError("La operación pertenece a otro usuario", 403);
    return event ? { familyId: event.familyId, productIds: (event.next as { productIds: number[] }).productIds } : null;
  });
}
export async function saveProductBundle(input: unknown, actorId: number) {
  const body = validateProductBundle(input);
  for (const image of body.images) await validateImageBuffer(Buffer.from(image.data, "base64"), image.mimeType);
  const hash = digest({ ...body, images: body.images.map(i => ({ mimeType: i.mimeType, hash: digest(i.data) })) });
  const written: string[] = [];
  const removed: string[] = [];
  const cleanupRemoved = async () => {
    // Files are removed only after COMMIT and only if no article still references them.
    for (const imagePath of removed) {
      try {
        const references = await db.select({ id: images.id }).from(images).where(eq(images.imagePath, imagePath)).limit(1);
        if (!references.length) await removeStoredImageFile(imagePath);
      } catch { /* A retained unused file is safer than deleting a referenced image. */ }
    }
  };
  try {
    const result = await db.transaction(async tx => {
      await lock(tx);
      const prior = await operation(tx, body.operationKey);
      if (prior) {
        const record = prior.next as { requestHash: string; productIds: number[] };
        if (prior.userId !== actorId || record.requestHash !== hash) throw new FamilyError("La clave ya se utilizó con otros datos. Recupere el resultado anterior.");
        return { familyId: prior.familyId!, productIds: record.productIds, replayed: true };
      }
      if (!body.simple && !body.familyId && body.variants.length < 2) throw new FamilyError("Has configurado una sola variante. Agrega otra o guarda este artículo como producto simple", 400);
      let previous: unknown = { revision: body.expectedRevision ?? null };
      if (body.familyId) {
        await tx.select().from(products).where(eq(products.familyId, body.familyId)).orderBy(asc(products.id)).for("update");
        const snapshot = await bundleSnapshot(body.familyId, tx);
        if (snapshot.revision !== body.expectedRevision) throw new FamilyError("La familia o sus variantes cambiaron. Recargue antes de guardar; no se aplicaron cambios.");
        previous = { revision: snapshot.revision, family: snapshot.family,
          variants: await tx.select().from(products).where(eq(products.familyId, body.familyId)),
          images: await tx.select().from(images).where(sql`${images.productId} in (select id from ${products} where ${products.familyId}=${body.familyId})`) };
      }
      const original = body.conversion ? await conversionSnapshot(body.conversion.productId, tx) : null;
      if (original) {
        if (original.revision !== body.conversion!.expectedRevision) throw new FamilyError("El producto original cambió. Recargue y revise nuevamente la conversión; no se aplicaron cambios.");
        const row = body.variants.find(v => v.id === original.product.id)!;
        if (body.family.categoryId !== original.product.categoryId || body.family.brand !== original.product.brand
          || body.unitMeasure !== original.product.unitMeasure || row.product.unitMeasure !== original.product.unitMeasure || row.product.name !== original.product.name) throw new FamilyError("La conversión conserva nombre, categoría, marca y unidad del producto original. Edite por separado los cambios de identidad permitidos.");
        previous = { revision: original.revision, product: original.product, images: await tx.select().from(images).where(eq(images.productId, original.product.id)) };
      }
      const familyId = body.simple ? null : await saveFamily(body.family, body.familyId ?? undefined, tx);
      const family = familyId ? await getFamily(familyId, tx) : null;
      const ids: number[] = [];
      for (const variant of body.variants) {
        const selected = body.family.attributes.map((inputAttribute, index) => {
          const attribute = family!.attributes.find(a => inputAttribute.id ? a.id === inputAttribute.id : a.name === inputAttribute.name);
          const inputOption = inputAttribute.options[variant.selections[index]];
          const option = attribute?.options.find(o => inputOption.id ? o.id === inputOption.id : o.label === inputOption.label);
          if (!option) throw new FamilyError("La opción seleccionada ya no pertenece al atributo", 400);
          return option.id;
        });
        let id = variant.id;
        if (id && original?.product.id === id) {
          // Commercial edits are explicit row fields. Association does not create ENTRY.
          await editProductInTransaction(tx, id, { price: variant.product.price, barcode: variant.product.barcode,
            minimumStock: variant.product.minimumStock, status: variant.product.status, inStoreOnly: variant.product.inStoreOnly, ...variant.details }, actorId);
          await assignVariant(tx, id, familyId, selected, actorId, body.conversion!.reason);
          await tx.insert(events).values({ familyId, productId: id, userId: actorId, previous: { product: original.product, revision: original.revision },
            next: { operation: "CONVERT_SIMPLE", operationKey: body.operationKey, familyId, optionIds: selected,
              attributes: family!.attributes.map(a => ({ attribute: a.name, option: a.options.find(o => selected.includes(o.id))!.label })), stockPreserved: original.product.currentStock }, reason: body.conversion!.reason });
        } else if (id) {
          if (familyId === null) throw new FamilyError("Un artículo existente requiere su familia original", 400);
          const [current] = await tx.select().from(products).where(and(eq(products.id, id), eq(products.familyId, familyId))).for("update");
          if (!current) throw new FamilyError("La variante no pertenece a esta familia");
          // Shared data describes the family only: never silently rename/reclassify existing SKUs.
          await editProductInTransaction(tx, id, { name: variant.product.name, price: variant.product.price, barcode: variant.product.barcode,
            minimumStock: variant.product.minimumStock, status: variant.product.status, inStoreOnly: variant.product.inStoreOnly,
            ...variant.details, familyId, variantOptionIds: selected }, actorId);
        } else {
          const created = await createProductTx(tx, variant.product);
          id = created.id;
          if (familyId) await assignVariant(tx, id, familyId, selected, actorId, "Alta conjunta de variante", true);
          await assertProductPromotionCompatibilityTx(tx, { productId: id, productName: created.name, categoryId: created.categoryId, status: created.status });
          if (variant.initialStock > 0) await applyInventoryMovement(tx, { productId: id, userId: actorId, movementType: "ENTRY", quantity: variant.initialStock,
            reason: body.simple ? "Stock inicial: alta de producto simple" : "Stock inicial: alta conjunta de variantes", date: new Date(), allowInactive: true });
        }
        ids.push(id);
        let existing = await tx.select().from(images).where(eq(images.productId, id));
        if (variant.existingImages) {
          const selection = variant.existingImages;
          if (selection.imageIds.some(imageId => !existing.some(image => image.id === imageId))) throw new FamilyError("La imagen no pertenece al producto o cambió. Recargue antes de guardar.");
          await tx.update(images).set({ isPrimary: false }).where(eq(images.productId, id));
          for (const image of existing.filter(image => !selection.imageIds.includes(image.id))) {
            await tx.delete(images).where(eq(images.id, image.id)); removed.push(image.imagePath);
          }
          for (const [position, imageId] of selection.imageIds.entries()) {
            await tx.update(images).set({ position, isPrimary: imageId === selection.primaryImageId }).where(eq(images.id, imageId));
          }
          existing = existing.filter(image => selection.imageIds.includes(image.id)).map(image => ({ ...image, position: selection.imageIds.indexOf(image.id) }));
        }
        for (const [offset, imageIndex] of variant.imageIndexes.entries()) {
          const image = body.images[imageIndex];
          const file = await saveImageFile({ buffer: Buffer.from(image.data, "base64"), declaredMimeType: image.mimeType, directorySegments: ["products", id] });
          written.push(file.relativePath);
          await tx.insert(images).values({ productId: id, imagePath: file.relativePath, position: existing.reduce((n, i) => Math.max(n, i.position + 1), 0) + offset,
            isPrimary: existing.length === 0 && offset === 0 });
        }
      }
      await tx.insert(events).values({ familyId, productId: body.simple ? ids[0] : null, userId: actorId, previous,
        next: { operation: body.simple ? "SIMPLE_SAVE" : "BUNDLE_SAVE", operationKey: body.operationKey, requestHash: hash, productIds: ids,
          variants: await tx.select().from(products).where(inArray(products.id, ids)).orderBy(asc(products.id)),
          images: await tx.select().from(images).where(inArray(images.productId, ids)).orderBy(asc(images.id)) }, reason: body.simple ? "Alta de producto simple" : "Guardado conjunto de familia y variantes" });
      return { familyId, productIds: ids, replayed: false };
    });
    await cleanupRemoved();
    return result;
  } catch (error) {
    // A lost COMMIT acknowledgement is not proof of rollback. Check the durable audit
    // before deleting files; if DB is unavailable keep them, rather than break images.
    let committed;
    try { committed = await db.transaction(async tx => { await lock(tx); return operation(tx, body.operationKey); }); } catch { throw error; }
    if (committed && committed.userId === actorId && (committed.next as { requestHash: string }).requestHash === hash) {
      await cleanupRemoved();
      return { familyId: committed.familyId!, productIds: (committed.next as { productIds: number[] }).productIds, replayed: true };
    }
    await Promise.all(written.map(p => removeStoredImageFile(p).catch(() => undefined)));
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    if (code === "23505") throw new FamilyError("Nombre, código de barras o combinación ya registrados. No se guardó ninguna variante.");
    throw error;
  }
}

import { asc, eq, inArray, max } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productImagesTable, type NewProductImage } from "../../db/schema/index.js";

const imageColumns = {
  id: productImagesTable.id,
  productId: productImagesTable.productId,
  imagePath: productImagesTable.imagePath,
  position: productImagesTable.position,
  isPrimary: productImagesTable.isPrimary,
  createdAt: productImagesTable.createdAt,
};

export async function findProductImagesByProductIds(productIds: number[]) {
  if (productIds.length === 0) return [];

  return db
    .select(imageColumns)
    .from(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds))
    .orderBy(asc(productImagesTable.position), asc(productImagesTable.id));
}

export async function findProductImageById(productId: number, imageId: number) {
  const [image] = await db
    .select(imageColumns)
    .from(productImagesTable)
    .where(eq(productImagesTable.id, imageId))
    .limit(1);

  return image?.productId === productId ? image : null;
}

export async function createProductImage(data: Omit<NewProductImage, "position" | "isPrimary">) {
  return db.transaction(async (tx) => {
    const [positionResult] = await tx
      .select({ value: max(productImagesTable.position) })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, data.productId));
    const [countResult] = await tx
      .select({ id: productImagesTable.id })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, data.productId))
      .limit(1);

    const [image] = await tx
      .insert(productImagesTable)
      .values({
        ...data,
        position: Number(positionResult?.value ?? -1) + 1,
        isPrimary: !countResult,
      })
      .returning(imageColumns);

    return image;
  });
}

export async function setPrimaryProductImage(productId: number, imageId: number) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: productImagesTable.id, productId: productImagesTable.productId })
      .from(productImagesTable)
      .where(eq(productImagesTable.id, imageId))
      .limit(1);

    if (!target || target.productId !== productId) return null;

    await tx
      .update(productImagesTable)
      .set({ isPrimary: false })
      .where(eq(productImagesTable.productId, productId));

    const [image] = await tx
      .update(productImagesTable)
      .set({ isPrimary: true })
      .where(eq(productImagesTable.id, imageId))
      .returning(imageColumns);

    return image ?? null;
  });
}

export async function deleteProductImage(productId: number, imageId: number) {
  return db.transaction(async (tx) => {
    const [image] = await tx
      .select(imageColumns)
      .from(productImagesTable)
      .where(eq(productImagesTable.id, imageId))
      .limit(1);

    if (!image || image.productId !== productId) return null;

    await tx.delete(productImagesTable).where(eq(productImagesTable.id, imageId));

    if (image.isPrimary) {
      const [nextImage] = await tx
        .select({ id: productImagesTable.id })
        .from(productImagesTable)
        .where(eq(productImagesTable.productId, productId))
        .orderBy(asc(productImagesTable.position), asc(productImagesTable.id))
        .limit(1);

      if (nextImage) {
        await tx
          .update(productImagesTable)
          .set({ isPrimary: true })
          .where(eq(productImagesTable.id, nextImage.id));
      }
    }

    return image;
  });
}

export async function reorderProductImages(productId: number, imageIds: number[]) {
  return db.transaction(async (tx) => {
    const currentImages = await tx
      .select({ id: productImagesTable.id })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, productId));
    const currentIds = new Set(currentImages.map((image) => image.id));

    if (currentIds.size !== imageIds.length || imageIds.some((id) => !currentIds.has(id))) {
      return null;
    }

    for (const [position, id] of imageIds.entries()) {
      await tx
        .update(productImagesTable)
        .set({ position })
        .where(eq(productImagesTable.id, id));
    }

    return tx
      .select(imageColumns)
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, productId))
      .orderBy(asc(productImagesTable.position), asc(productImagesTable.id));
  });
}

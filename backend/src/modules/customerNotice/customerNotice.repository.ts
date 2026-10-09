import { and, asc, eq, gt, isNull, lte, max, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { catalogPresentationTable, customerNoticeTable } from "../../db/schema/index.js";
import type { CatalogPresentationInput, NoticeInput } from "./customerNotice.validation.js";

export async function findPublicCustomerNotices(now = new Date()) {
  return db.select({
    id: customerNoticeTable.id,
    title: customerNoticeTable.title,
    message: customerNoticeTable.message,
    displaySeconds: customerNoticeTable.displaySeconds,
    imagePath: customerNoticeTable.imagePath,
  }).from(customerNoticeTable)
    .where(and(
      eq(customerNoticeTable.isActive, true),
      or(isNull(customerNoticeTable.startsAt), lte(customerNoticeTable.startsAt, now)),
      or(isNull(customerNoticeTable.endsAt), gt(customerNoticeTable.endsAt, now)),
    ))
    .orderBy(asc(customerNoticeTable.sortOrder), asc(customerNoticeTable.id));
}

export async function findCustomerNotices() {
  return db.select().from(customerNoticeTable)
    .orderBy(asc(customerNoticeTable.sortOrder), asc(customerNoticeTable.id));
}

export async function findCustomerNoticeById(id: number) {
  const [notice] = await db.select().from(customerNoticeTable)
    .where(eq(customerNoticeTable.id, id))
    .limit(1);
  return notice ?? null;
}

export async function findCatalogPresentation() {
  const [presentation] = await db.select().from(catalogPresentationTable)
    .where(eq(catalogPresentationTable.id, 1))
    .limit(1);
  return presentation ?? null;
}

export async function createCustomerNotice(input: NoticeInput & { userId: number }) {
  return db.transaction(async (tx) => {
    const [lastPosition] = await tx.select({ value: max(customerNoticeTable.sortOrder) })
      .from(customerNoticeTable);
    const now = new Date();
    const [notice] = await tx.insert(customerNoticeTable).values({
      title: input.title,
      message: input.message,
      isActive: input.isActive,
      sortOrder: Number(lastPosition?.value ?? -1) + 1,
      displaySeconds: input.displaySeconds,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return notice;
  });
}

export async function updateCustomerNoticeById(
  id: number,
  input: NoticeInput & { userId: number },
) {
  const [notice] = await db.update(customerNoticeTable).set({
    title: input.title,
    message: input.message,
    isActive: input.isActive,
    displaySeconds: input.displaySeconds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  }).where(eq(customerNoticeTable.id, id)).returning();
  return notice ?? null;
}

export async function reorderCustomerNotices(noticeIds: number[], userId: number) {
  return db.transaction(async (tx) => {
    const current = await tx.select({ id: customerNoticeTable.id }).from(customerNoticeTable);
    const currentIds = new Set(current.map((notice) => notice.id));
    if (currentIds.size !== noticeIds.length || noticeIds.some((id) => !currentIds.has(id))) {
      return null;
    }
    const updatedAt = new Date();
    for (const [sortOrder, id] of noticeIds.entries()) {
      await tx.update(customerNoticeTable).set({ sortOrder, updatedByUserId: userId, updatedAt })
        .where(eq(customerNoticeTable.id, id));
    }
    return tx.select().from(customerNoticeTable)
      .orderBy(asc(customerNoticeTable.sortOrder), asc(customerNoticeTable.id));
  });
}

export async function setCustomerNoticeImagePath(id: number, imagePath: string | null, userId: number) {
  const [notice] = await db.update(customerNoticeTable).set({
    imagePath,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(customerNoticeTable.id, id)).returning();
  return notice ?? null;
}

export async function updateCatalogPresentation(
  input: CatalogPresentationInput & { userId: number },
) {
  const now = new Date();
  const [presentation] = await db.insert(catalogPresentationTable).values({
    id: 1,
    title: input.title,
    mainText: input.mainText,
    secondaryText: input.secondaryText,
    updatedByUserId: input.userId,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: catalogPresentationTable.id,
    set: {
      title: input.title,
      mainText: input.mainText,
      secondaryText: input.secondaryText,
      updatedByUserId: input.userId,
      updatedAt: now,
    },
  }).returning();
  return presentation;
}

export async function setCatalogPresentationImagePath(imagePath: string | null, userId: number) {
  const [presentation] = await db.update(catalogPresentationTable).set({
    imagePath,
    updatedByUserId: userId,
    updatedAt: new Date(),
  }).where(eq(catalogPresentationTable.id, 1)).returning();
  return presentation ?? null;
}

export async function deleteCustomerNoticeById(id: number) {
  const [notice] = await db.delete(customerNoticeTable)
    .where(eq(customerNoticeTable.id, id))
    .returning({ id: customerNoticeTable.id, imagePath: customerNoticeTable.imagePath });
  return notice ?? null;
}

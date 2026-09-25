import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { customerNoticeTable } from "../../db/schema/index.js";
import type { NoticeInput } from "./customerNotice.validation.js";

export async function findPublicCustomerNotices(now = new Date()) {
  return db.select({
    id: customerNoticeTable.id,
    title: customerNoticeTable.title,
    message: customerNoticeTable.message,
    displaySeconds: customerNoticeTable.displaySeconds,
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

export async function createCustomerNotice(input: NoticeInput & { userId: number }) {
  const now = new Date();
  const [notice] = await db.insert(customerNoticeTable).values({
    title: input.title,
    message: input.message,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    displaySeconds: input.displaySeconds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return notice;
}

export async function updateCustomerNoticeById(
  id: number,
  input: NoticeInput & { userId: number },
) {
  const [notice] = await db.update(customerNoticeTable).set({
    title: input.title,
    message: input.message,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    displaySeconds: input.displaySeconds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  }).where(eq(customerNoticeTable.id, id)).returning();
  return notice ?? null;
}

export async function deleteCustomerNoticeById(id: number) {
  const [notice] = await db.delete(customerNoticeTable)
    .where(eq(customerNoticeTable.id, id))
    .returning({ id: customerNoticeTable.id });
  return notice ?? null;
}

import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { customerNoticeTable } from "../../db/schema/index.js";

export async function findCustomerNotice() {
  const [notice] = await db.select().from(customerNoticeTable)
    .where(eq(customerNoticeTable.id, 1))
    .limit(1);
  return notice ?? null;
}

export async function saveCustomerNotice(input: {
  title: string;
  message: string;
  active: boolean;
  updatedByUserId: number;
}) {
  const now = new Date();
  const [notice] = await db.insert(customerNoticeTable).values({
    id: 1,
    ...input,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: customerNoticeTable.id,
    set: { ...input, updatedAt: now },
  }).returning();
  return notice;
}

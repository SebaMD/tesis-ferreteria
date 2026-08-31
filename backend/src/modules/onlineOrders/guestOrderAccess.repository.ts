import { and, eq, gt, isNull } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  guestOrderAccessTokensTable,
  onlineOrdersTable,
} from "../../db/schema/index.js";

export async function createGuestOrderAccessRecord(
  tx: DbTransaction,
  data: { orderId: number; tokenHash: string; expiresAt: Date },
) {
  const [record] = await tx
    .insert(guestOrderAccessTokensTable)
    .values(data)
    .returning({ id: guestOrderAccessTokensTable.id });
  return record;
}

export async function issueGuestOrderAccessRecord(
  data: { orderId: number; tokenHash: string; expiresAt: Date },
) {
  return db.transaction((tx) => createGuestOrderAccessRecord(tx, data));
}

export async function findGuestOrderIdByAccessTokenHash(tokenHash: string) {
  const [record] = await db
    .select({ orderId: guestOrderAccessTokensTable.orderId })
    .from(guestOrderAccessTokensTable)
    .innerJoin(
      onlineOrdersTable,
      eq(guestOrderAccessTokensTable.orderId, onlineOrdersTable.id),
    )
    .where(and(
      eq(guestOrderAccessTokensTable.tokenHash, tokenHash),
      gt(guestOrderAccessTokensTable.expiresAt, new Date()),
      isNull(onlineOrdersTable.clientId),
    ))
    .limit(1);

  return record?.orderId ?? null;
}

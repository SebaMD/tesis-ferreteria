import { and, count, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import { passwordResetTokensTable, usersTable } from "../../db/schema/index.js";

export async function findActiveUserForPasswordReset(email: string) {
  const [user] = await db.select({ id: usersTable.id, correo: usersTable.correo })
    .from(usersTable)
    .where(and(eq(usersTable.correo, email), eq(usersTable.status, "ACTIVE")))
    .limit(1);
  return user ?? null;
}

export async function lockPasswordResetUser(tx: DbTransaction, userId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`password-reset:${userId}`}, 0))`);
}

export async function countRecentPasswordResetRequests(
  tx: DbTransaction,
  userId: number,
  since: Date,
) {
  const [row] = await tx.select({ value: count() })
    .from(passwordResetTokensTable)
    .where(and(
      eq(passwordResetTokensTable.userId, userId),
      gt(passwordResetTokensTable.createdAt, since),
    ));
  return Number(row?.value || 0);
}

export async function findLatestPasswordResetRequest(tx: DbTransaction, userId: number) {
  const [row] = await tx.select({ createdAt: passwordResetTokensTable.createdAt })
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, userId))
    .orderBy(desc(passwordResetTokensTable.createdAt), desc(passwordResetTokensTable.id))
    .limit(1);
  return row ?? null;
}

export async function createPasswordResetToken(
  tx: DbTransaction,
  input: { userId: number; tokenHash: string; expiresAt: Date; now: Date },
) {
  const [created] = await tx.insert(passwordResetTokensTable).values({
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: input.now,
  }).returning({ id: passwordResetTokensTable.id });
  return created;
}

export async function markPasswordResetSent(
  tx: DbTransaction,
  input: { id: number; userId: number; sentAt: Date },
) {
  await lockPasswordResetUser(tx, input.userId);
  await tx.update(passwordResetTokensTable)
    .set({ sentAt: input.sentAt })
    .where(eq(passwordResetTokensTable.id, input.id));
  await tx.update(passwordResetTokensTable)
    .set({ consumedAt: input.sentAt })
    .where(and(
      eq(passwordResetTokensTable.userId, input.userId),
      lt(passwordResetTokensTable.id, input.id),
      isNull(passwordResetTokensTable.consumedAt),
    ));
}

export async function markPasswordResetUndeliverable(id: number, now: Date) {
  await db.update(passwordResetTokensTable)
    .set({ consumedAt: now })
    .where(and(eq(passwordResetTokensTable.id, id), isNull(passwordResetTokensTable.consumedAt)));
}

export async function consumeValidPasswordResetToken(
  tx: DbTransaction,
  tokenHash: string,
  now: Date,
) {
  const [token] = await tx.update(passwordResetTokensTable)
    .set({ consumedAt: now })
    .where(and(
      eq(passwordResetTokensTable.tokenHash, tokenHash),
      isNotNull(passwordResetTokensTable.sentAt),
      isNull(passwordResetTokensTable.consumedAt),
      gt(passwordResetTokensTable.expiresAt, now),
    ))
    .returning({ id: passwordResetTokensTable.id, userId: passwordResetTokensTable.userId });
  return token ?? null;
}

export async function replaceActiveUserPassword(
  tx: DbTransaction,
  userId: number,
  password: string,
  now: Date,
) {
  const [updated] = await tx.update(usersTable)
    .set({
      password,
      authVersion: sql`${usersTable.authVersion} + 1`,
      updatedAt: now,
    })
    .where(and(eq(usersTable.id, userId), eq(usersTable.status, "ACTIVE")))
    .returning({ id: usersTable.id });
  return updated ?? null;
}

export async function consumeOtherPasswordResetTokens(
  tx: DbTransaction,
  userId: number,
  usedTokenId: number,
  now: Date,
) {
  await tx.update(passwordResetTokensTable)
    .set({ consumedAt: now })
    .where(and(
      eq(passwordResetTokensTable.userId, userId),
      isNull(passwordResetTokensTable.consumedAt),
      sql`${passwordResetTokensTable.id} <> ${usedTokenId}`,
    ));
}

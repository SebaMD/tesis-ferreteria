import { and, count, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
  emailVerificationChallengesTable,
  rolesTable,
  usersTable,
  type EmailVerificationPurpose,
} from "../../db/schema/index.js";

export type VerificationOwner =
  | { type: "CLIENT"; userId: number }
  | { type: "USER"; userId: number }
  | { type: "GUEST"; guestSessionHash: string };

function ownerCondition(owner: VerificationOwner) {
  return owner.type !== "GUEST"
    ? eq(emailVerificationChallengesTable.userId, owner.userId)
    : eq(emailVerificationChallengesTable.guestSessionHash, owner.guestSessionHash);
}

export async function lockVerificationContext(
  tx: DbTransaction,
  owner: VerificationOwner,
  purpose: EmailVerificationPurpose,
) {
  const ownerKey = owner.type !== "GUEST" ? `user:${owner.userId}` : `guest:${owner.guestSessionHash}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${purpose}:${ownerKey}`}, 0))`);
}

export async function findVerificationUserForUpdate(tx: DbTransaction, userId: number) {
  const [user] = await tx.select({
    id: usersTable.id,
    role: rolesTable.name,
    status: usersTable.status,
    correo: usersTable.correo,
    emailVerifiedAt: usersTable.emailVerifiedAt,
  }).from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1)
    .for("update");
  return user ?? null;
}

export async function findOtherUserByEmail(userId: number, email: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.correo, email), ne(usersTable.id, userId)))
    .limit(1);
  return user ?? null;
}

export async function countRecentVerificationSends(
  tx: DbTransaction,
  owner: VerificationOwner,
  email: string,
  since: Date,
) {
  const [row] = await tx.select({ value: count() })
    .from(emailVerificationChallengesTable)
    .where(and(
      gte(emailVerificationChallengesTable.lastSentAt, since),
      or(eq(emailVerificationChallengesTable.email, email), ownerCondition(owner)),
    ));
  return Number(row?.value || 0);
}

export async function findLatestVerificationSend(
  tx: DbTransaction,
  owner: VerificationOwner,
  purpose: EmailVerificationPurpose,
) {
  const [row] = await tx.select({
    email: emailVerificationChallengesTable.email,
    lastSentAt: emailVerificationChallengesTable.lastSentAt,
  })
    .from(emailVerificationChallengesTable)
    .where(and(eq(emailVerificationChallengesTable.purpose, purpose), ownerCondition(owner)))
    .orderBy(desc(emailVerificationChallengesTable.lastSentAt))
    .limit(1);
  return row ?? null;
}

export async function findActiveVerificationChallenge(
  owner: VerificationOwner,
  purpose: EmailVerificationPurpose,
) {
  const [row] = await db.select({
    challengeId: emailVerificationChallengesTable.id,
    email: emailVerificationChallengesTable.email,
    expiresAt: emailVerificationChallengesTable.expiresAt,
    lastSentAt: emailVerificationChallengesTable.lastSentAt,
  }).from(emailVerificationChallengesTable)
    .where(and(
      eq(emailVerificationChallengesTable.purpose, purpose),
      ownerCondition(owner),
      isNull(emailVerificationChallengesTable.consumedAt),
    ))
    .orderBy(desc(emailVerificationChallengesTable.lastSentAt))
    .limit(1);
  return row ?? null;
}

export async function invalidateActiveChallenges(
  tx: DbTransaction,
  owner: VerificationOwner,
  purpose: EmailVerificationPurpose,
  now: Date,
) {
  await tx.update(emailVerificationChallengesTable)
    .set({ consumedAt: now, updatedAt: now })
    .where(and(
      eq(emailVerificationChallengesTable.purpose, purpose),
      ownerCondition(owner),
      isNull(emailVerificationChallengesTable.consumedAt),
    ));
}

export async function createVerificationChallenge(
  tx: DbTransaction,
  input: {
    email: string;
    purpose: EmailVerificationPurpose;
    owner: VerificationOwner;
    pinHash: string;
    expiresAt: Date;
    now: Date;
  },
) {
  const [challenge] = await tx.insert(emailVerificationChallengesTable).values({
    email: input.email,
    purpose: input.purpose,
    userId: input.owner.type !== "GUEST" ? input.owner.userId : null,
    guestSessionHash: input.owner.type === "GUEST" ? input.owner.guestSessionHash : null,
    pinHash: input.pinHash,
    expiresAt: input.expiresAt,
    failedAttempts: 0,
    lastSentAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  }).returning({ id: emailVerificationChallengesTable.id });
  return challenge;
}

export async function updateVerificationPinHash(
  tx: DbTransaction,
  challengeId: number,
  pinHash: string,
  now: Date,
) {
  await tx.update(emailVerificationChallengesTable)
    .set({ pinHash, updatedAt: now })
    .where(eq(emailVerificationChallengesTable.id, challengeId));
}

export async function findChallengeForUpdate(tx: DbTransaction, challengeId: number) {
  const [challenge] = await tx.select().from(emailVerificationChallengesTable)
    .where(eq(emailVerificationChallengesTable.id, challengeId))
    .limit(1)
    .for("update");
  return challenge ?? null;
}

export async function registerFailedAttempt(
  tx: DbTransaction,
  challengeId: number,
  attempts: number,
  now: Date,
) {
  await tx.update(emailVerificationChallengesTable).set({
    failedAttempts: attempts,
    consumedAt: attempts >= 5 ? now : null,
    updatedAt: now,
  }).where(eq(emailVerificationChallengesTable.id, challengeId));
}

export async function markChallengeVerified(
  tx: DbTransaction,
  challengeId: number,
  now: Date,
  consume: boolean,
) {
  await tx.update(emailVerificationChallengesTable).set({
    verifiedAt: now,
    consumedAt: consume ? now : null,
    updatedAt: now,
  }).where(eq(emailVerificationChallengesTable.id, challengeId));
}

export async function markClientEmailVerified(tx: DbTransaction, userId: number, now: Date) {
  await tx.update(usersTable).set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(usersTable.id, userId));
}

export const markUserEmailVerified = markClientEmailVerified;

export async function changeClientEmail(
  tx: DbTransaction,
  userId: number,
  email: string,
  now: Date,
) {
  const [updated] = await tx.update(usersTable).set({
    correo: email,
    emailVerifiedAt: now,
    updatedAt: now,
  }).where(eq(usersTable.id, userId)).returning({ id: usersTable.id });
  return updated ?? null;
}

export async function consumeVerifiedGuestChallenge(
  tx: DbTransaction,
  input: { challengeId: number; guestSessionHash: string; email: string },
) {
  const now = new Date();
  const [consumed] = await tx.update(emailVerificationChallengesTable)
    .set({ consumedAt: now, updatedAt: now })
    .where(and(
      eq(emailVerificationChallengesTable.id, input.challengeId),
      eq(emailVerificationChallengesTable.purpose, "GUEST_CHECKOUT"),
      eq(emailVerificationChallengesTable.guestSessionHash, input.guestSessionHash),
      eq(emailVerificationChallengesTable.email, input.email),
      isNull(emailVerificationChallengesTable.consumedAt),
      sql`${emailVerificationChallengesTable.verifiedAt} is not null`,
      sql`${emailVerificationChallengesTable.expiresAt} > now()`,
    )).returning({ id: emailVerificationChallengesTable.id });
  return consumed ?? null;
}

export { db };

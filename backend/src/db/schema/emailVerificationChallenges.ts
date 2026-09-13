import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const EMAIL_VERIFICATION_PURPOSES = [
  "CLIENT_REGISTRATION",
  "CLIENT_EMAIL_CHANGE",
  "GUEST_CHECKOUT",
  "INTERNAL_USER_REGISTRATION",
] as const;

export type EmailVerificationPurpose = (typeof EMAIL_VERIFICATION_PURPOSES)[number];

export const emailVerificationChallengesTable = pgTable(
  "email_verification_challenges",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    email: varchar({ length: 254 }).notNull(),
    purpose: varchar({ length: 40 }).notNull().$type<EmailVerificationPurpose>(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    guestSessionHash: varchar("guest_session_hash", { length: 64 }),
    pinHash: varchar("pin_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_verification_email_sent_idx").on(table.email, table.lastSentAt),
    index("email_verification_user_sent_idx").on(table.userId, table.lastSentAt),
    index("email_verification_guest_sent_idx").on(table.guestSessionHash, table.lastSentAt),
    uniqueIndex("email_verification_active_user_unique")
      .on(table.userId, table.purpose)
      .where(sql`${table.userId} is not null and ${table.consumedAt} is null`),
    uniqueIndex("email_verification_active_guest_unique")
      .on(table.guestSessionHash, table.purpose)
      .where(sql`${table.guestSessionHash} is not null and ${table.consumedAt} is null`),
    check(
      "email_verification_purpose_check",
      sql`${table.purpose} in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'GUEST_CHECKOUT', 'INTERNAL_USER_REGISTRATION')`,
    ),
    check(
      "email_verification_owner_check",
      sql`(
        ${table.purpose} in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'INTERNAL_USER_REGISTRATION')
        and ${table.userId} is not null
        and ${table.guestSessionHash} is null
      ) or (
        ${table.purpose} = 'GUEST_CHECKOUT'
        and ${table.userId} is null
        and ${table.guestSessionHash} is not null
        and length(${table.guestSessionHash}) = 64
      )`,
    ),
    check("email_verification_pin_hash_check", sql`length(${table.pinHash}) = 64`),
    check(
      "email_verification_attempts_check",
      sql`${table.failedAttempts} >= 0 and ${table.failedAttempts} <= 5`,
    ),
    check("email_verification_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export type EmailVerificationChallenge = typeof emailVerificationChallengesTable.$inferSelect;
export type NewEmailVerificationChallenge = typeof emailVerificationChallengesTable.$inferInsert;

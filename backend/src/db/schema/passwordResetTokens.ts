import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_token_hash_unique").on(table.tokenHash),
    index("password_reset_user_created_idx").on(table.userId, table.createdAt),
    index("password_reset_expires_idx").on(table.expiresAt),
    check("password_reset_token_hash_check", sql`length(${table.tokenHash}) = 64`),
    check("password_reset_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokensTable.$inferInsert;

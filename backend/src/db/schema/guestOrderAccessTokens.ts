import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { onlineOrdersTable } from "./onlineOrders.js";

export const guestOrderAccessTokensTable = pgTable(
  "guest_order_access_tokens",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => onlineOrdersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("guest_order_access_tokens_order_id_idx").on(table.orderId),
    uniqueIndex("guest_order_access_tokens_hash_unique").on(table.tokenHash),
    check(
      "guest_order_access_tokens_hash_length_check",
      sql`length(${table.tokenHash}) = 64`,
    ),
    check(
      "guest_order_access_tokens_expiration_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export type GuestOrderAccessToken = typeof guestOrderAccessTokensTable.$inferSelect;
export type NewGuestOrderAccessToken = typeof guestOrderAccessTokensTable.$inferInsert;

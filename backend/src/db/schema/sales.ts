import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const salesTable = pgTable(
  "sales", {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    date: timestamp().notNull().defaultNow(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    total: numeric({ precision: 12, scale: 2 }).notNull(),
    status: varchar({ length: 50 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "sales_status_check",
      sql`${table.status} in ('ACTIVE', 'PARTIALLY_RETURNED', 'CANCELLED')`,
    ),
  ],
);

export type Sale = typeof salesTable.$inferSelect;
export type NewSale = typeof salesTable.$inferInsert;

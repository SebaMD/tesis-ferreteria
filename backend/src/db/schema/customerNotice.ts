import { boolean, check, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users.js";

export const customerNoticeTable = pgTable(
  "customer_notice",
  {
    id: integer().primaryKey().default(1),
    title: varchar({ length: 120 }).notNull().default(""),
    message: varchar({ length: 1000 }).notNull().default(""),
    active: boolean().notNull().default(false),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("customer_notice_singleton_check", sql`${table.id} = 1`),
  ],
);

export type CustomerNotice = typeof customerNoticeTable.$inferSelect;

import { boolean, check, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users.js";

export const customerNoticeTable = pgTable(
  "customer_notice",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    title: varchar({ length: 120 }).notNull(),
    message: varchar({ length: 1000 }).notNull(),
    imagePath: varchar("image_path", { length: 500 }),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    displaySeconds: integer("display_seconds").notNull().default(7),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("customer_notice_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "customer_notice_display_seconds_check",
      sql`${table.displaySeconds} between 3 and 30`,
    ),
    check(
      "customer_notice_validity_check",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export type CustomerNotice = typeof customerNoticeTable.$inferSelect;

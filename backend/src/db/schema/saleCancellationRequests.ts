import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { salesTable } from "./sales.js";
import { usersTable } from "./users.js";

export const saleCancellationRequestsTable = pgTable(
  "sale_cancellation_requests",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => salesTable.id),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => usersTable.id),
    reason: text().notNull(),
    status: varchar({ length: 20 }).notNull().default("PENDING"),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id),
    adminResponse: text("admin_response"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reversedBy: integer("reversed_by").references(() => usersTable.id),
    reversedAt: timestamp("reversed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("sale_cancellation_requests_sale_id_idx").on(table.saleId),
    index("sale_cancellation_requests_requested_by_idx").on(table.requestedBy),
    index("sale_cancellation_requests_reversed_by_idx").on(table.reversedBy),
    uniqueIndex("sale_cancellation_requests_pending_sale_unique")
      .on(table.saleId)
      .where(sql`${table.status} = 'PENDING'`),
    check(
      "sale_cancellation_requests_status_check",
      sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED')`,
    ),
  ],
);

export type SaleCancellationRequest = typeof saleCancellationRequestsTable.$inferSelect;
export type NewSaleCancellationRequest = typeof saleCancellationRequestsTable.$inferInsert;

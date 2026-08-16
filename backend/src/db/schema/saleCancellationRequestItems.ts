import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";
import { saleCancellationRequestsTable } from "./saleCancellationRequests.js";

export const saleCancellationRequestItemsTable = pgTable(
  "sale_cancellation_request_items",
  {
    requestId: integer("request_id")
      .notNull()
      .references(() => saleCancellationRequestsTable.id),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    requestedQuantity: integer("requested_quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.productId] }),
    check(
      "sale_cancellation_request_items_quantity_positive",
      sql`${table.requestedQuantity} > 0`,
    ),
  ],
);

export type SaleCancellationRequestItem = typeof saleCancellationRequestItemsTable.$inferSelect;
export type NewSaleCancellationRequestItem = typeof saleCancellationRequestItemsTable.$inferInsert;

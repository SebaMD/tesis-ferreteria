import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";
import { saleCancellationRequestsTable } from "./saleCancellationRequests.js";
import { saleDetailsTable } from "./saleDetails.js";
import { salesTable } from "./sales.js";

export const saleCancellationRequestItemsTable = pgTable(
  "sale_cancellation_request_items",
  {
    requestId: integer("request_id")
      .notNull()
      .references(() => saleCancellationRequestsTable.id),
    saleId: integer("sale_id")
      .notNull()
      .references(() => salesTable.id),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    requestedQuantity: integer("requested_quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.productId] }),
    foreignKey({
      columns: [table.saleId, table.productId],
      foreignColumns: [saleDetailsTable.saleId, saleDetailsTable.productId],
      name: "sale_cancellation_request_items_sale_detail_fk",
    }),
    check(
      "sale_cancellation_request_items_quantity_positive",
      sql`${table.requestedQuantity} > 0`,
    ),
  ],
);

export type SaleCancellationRequestItem = typeof saleCancellationRequestItemsTable.$inferSelect;
export type NewSaleCancellationRequestItem = typeof saleCancellationRequestItemsTable.$inferInsert;

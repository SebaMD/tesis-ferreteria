import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { onlineOrdersTable } from "./onlineOrders.js";
import { productsTable } from "./products.js";

export const onlineOrderItemsTable = pgTable(
  "online_order_items",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => onlineOrdersTable.id),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    quantity: integer().notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.productId] }),
    index("online_order_items_product_id_idx").on(table.productId),
    check("online_order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("online_order_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check("online_order_items_subtotal_non_negative", sql`${table.subtotal} >= 0`),
  ],
);

export type OnlineOrderItem = typeof onlineOrderItemsTable.$inferSelect;
export type NewOnlineOrderItem = typeof onlineOrderItemsTable.$inferInsert;

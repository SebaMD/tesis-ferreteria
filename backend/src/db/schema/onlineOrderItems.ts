import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { onlineOrdersTable } from "./onlineOrders.js";
import { productsTable } from "./products.js";
import { promotionsTable, type PromotionType } from "./promotions.js";

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
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    promotionId: integer("promotion_id")
      .references(() => promotionsTable.id, { onDelete: "restrict" }),
    promotionTypeSnapshot: varchar("promotion_type_snapshot", { length: 40 }).$type<PromotionType>(),
    promotionNameSnapshot: varchar("promotion_name_snapshot", { length: 160 }),
    promotionValueSnapshot: integer("promotion_value_snapshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.productId] }),
    index("online_order_items_product_id_idx").on(table.productId),
    index("online_order_items_promotion_id_idx").on(table.promotionId),
    check("online_order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("online_order_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check("online_order_items_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("online_order_items_discount_non_negative", sql`${table.discountAmount} >= 0`),
    check(
      "online_order_items_amounts_consistent",
      sql`${table.subtotal} + ${table.discountAmount} = ${table.unitPrice} * ${table.quantity}`,
    ),
    check(
      "online_order_items_promotion_snapshot_check",
      sql`(
        (${table.promotionId} is null
          and ${table.promotionTypeSnapshot} is null
          and ${table.promotionNameSnapshot} is null
          and ${table.promotionValueSnapshot} is null
          and ${table.discountAmount} = 0)
        or
        (${table.promotionId} is not null
          and ${table.promotionTypeSnapshot} in ('PERCENTAGE_DISCOUNT', 'BUY_2_PAY_1')
          and ${table.promotionNameSnapshot} is not null
          and (
            (${table.promotionTypeSnapshot} = 'PERCENTAGE_DISCOUNT' and ${table.promotionValueSnapshot} between 1 and 99)
            or (${table.promotionTypeSnapshot} = 'BUY_2_PAY_1' and ${table.promotionValueSnapshot} is null)
          ))
      )`,
    ),
  ],
);

export type OnlineOrderItem = typeof onlineOrderItemsTable.$inferSelect;
export type NewOnlineOrderItem = typeof onlineOrderItemsTable.$inferInsert;

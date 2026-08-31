import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { onlineOrdersTable } from "./onlineOrders.js";
import { productsTable } from "./products.js";
import { usersTable } from "./users.js";

export const inventoryMovementsTable = pgTable(
  "inventory_movements", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    userId: integer("user_id")
      .references(() => usersTable.id),
    onlineOrderId: integer("online_order_id")
      .references(() => onlineOrdersTable.id),
    movementType: varchar("movement_type", { length: 50 }).notNull(),
    quantity: integer().notNull(),
    reason: text(),
    date: timestamp().notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_movements_online_order_product_exit_unique")
      .on(table.onlineOrderId, table.productId, table.movementType)
      .where(sql`${table.onlineOrderId} is not null and ${table.movementType} = 'EXIT'`),
    check(
      "inventory_movements_actor_or_online_order_check",
      sql`${table.userId} is not null or (
        ${table.onlineOrderId} is not null and ${table.movementType} = 'EXIT'
      )`,
    ),
    check(
      "inventory_movements_online_order_exit_check",
      sql`${table.onlineOrderId} is null or ${table.movementType} = 'EXIT'`,
    ),
  ],
);

export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovementsTable.$inferInsert;

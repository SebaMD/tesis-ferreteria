import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";
import { usersTable } from "./users.js";

export const inventoryMovementsTable = pgTable(
  "inventory_movements", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    movementType: varchar("movement_type", { length: 50 }).notNull(),
    quantity: integer().notNull(),
    reason: text(),
    date: timestamp().notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovementsTable.$inferInsert;

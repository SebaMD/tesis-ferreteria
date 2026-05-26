import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories.js";

export const productsTable = pgTable(
  "products", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    name: varchar({ length: 150 }).notNull(),
    description: text(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    unitMeasure: varchar("unit_measure", { length: 50 }).notNull(),
    currentStock: integer("current_stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    status: boolean().notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;

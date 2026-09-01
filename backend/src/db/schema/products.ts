import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { categoriesTable } from "./categories.js";

export const productsTable = pgTable(
  "products", {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    name: varchar({ length: 150 }).notNull(),
    barcode: varchar({ length: 64 }),
    description: text(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    unitMeasure: varchar("unit_measure", { length: 50 }).notNull(),
    currentStock: integer("current_stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    status: boolean().notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_category_name_unique").on(
      table.categoryId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("products_barcode_unique").on(table.barcode),
  ],
);

export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;

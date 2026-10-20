import {
  boolean,
  check,
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
import { productFamiliesTable } from "./productFamilies.js";

export const productsTable = pgTable(
  "products", {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    familyId: integer("family_id").references(() => productFamiliesTable.id, { onDelete: "restrict" }),
    variantKey: varchar("variant_key", { length: 500 }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    name: varchar({ length: 150 }).notNull(),
    brand: varchar({ length: 100 }),
    barcode: varchar({ length: 64 }),
    description: text(),
    price: numeric({ precision: 12, scale: 2 }).notNull(),
    unitMeasure: varchar("unit_measure", { length: 50 }).notNull(),
    currentStock: integer("current_stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    inStoreOnly: boolean("in_store_only").notNull().default(false),
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
    uniqueIndex("products_family_variant_unique").on(table.familyId, table.variantKey),
    uniqueIndex("products_id_family_unique").on(table.id, table.familyId),
    check("products_family_key_pair", sql`(${table.familyId} is null) = (${table.variantKey} is null)`),
  ],
);

export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;

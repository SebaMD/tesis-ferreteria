import { integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { categoriesTable } from "./categories.js";

export const productFamiliesTable = pgTable("product_families", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  name: varchar({ length: 150 }).notNull(),
  description: text(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  brand: varchar({ length: 100 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("product_families_category_name_unique").on(t.categoryId, sql`lower(${t.name})`)]);

export const familyAttributesTable = pgTable("family_attributes", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  familyId: integer("family_id").notNull().references(() => productFamiliesTable.id, { onDelete: "restrict" }),
  name: varchar({ length: 60 }).notNull(),
  position: integer().notNull().default(0),
}, (t) => [
  uniqueIndex("family_attributes_name_unique").on(t.familyId, sql`lower(${t.name})`),
  uniqueIndex("family_attributes_id_family_unique").on(t.id, t.familyId),
]);

export const familyAttributeOptionsTable = pgTable("family_attribute_options", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  attributeId: integer("attribute_id").notNull().references(() => familyAttributesTable.id, { onDelete: "restrict" }),
  label: varchar({ length: 100 }).notNull(),
  position: integer().notNull().default(0),
}, (t) => [
  uniqueIndex("family_attribute_options_label_unique").on(t.attributeId, sql`lower(${t.label})`),
  uniqueIndex("family_attribute_options_id_attribute_unique").on(t.id, t.attributeId),
]);

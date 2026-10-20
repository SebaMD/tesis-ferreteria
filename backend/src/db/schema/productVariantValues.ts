import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productsTable } from "./products.js";
import { familyAttributesTable, familyAttributeOptionsTable, productFamiliesTable } from "./productFamilies.js";
import { usersTable } from "./users.js";

export const productVariantValuesTable = pgTable("product_variant_values", {
  productId: integer("product_id").notNull(),
  familyId: integer("family_id").notNull(),
  attributeId: integer("attribute_id").notNull(),
  optionId: integer("option_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.productId, t.attributeId] }),
  foreignKey({ columns: [t.productId, t.familyId], foreignColumns: [productsTable.id, productsTable.familyId] }).onDelete("cascade"),
  foreignKey({ columns: [t.attributeId, t.familyId], foreignColumns: [familyAttributesTable.id, familyAttributesTable.familyId] }),
  foreignKey({ columns: [t.optionId, t.attributeId], foreignColumns: [familyAttributeOptionsTable.id, familyAttributeOptionsTable.attributeId] }),
]);

export const productFamilyEventsTable = pgTable("product_family_events", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  productId: integer("product_id").references(() => productsTable.id),
  familyId: integer("family_id").references(() => productFamiliesTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  previous: jsonb().notNull(),
  next: jsonb().notNull(),
  reason: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("product_family_events_subject_check", sql`${t.productId} is not null or ${t.familyId} is not null`)]);

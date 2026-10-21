import { sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgTable, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const deliveryPolicyRevisionsTable = pgTable("delivery_policy_revisions", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  version: integer().notNull().unique(),
  pickupEnabled: boolean("pickup_enabled").notNull(),
  deliveryEnabled: boolean("delivery_enabled").notNull(),
  flatFee: numeric("flat_fee", { precision: 12, scale: 2 }).notNull(),
  minimumProductsTotal: numeric("minimum_products_total", { precision: 12, scale: 2 }),
  freeShippingFrom: numeric("free_shipping_from", { precision: 12, scale: 2 }),
  isDemo: boolean("is_demo").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [check("delivery_policy_amounts_check", sql`${t.version} > 0 and ${t.flatFee} >= 0 and ${t.flatFee} = trunc(${t.flatFee}) and (${t.minimumProductsTotal} is null or (${t.minimumProductsTotal} >= 0 and ${t.minimumProductsTotal} = trunc(${t.minimumProductsTotal}))) and (${t.freeShippingFrom} is null or (${t.freeShippingFrom} > 0 and ${t.freeShippingFrom} = trunc(${t.freeShippingFrom})))`)]);

export const deliverySettingsTable = pgTable("delivery_settings", {
  id: integer().primaryKey().default(1),
  currentRevisionId: integer("current_revision_id").references(() => deliveryPolicyRevisionsTable.id, { onDelete: "restrict" }),
}, (t) => [check("delivery_settings_singleton", sql`${t.id} = 1`)]);

import { sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
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
  pricingMode: varchar("pricing_mode", { length: 20 }),
  conditionalFreeEnabled: boolean("conditional_free_enabled"),
  conditionalFreeFrom: numeric("conditional_free_from", { precision: 12, scale: 2 }),
  approvalValidityHours: integer("approval_validity_hours"),
  evaluationValidityHours: integer("evaluation_validity_hours"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [check("delivery_policy_amounts_check", sql`${t.version} > 0 and ${t.flatFee} >= 0 and ${t.flatFee} = trunc(${t.flatFee}) and (${t.minimumProductsTotal} is null or (${t.minimumProductsTotal} >= 0 and ${t.minimumProductsTotal} = trunc(${t.minimumProductsTotal}))) and (${t.freeShippingFrom} is null or (${t.freeShippingFrom} > 0 and ${t.freeShippingFrom} = trunc(${t.freeShippingFrom})))`),
  check("delivery_manual_policy_check", sql`(${t.pricingMode} is null and ${t.conditionalFreeEnabled} is null and ${t.conditionalFreeFrom} is null and ${t.approvalValidityHours} is null and ${t.evaluationValidityHours} is null) or (${t.pricingMode} is not null and ${t.pricingMode}='MANUAL_QUOTE' and ${t.conditionalFreeEnabled} is not null and ${t.conditionalFreeFrom} is not null and ${t.conditionalFreeFrom}>0 and ${t.conditionalFreeFrom}=trunc(${t.conditionalFreeFrom}) and ${t.approvalValidityHours} is not null and ${t.evaluationValidityHours} is not null and ${t.approvalValidityHours} between 1 and 168 and ${t.evaluationValidityHours} between 1 and 720 and ${t.pickupEnabled}=true and ${t.flatFee}=0 and ${t.freeShippingFrom} is null and ${t.minimumProductsTotal} is null and ${t.isDemo}=false) or (${t.pricingMode}='LOCAL_FIXED' and ${t.conditionalFreeEnabled} is null and ${t.conditionalFreeFrom} is null and ${t.approvalValidityHours} is null and ${t.evaluationValidityHours} is null and ${t.minimumProductsTotal} is null and ${t.pickupEnabled}=true and ${t.isDemo}=false)`),
]);

export const deliverySettingsTable = pgTable("delivery_settings", {
  id: integer().primaryKey().default(1),
  currentRevisionId: integer("current_revision_id").references(() => deliveryPolicyRevisionsTable.id, { onDelete: "restrict" }),
}, (t) => [check("delivery_settings_singleton", sql`${t.id} = 1`)]);

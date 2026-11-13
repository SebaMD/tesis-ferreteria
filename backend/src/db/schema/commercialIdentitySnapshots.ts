import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";
import { saleDetailsTable } from "./saleDetails.js";
import { onlineOrderItemsTable } from "./onlineOrderItems.js";
import { inventoryMovementsTable } from "./inventoryMovements.js";
import { deliveryQuoteItemsTable } from "./deliveryQuotes.js";

export type CommercialIdentity = {
  name: string; barcode: string | null; brand: string | null; unitMeasure: string; variantKey: string | null;
  category: { id: number; name: string };
  family: { id: number; name: string; attributes: Array<{ attributeId: number; name: string; optionId: number; label: string }> } | null;
};
export type IdentityOrigin = "ORIGINAL" | "LEGACY_REFERENCE" | "LEGACY_PARTIAL";
export type HistoricalIdentity = { version: 1; origin: IdentityOrigin; capturedAt: string; identity: CommercialIdentity };

export const commercialIdentitySnapshotsTable = pgTable("commercial_identity_snapshots", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  saleId: integer("sale_id"), orderId: integer("order_id"),
  movementId: integer("movement_id").references(() => inventoryMovementsTable.id, { onDelete: "restrict" }),
  deliveryQuoteItemId: integer("delivery_quote_item_id").references(() => deliveryQuoteItemsTable.id, { onDelete: "restrict" }),
  version: integer().notNull().default(1), origin: varchar({ length: 24 }).$type<IdentityOrigin>().notNull(),
  identity: jsonb().$type<CommercialIdentity>().notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.saleId, t.productId], foreignColumns: [saleDetailsTable.saleId, saleDetailsTable.productId] }),
  foreignKey({ columns: [t.orderId, t.productId], foreignColumns: [onlineOrderItemsTable.orderId, onlineOrderItemsTable.productId] }),
  uniqueIndex("identity_snapshot_sale_unique").on(t.saleId, t.productId).where(sql`${t.saleId} is not null`),
  uniqueIndex("identity_snapshot_order_unique").on(t.orderId, t.productId).where(sql`${t.orderId} is not null`),
  uniqueIndex("identity_snapshot_movement_unique").on(t.movementId),
  uniqueIndex("identity_snapshot_quote_item_unique").on(t.deliveryQuoteItemId),
  check("identity_snapshot_subject_check", sql`num_nonnulls(${t.saleId},${t.orderId},${t.movementId},${t.deliveryQuoteItemId})=1`),
  check("identity_snapshot_format_check", sql`${t.version}=1 and ${t.origin} in ('ORIGINAL','LEGACY_REFERENCE','LEGACY_PARTIAL') and coalesce(jsonb_typeof(${t.identity}->'name')='string' and jsonb_typeof(${t.identity}->'unitMeasure')='string' and jsonb_typeof(${t.identity}->'category')='object',false)`),
]);

import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";
import { salesTable } from "./sales.js";

export const saleDetailsTable = pgTable(
    "sale_details",
    {
        saleId: integer("sale_id")
        .notNull()
        .references(() => salesTable.id),
        productId: integer("product_id")
        .notNull()
        .references(() => productsTable.id),
        quantity: integer().notNull(),
        returnedQuantity: integer("returned_quantity").notNull().default(0),
        unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
        subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.saleId, table.productId] }),
        check("sale_details_returned_quantity_non_negative", sql`${table.returnedQuantity} >= 0`),
        check("sale_details_returned_quantity_not_above_sold", sql`${table.returnedQuantity} <= ${table.quantity}`),
    ],
);

export type SaleDetail = typeof saleDetailsTable.$inferSelect;
export type NewSaleDetail = typeof saleDetailsTable.$inferInsert;

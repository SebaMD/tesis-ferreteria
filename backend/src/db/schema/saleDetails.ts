import { integer, numeric, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
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
        unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
        subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.saleId, table.productId] })],
);

export type SaleDetail = typeof saleDetailsTable.$inferSelect;
export type NewSaleDetail = typeof saleDetailsTable.$inferInsert;

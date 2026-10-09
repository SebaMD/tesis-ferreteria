import { integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { productsTable } from "./products.js";

export const clientProductFavoritesTable = pgTable("client_product_favorites", {
  clientId: integer("client_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.clientId, table.productId] })]);

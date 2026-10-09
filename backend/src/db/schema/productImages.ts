import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";

export const productImagesTable = pgTable(
  "product_images",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    imagePath: varchar("image_path", { length: 500 }).notNull(),
    position: integer().notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("product_images_product_id_idx").on(table.productId),
    uniqueIndex("product_images_one_primary_unique")
      .on(table.productId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export type ProductImage = typeof productImagesTable.$inferSelect;
export type NewProductImage = typeof productImagesTable.$inferInsert;

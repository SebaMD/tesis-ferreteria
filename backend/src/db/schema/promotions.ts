import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories.js";
import { productsTable } from "./products.js";
import { usersTable } from "./users.js";

export const PROMOTION_TYPES = ["PERCENTAGE_DISCOUNT", "BUY_2_PAY_1"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const promotionsTable = pgTable(
  "promotions",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    name: varchar({ length: 160 }).notNull(),
    type: varchar({ length: 40 }).$type<PromotionType>().notNull(),
    isActive: boolean("is_active").notNull().default(false),
    percentage: integer(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("promotions_active_validity_idx").on(table.isActive, table.startsAt, table.endsAt),
    check(
      "promotions_type_check",
      sql`${table.type} in ('PERCENTAGE_DISCOUNT', 'BUY_2_PAY_1')`,
    ),
    check(
      "promotions_percentage_check",
      sql`(
        (${table.type} = 'PERCENTAGE_DISCOUNT' and ${table.percentage} between 1 and 99)
        or (${table.type} = 'BUY_2_PAY_1' and ${table.percentage} is null)
      )`,
    ),
    check(
      "promotions_validity_check",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const promotionProductsTable = pgTable(
  "promotion_products",
  {
    promotionId: integer("promotion_id")
      .notNull()
      .references(() => promotionsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.promotionId, table.productId] }),
    index("promotion_products_product_id_idx").on(table.productId),
  ],
);

export const promotionCategoriesTable = pgTable(
  "promotion_categories",
  {
    promotionId: integer("promotion_id")
      .notNull()
      .references(() => promotionsTable.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.promotionId, table.categoryId] }),
    index("promotion_categories_category_id_idx").on(table.categoryId),
  ],
);

export type Promotion = typeof promotionsTable.$inferSelect;
export type NewPromotion = typeof promotionsTable.$inferInsert;

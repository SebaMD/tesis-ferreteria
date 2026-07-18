import {
    integer,
    pgTable,
    text,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable(
    "categories", {
        id: integer().primaryKey().generatedAlwaysAsIdentity(),
        name: varchar({ length: 100 }).notNull().unique(),
        description: text(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    }
);

export type Category = typeof categoriesTable.$inferSelect;
export type NewCategory = typeof categoriesTable.$inferInsert;

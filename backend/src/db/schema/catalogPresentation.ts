import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const catalogPresentationTable = pgTable(
  "catalog_presentation",
  {
    id: integer().primaryKey().default(1),
    title: varchar({ length: 120 }).notNull(),
    mainText: varchar("main_text", { length: 220 }).notNull(),
    secondaryText: varchar("secondary_text", { length: 600 }).notNull(),
    imagePath: varchar("image_path", { length: 500 }),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("catalog_presentation_singleton_check", sql`${table.id} = 1`),
  ],
);

export type CatalogPresentation = typeof catalogPresentationTable.$inferSelect;

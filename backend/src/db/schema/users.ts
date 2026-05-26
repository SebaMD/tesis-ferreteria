import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { rolesTable } from "./roles.js";

export const usersTable = pgTable(
  "users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roleId: integer("role_id")
      .notNull()
      .references(() => rolesTable.id),
    rut: varchar({ length: 12 }).notNull().unique(),
    names: varchar({ length: 120 }).notNull(),
    surnames: varchar({ length: 120 }).notNull(),
    correo: varchar({ length: 255 }).notNull().unique(),
    password: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 20 }),
    status: varchar({ length: 50 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

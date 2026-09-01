import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { rolesTable } from "./roles.js";

export const usersTable = pgTable(
  "users", {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
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
    workShift: varchar("work_shift", { length: 50 }),
    shiftStartTime: varchar("shift_start_time", { length: 5 }),
    shiftEndTime: varchar("shift_end_time", { length: 5 }),
    shiftNote: varchar("shift_note", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

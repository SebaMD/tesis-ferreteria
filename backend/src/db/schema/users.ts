import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
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
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    password: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 20 }),
    status: varchar({ length: 50 }).notNull().default("ACTIVE"),
    selfDeactivatedAt: timestamp("self_deactivated_at", { withTimezone: true }),
    authVersion: integer("auth_version").notNull().default(1),
    workShift: varchar("work_shift", { length: 50 }),
    shiftStartTime: varchar("shift_start_time", { length: 5 }),
    shiftEndTime: varchar("shift_end_time", { length: 5 }),
    shiftNote: varchar("shift_note", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("users_auth_version_check", sql`${table.authVersion} >= 1`),
    check(
      "users_self_deactivation_check",
      sql`${table.selfDeactivatedAt} is null or ${table.status} = 'INACTIVE'`,
    ),
  ],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

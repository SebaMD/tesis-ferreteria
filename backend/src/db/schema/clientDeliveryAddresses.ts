import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const clientDeliveryAddressesTable = pgTable(
  "client_delivery_addresses",
  {
    clientId: integer("client_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 240 }).notNull(),
    phone: varchar({ length: 20 }).notNull(),
    address: varchar({ length: 300 }).notNull(),
    commune: varchar({ length: 120 }).notNull(),
    reference: varchar({ length: 500 }),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "client_delivery_addresses_required_data_check",
      sql`length(btrim(${table.recipientName})) > 0
        and length(btrim(${table.phone})) > 0
        and length(btrim(${table.address})) > 0
        and length(btrim(${table.commune})) > 0`,
    ),
    check(
      "client_delivery_addresses_coordinates_check",
      sql`(
        ${table.latitude} is null and ${table.longitude} is null
      ) or (
        ${table.latitude} is not null
        and ${table.longitude} is not null
        and ${table.latitude} between -90 and 90
        and ${table.longitude} between -180 and 180
      )`,
    ),
  ],
);

export type ClientDeliveryAddress = typeof clientDeliveryAddressesTable.$inferSelect;
export type NewClientDeliveryAddress = typeof clientDeliveryAddressesTable.$inferInsert;

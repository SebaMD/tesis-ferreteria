import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { salesTable } from "./sales.js";
import { usersTable } from "./users.js";

export const saleDeliveriesTable = pgTable(
  "sale_deliveries",
  {
    saleId: integer("sale_id")
      .primaryKey()
      .references(() => salesTable.id),
    status: varchar({ length: 30 }).notNull().default("PAID"),
    recipientName: varchar("recipient_name", { length: 240 }).notNull(),
    recipientRut: varchar("recipient_rut", { length: 12 }).notNull(),
    phone: varchar({ length: 20 }).notNull(),
    address: varchar({ length: 300 }).notNull(),
    commune: varchar({ length: 120 }).notNull(),
    reference: varchar({ length: 500 }),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    preparationStartedBy: integer("preparation_started_by")
      .references(() => usersTable.id),
    preparationStartedAt: timestamp("preparation_started_at"),
    preparedBy: integer("prepared_by")
      .references(() => usersTable.id),
    preparedAt: timestamp("prepared_at"),
    deliveryStartedBy: integer("delivery_started_by")
      .references(() => usersTable.id),
    deliveryStartedAt: timestamp("delivery_started_at"),
    deliveredBy: integer("delivered_by")
      .references(() => usersTable.id),
    deliveredAt: timestamp("delivered_at"),
    receivedByName: varchar("received_by_name", { length: 240 }),
    receivedByRut: varchar("received_by_rut", { length: 12 }),
    deliveryProofImagePath: varchar("delivery_proof_image_path", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("sale_deliveries_status_idx").on(table.status),
    index("sale_deliveries_preparation_started_by_idx").on(table.preparationStartedBy),
    index("sale_deliveries_delivery_started_by_idx").on(table.deliveryStartedBy),
    index("sale_deliveries_created_at_idx").on(table.createdAt),
    check(
      "sale_deliveries_status_check",
      sql`${table.status} in ('PAID', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')`,
    ),
    check(
      "sale_deliveries_delivery_data_check",
      sql`length(btrim(${table.recipientName})) > 0
        and length(btrim(${table.recipientRut})) > 0
        and length(btrim(${table.phone})) > 0
        and length(btrim(${table.address})) > 0
        and length(btrim(${table.commune})) > 0`,
    ),
    check(
      "sale_deliveries_coordinates_check",
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

export type SaleDelivery = typeof saleDeliveriesTable.$inferSelect;
export type NewSaleDelivery = typeof saleDeliveriesTable.$inferInsert;
export type SaleDeliveryStatus =
  | "PAID"
  | "PREPARING"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

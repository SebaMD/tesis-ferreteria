import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const onlineOrdersTable = pgTable(
  "online_orders",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    clientId: integer("client_id")
      .references(() => usersTable.id),
    guestName: varchar("guest_name", { length: 240 }),
    guestEmail: varchar("guest_email", { length: 254 }),
    guestPhone: varchar("guest_phone", { length: 20 }),
    guestSessionHash: varchar("guest_session_hash", { length: 64 }),
    guestDeviceHash: varchar("guest_device_hash", { length: 64 }),
    checkoutKey: varchar("checkout_key", { length: 64 }).notNull(),
    status: varchar({ length: 30 }).notNull().default("PENDING_PAYMENT"),
    total: numeric({ precision: 12, scale: 2 }).notNull(),
    deliveryType: varchar("delivery_type", { length: 20 }).notNull().default("PICKUP"),
    deliveryRecipientName: varchar("delivery_recipient_name", { length: 240 }),
    deliveryPhone: varchar("delivery_phone", { length: 20 }),
    deliveryAddress: varchar("delivery_address", { length: 300 }),
    deliveryCommune: varchar("delivery_commune", { length: 120 }),
    deliveryReference: varchar("delivery_reference", { length: 500 }),
    deliveryLatitude: doublePrecision("delivery_latitude"),
    deliveryLongitude: doublePrecision("delivery_longitude"),
    reservationExpiresAt: timestamp("reservation_expires_at").notNull(),
    paidAt: timestamp("paid_at"),
    clientArchivedAt: timestamp("client_archived_at"),
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
    index("online_orders_client_id_idx").on(table.clientId),
    index("online_orders_status_idx").on(table.status),
    index("online_orders_delivery_type_idx").on(table.deliveryType),
    index("online_orders_preparation_started_by_idx").on(table.preparationStartedBy),
    index("online_orders_delivery_started_by_idx").on(table.deliveryStartedBy),
    index("online_orders_reservation_expires_at_idx").on(table.reservationExpiresAt),
    index("online_orders_guest_device_hash_idx")
      .on(table.guestDeviceHash)
      .where(sql`${table.guestDeviceHash} is not null`),
    uniqueIndex("online_orders_client_checkout_key_unique")
      .on(table.clientId, table.checkoutKey)
      .where(sql`${table.clientId} is not null`),
    uniqueIndex("online_orders_guest_checkout_key_unique")
      .on(table.guestSessionHash, table.checkoutKey)
      .where(sql`${table.guestSessionHash} is not null`),
    uniqueIndex("online_orders_pending_client_unique")
      .on(table.clientId)
      .where(sql`${table.clientId} is not null and ${table.status} = 'PENDING_PAYMENT'`),
    uniqueIndex("online_orders_pending_guest_session_unique")
      .on(table.guestSessionHash)
      .where(sql`${table.guestSessionHash} is not null and ${table.status} = 'PENDING_PAYMENT'`),
    check(
      "online_orders_status_check",
      sql`${table.status} in ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')`,
    ),
    check(
      "online_orders_delivery_type_check",
      sql`${table.deliveryType} in ('PICKUP', 'DELIVERY')`,
    ),
    check(
      "online_orders_delivery_data_check",
      sql`${table.deliveryType} = 'PICKUP' or (
        ${table.deliveryRecipientName} is not null
        and length(btrim(${table.deliveryRecipientName})) > 0
        and ${table.deliveryPhone} is not null
        and length(btrim(${table.deliveryPhone})) > 0
        and ${table.deliveryAddress} is not null
        and length(btrim(${table.deliveryAddress})) > 0
        and ${table.deliveryCommune} is not null
        and length(btrim(${table.deliveryCommune})) > 0
      )`,
    ),
    check(
      "online_orders_delivery_coordinates_check",
      sql`(
        ${table.deliveryLatitude} is null and ${table.deliveryLongitude} is null
      ) or (
        ${table.deliveryLatitude} is not null
        and ${table.deliveryLongitude} is not null
        and ${table.deliveryLatitude} between -90 and 90
        and ${table.deliveryLongitude} between -180 and 180
      )`,
    ),
    check(
      "online_orders_owner_check",
      sql`(
        ${table.clientId} is not null
        and ${table.guestName} is null
        and ${table.guestEmail} is null
        and ${table.guestPhone} is null
        and ${table.guestSessionHash} is null
        and ${table.guestDeviceHash} is null
      ) or (
        ${table.clientId} is null
        and ${table.guestName} is not null
        and length(btrim(${table.guestName})) > 0
        and ${table.guestEmail} is not null
        and length(btrim(${table.guestEmail})) > 0
        and ${table.guestPhone} is not null
        and length(btrim(${table.guestPhone})) > 0
        and ${table.guestSessionHash} is not null
        and length(${table.guestSessionHash}) = 64
      )`,
    ),
    check(
      "online_orders_guest_device_hash_length_check",
      sql`${table.guestDeviceHash} is null or length(${table.guestDeviceHash}) = 64`,
    ),
    check("online_orders_total_positive", sql`${table.total} > 0`),
  ],
);

export type OnlineOrder = typeof onlineOrdersTable.$inferSelect;
export type NewOnlineOrder = typeof onlineOrdersTable.$inferInsert;

export type OnlineOrderDeliveryType = "PICKUP" | "DELIVERY";
export type OnlineOrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PAYMENT_FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "PAYMENT_REVIEW"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

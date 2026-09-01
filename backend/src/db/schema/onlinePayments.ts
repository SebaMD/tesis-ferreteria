import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { onlineOrdersTable } from "./onlineOrders.js";

export const onlinePaymentsTable = pgTable(
  "online_payments",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => onlineOrdersTable.id),
    provider: varchar({ length: 30 }).notNull().default("WEBPAY_PLUS"),
    buyOrder: varchar("buy_order", { length: 26 }).notNull(),
    sessionId: varchar("session_id", { length: 61 }).notNull(),
    token: varchar({ length: 64 }),
    redirectUrl: varchar("redirect_url", { length: 500 }),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    status: varchar({ length: 20 }).notNull().default("CREATED"),
    authorizationCode: varchar("authorization_code", { length: 6 }),
    paymentTypeCode: varchar("payment_type_code", { length: 4 }),
    responseCode: integer("response_code"),
    transactionDate: timestamp("transaction_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("online_payments_order_id_idx").on(table.orderId),
    index("online_payments_status_idx").on(table.status),
    uniqueIndex("online_payments_buy_order_unique").on(table.buyOrder),
    uniqueIndex("online_payments_token_unique").on(table.token),
    check("online_payments_provider_check", sql`${table.provider} = 'WEBPAY_PLUS'`),
    check(
      "online_payments_status_check",
      sql`${table.status} in ('CREATED', 'PROCESSING', 'AUTHORIZED', 'FAILED', 'CANCELLED', 'EXPIRED')`,
    ),
    check("online_payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type OnlinePayment = typeof onlinePaymentsTable.$inferSelect;
export type NewOnlinePayment = typeof onlinePaymentsTable.$inferInsert;

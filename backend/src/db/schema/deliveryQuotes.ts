import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { productsTable } from "./products.js";
import { deliveryPolicyRevisionsTable } from "./deliverySettings.js";

export const deliveryQuoteRequestsTable = pgTable("delivery_quote_requests", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  clientId: integer("client_id").references(()=>usersTable.id,{onDelete:"restrict"}),
  guestName: varchar("guest_name",{length:240}), guestEmail: varchar("guest_email",{length:254}), guestSessionHash: varchar("guest_session_hash",{length:64}),
  requestKey: varchar("request_key",{length:80}).notNull(), requestHash: varchar("request_hash",{length:64}).notNull(),
  recipientName: varchar("recipient_name",{length:240}).notNull(), phone: varchar({length:20}).notNull(), address: varchar({length:300}).notNull(), commune: varchar({length:120}).notNull(),
  reference: varchar({length:500}), nonUrgent: boolean("non_urgent").notNull().default(false),
  status: varchar({length:24}).notNull().default("REQUESTED"), version: integer().notNull().default(1),
  assignedTo: integer("assigned_to").references(()=>usersTable.id,{onDelete:"restrict"}),
  policyRevisionId: integer("policy_revision_id").notNull().references(()=>deliveryPolicyRevisionsTable.id,{onDelete:"restrict"}),
  commercialSnapshot: jsonb("commercial_snapshot").notNull(),
  evaluationExpiresAt: timestamp("evaluation_expires_at",{withTimezone:true}).notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  check("delivery_quote_owner_check",sql`(${t.clientId} is not null and ${t.guestName} is null and ${t.guestEmail} is null and ${t.guestSessionHash} is null) or (${t.clientId} is null and ${t.guestName} is not null and ${t.guestEmail} is not null and length(btrim(${t.guestName}))>0 and length(btrim(${t.guestEmail}))>0 and ${t.guestSessionHash} is not null and length(${t.guestSessionHash})=64)`),
  check("delivery_quote_state_check",sql`${t.status} in ('REQUESTED','ASSIGNED','PROPOSED','APPROVED','REJECTED','CANCELLED','EXPIRED','ORDER_CREATED','CLOSED_UNPAID') and ${t.version}>0 and (${t.status} not in ('ASSIGNED','PROPOSED') or ${t.assignedTo} is not null)`),
  check("delivery_quote_data_check",sql`length(btrim(${t.recipientName}))>0 and length(btrim(${t.phone}))>0 and length(btrim(${t.address}))>0 and length(btrim(${t.commune}))>0 and length(${t.requestHash})=64 and ${t.evaluationExpiresAt}>${t.createdAt}`),
  uniqueIndex("delivery_quote_client_key_unique").on(t.clientId,t.requestKey).where(sql`${t.clientId} is not null`),
  uniqueIndex("delivery_quote_guest_key_unique").on(t.guestSessionHash,t.requestKey).where(sql`${t.guestSessionHash} is not null`),
  index("delivery_quote_assignee_idx").on(t.assignedTo,t.status), index("delivery_quote_client_idx").on(t.clientId,t.createdAt), index("delivery_quote_expiry_idx").on(t.status,t.evaluationExpiresAt),
]);

export const deliveryQuoteItemsTable = pgTable("delivery_quote_items", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(), requestId: integer("request_id").notNull().references(()=>deliveryQuoteRequestsTable.id,{onDelete:"restrict"}),
  productId: integer("product_id").notNull().references(()=>productsTable.id,{onDelete:"restrict"}), quantity: integer().notNull(),
  productName: varchar("product_name",{length:150}).notNull(), unitMeasure: varchar("unit_measure",{length:50}).notNull(),
},t=>[uniqueIndex("delivery_quote_item_unique").on(t.requestId,t.productId),check("delivery_quote_quantity_check",sql`${t.quantity}>0`)]);

export const deliveryQuoteRevisionsTable = pgTable("delivery_quote_revisions", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(), requestId: integer("request_id").notNull().references(()=>deliveryQuoteRequestsTable.id,{onDelete:"restrict"}),
  version: integer().notNull(), kind: varchar({length:16}).notNull(), sourceRevisionId: integer("source_revision_id").references(():AnyPgColumn=>deliveryQuoteRevisionsTable.id,{onDelete:"restrict"}),
  amount: numeric({precision:12,scale:2}).notNull(), reason: varchar({length:30}).notNull(),
  vehicle: varchar({length:120}), distanceKm: numeric("distance_km",{precision:10,scale:2}), trips: integer(), routeConfirmed: boolean("route_confirmed").notNull().default(false),
  coordinated: boolean().notNull().default(false), notes: varchar({length:1000}).notNull(), customerNote: varchar("customer_note",{length:500}),
  policyRevisionId: integer("policy_revision_id").notNull().references(()=>deliveryPolicyRevisionsTable.id,{onDelete:"restrict"}),
  productsNet: numeric("products_net",{precision:12,scale:2}), thresholdSnapshot: numeric("threshold_snapshot",{precision:12,scale:2}),
  validUntil: timestamp("valid_until",{withTimezone:true}), createdBy: integer("created_by").notNull().references(()=>usersTable.id,{onDelete:"restrict"}), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("delivery_quote_revision_version_unique").on(t.requestId,t.version), uniqueIndex("delivery_quote_revision_request_unique").on(t.id,t.requestId),
  foreignKey({name:"delivery_quote_source_same_request_fk",columns:[t.sourceRevisionId,t.requestId],foreignColumns:[t.id,t.requestId]}),
  check("delivery_quote_revision_check",sql`${t.version}>0 and ${t.amount}>=0 and ${t.amount}=trunc(${t.amount}) and ${t.kind} in ('PROPOSAL','APPROVED') and (${t.distanceKm} is null or ${t.distanceKm}>=0) and (${t.trips} is null or ${t.trips}>0) and length(btrim(${t.notes}))>=8 and ((${t.kind}='PROPOSAL' and ${t.validUntil} is null and ${t.sourceRevisionId} is null) or (${t.kind}='APPROVED' and ${t.sourceRevisionId} is not null and ${t.sourceRevisionId}<>${t.id} and ${t.validUntil} is not null and ${t.validUntil}>${t.createdAt}))`),
  check("delivery_quote_reason_check",sql`(${t.reason}='PAID_FREIGHT' and ${t.amount}>0) or (${t.reason}='FREE_RADIUS' and ${t.amount}=0 and ${t.routeConfirmed}=true and ${t.distanceKm} is not null and ${t.distanceKm}<=5) or (${t.reason}='FREE_CONDITIONAL' and ${t.amount}=0 and ${t.coordinated}=true) or (${t.reason}='FREE_EXCEPTION' and ${t.amount}=0)`),
]);

export const deliveryQuoteEventsTable = pgTable("delivery_quote_events", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(), requestId: integer("request_id").notNull().references(()=>deliveryQuoteRequestsTable.id,{onDelete:"restrict"}),
  revisionId: integer("revision_id"), actorId: integer("actor_id").references(()=>usersTable.id,{onDelete:"restrict"}), actorKind: varchar("actor_kind",{length:16}).notNull(),
  type: varchar({length:30}).notNull(), commandKey: varchar("command_key",{length:80}), commandHash: varchar("command_hash",{length:64}), payload: jsonb().notNull(), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("delivery_quote_command_unique").on(t.requestId,t.commandKey), uniqueIndex("delivery_quote_event_request_unique").on(t.id,t.requestId),
  foreignKey({name:"delivery_quote_event_revision_fk",columns:[t.revisionId,t.requestId],foreignColumns:[deliveryQuoteRevisionsTable.id,deliveryQuoteRevisionsTable.requestId]}),
  check("delivery_quote_event_check",sql`${t.actorKind} in ('USER','GUEST','SYSTEM') and ((${t.actorKind}='USER' and ${t.actorId} is not null) or (${t.actorKind}<>'USER' and ${t.actorId} is null)) and ${t.type} in ('REQUESTED','ASSIGNED','PROPOSED','APPROVED','CORRECTIONS','REJECTED','CANCELLED','EXPIRED','ACCESS_RECOVERED','ACCESS_REVOKED','ACCEPTED','ORDER_CREATED','PAYMENT_CLOSED') and ((${t.commandKey} is null and ${t.commandHash} is null) or (${t.commandKey} is not null and ${t.commandHash} is not null and length(${t.commandHash})=64))`),
]);

export const guestDeliveryQuoteTokensTable = pgTable("guest_delivery_quote_tokens", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(), requestId: integer("request_id").notNull().references(()=>deliveryQuoteRequestsTable.id,{onDelete:"restrict"}),
  tokenHash: varchar("token_hash",{length:64}).notNull().unique(), expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(), revokedAt: timestamp("revoked_at",{withTimezone:true}), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("guest_delivery_quote_request_idx").on(t.requestId),check("guest_delivery_quote_token_check",sql`length(${t.tokenHash})=64 and ${t.expiresAt}>${t.createdAt}`)]);

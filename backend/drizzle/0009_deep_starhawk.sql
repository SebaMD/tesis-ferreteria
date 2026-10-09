CREATE TABLE "online_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "online_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"checkout_key" varchar(64) NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"reservation_expires_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "online_orders_status_check" CHECK ("online_orders"."status" in ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW')),
	CONSTRAINT "online_orders_total_positive" CHECK ("online_orders"."total" > 0)
);
--> statement-breakpoint
CREATE TABLE "online_order_items" (
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "online_order_items_order_id_product_id_pk" PRIMARY KEY("order_id","product_id"),
	CONSTRAINT "online_order_items_quantity_positive" CHECK ("online_order_items"."quantity" > 0),
	CONSTRAINT "online_order_items_unit_price_non_negative" CHECK ("online_order_items"."unit_price" >= 0),
	CONSTRAINT "online_order_items_subtotal_non_negative" CHECK ("online_order_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "online_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "online_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"provider" varchar(30) DEFAULT 'WEBPAY_PLUS' NOT NULL,
	"buy_order" varchar(26) NOT NULL,
	"session_id" varchar(61) NOT NULL,
	"token" varchar(64),
	"redirect_url" varchar(500),
	"amount" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'CREATED' NOT NULL,
	"authorization_code" varchar(6),
	"payment_type_code" varchar(4),
	"response_code" integer,
	"transaction_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "online_payments_provider_check" CHECK ("online_payments"."provider" = 'WEBPAY_PLUS'),
	CONSTRAINT "online_payments_status_check" CHECK ("online_payments"."status" in ('CREATED', 'AUTHORIZED', 'FAILED', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "online_payments_amount_positive" CHECK ("online_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "online_orders_client_id_idx" ON "online_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "online_orders_status_idx" ON "online_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "online_orders_reservation_expires_at_idx" ON "online_orders" USING btree ("reservation_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_client_checkout_key_unique" ON "online_orders" USING btree ("client_id","checkout_key");--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_pending_client_unique" ON "online_orders" USING btree ("client_id") WHERE "online_orders"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE INDEX "online_order_items_product_id_idx" ON "online_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "online_payments_order_id_idx" ON "online_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "online_payments_status_idx" ON "online_payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "online_payments_buy_order_unique" ON "online_payments" USING btree ("buy_order");--> statement-breakpoint
CREATE UNIQUE INDEX "online_payments_token_unique" ON "online_payments" USING btree ("token");
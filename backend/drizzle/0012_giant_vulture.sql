ALTER TABLE "online_orders" DROP CONSTRAINT "online_orders_status_check";--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_type" varchar(20) DEFAULT 'PICKUP' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_recipient_name" varchar(240);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_address" varchar(300);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_commune" varchar(120);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_reference" varchar(500);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "preparation_started_by" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "preparation_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "prepared_by" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "prepared_at" timestamp;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_started_by" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivered_by" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_preparation_started_by_users_id_fk" FOREIGN KEY ("preparation_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivery_started_by_users_id_fk" FOREIGN KEY ("delivery_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "online_orders_delivery_type_idx" ON "online_orders" USING btree ("delivery_type");--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivery_type_check" CHECK ("online_orders"."delivery_type" in ('PICKUP', 'DELIVERY'));--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivery_data_check" CHECK ("online_orders"."delivery_type" = 'PICKUP' or (
        "online_orders"."delivery_recipient_name" is not null
        and length(btrim("online_orders"."delivery_recipient_name")) > 0
        and "online_orders"."delivery_phone" is not null
        and length(btrim("online_orders"."delivery_phone")) > 0
        and "online_orders"."delivery_address" is not null
        and length(btrim("online_orders"."delivery_address")) > 0
        and "online_orders"."delivery_commune" is not null
        and length(btrim("online_orders"."delivery_commune")) > 0
      ));--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_status_check" CHECK ("online_orders"."status" in ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'PAYMENT_REVIEW', 'PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'));
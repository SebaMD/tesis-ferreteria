CREATE TABLE "sale_deliveries" (
	"sale_id" integer PRIMARY KEY NOT NULL,
	"status" varchar(30) DEFAULT 'PAID' NOT NULL,
	"recipient_name" varchar(240) NOT NULL,
	"recipient_rut" varchar(12) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" varchar(300) NOT NULL,
	"commune" varchar(120) NOT NULL,
	"reference" varchar(500),
	"latitude" double precision,
	"longitude" double precision,
	"preparation_started_by" integer,
	"preparation_started_at" timestamp,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"delivery_started_by" integer,
	"delivery_started_at" timestamp,
	"delivered_by" integer,
	"delivered_at" timestamp,
	"received_by_name" varchar(240),
	"received_by_rut" varchar(12),
	"delivery_proof_image_path" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sale_deliveries_status_check" CHECK ("sale_deliveries"."status" in ('PAID', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')),
	CONSTRAINT "sale_deliveries_delivery_data_check" CHECK (length(btrim("sale_deliveries"."recipient_name")) > 0
        and length(btrim("sale_deliveries"."recipient_rut")) > 0
        and length(btrim("sale_deliveries"."phone")) > 0
        and length(btrim("sale_deliveries"."address")) > 0
        and length(btrim("sale_deliveries"."commune")) > 0),
	CONSTRAINT "sale_deliveries_coordinates_check" CHECK ((
        "sale_deliveries"."latitude" is null and "sale_deliveries"."longitude" is null
      ) or (
        "sale_deliveries"."latitude" is not null
        and "sale_deliveries"."longitude" is not null
        and "sale_deliveries"."latitude" between -90 and 90
        and "sale_deliveries"."longitude" between -180 and 180
      ))
);
--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_latitude" double precision;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_longitude" double precision;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "received_by_name" varchar(240);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "received_by_rut" varchar(12);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "delivery_proof_image_path" varchar(500);--> statement-breakpoint
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_preparation_started_by_users_id_fk" FOREIGN KEY ("preparation_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_delivery_started_by_users_id_fk" FOREIGN KEY ("delivery_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_deliveries_status_idx" ON "sale_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sale_deliveries_preparation_started_by_idx" ON "sale_deliveries" USING btree ("preparation_started_by");--> statement-breakpoint
CREATE INDEX "sale_deliveries_delivery_started_by_idx" ON "sale_deliveries" USING btree ("delivery_started_by");--> statement-breakpoint
CREATE INDEX "sale_deliveries_created_at_idx" ON "sale_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "online_orders_preparation_started_by_idx" ON "online_orders" USING btree ("preparation_started_by");--> statement-breakpoint
CREATE INDEX "online_orders_delivery_started_by_idx" ON "online_orders" USING btree ("delivery_started_by");--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivery_coordinates_check" CHECK ((
        "online_orders"."delivery_latitude" is null and "online_orders"."delivery_longitude" is null
      ) or (
        "online_orders"."delivery_latitude" is not null
        and "online_orders"."delivery_longitude" is not null
        and "online_orders"."delivery_latitude" between -90 and 90
        and "online_orders"."delivery_longitude" between -180 and 180
      ));

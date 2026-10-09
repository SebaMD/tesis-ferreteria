CREATE TABLE "client_delivery_addresses" (
	"client_id" integer PRIMARY KEY NOT NULL,
	"recipient_name" varchar(240) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" varchar(300) NOT NULL,
	"commune" varchar(120) NOT NULL,
	"reference" varchar(500),
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_delivery_addresses_required_data_check" CHECK (length(btrim("client_delivery_addresses"."recipient_name")) > 0
        and length(btrim("client_delivery_addresses"."phone")) > 0
        and length(btrim("client_delivery_addresses"."address")) > 0
        and length(btrim("client_delivery_addresses"."commune")) > 0),
	CONSTRAINT "client_delivery_addresses_coordinates_check" CHECK ((
        "client_delivery_addresses"."latitude" is null and "client_delivery_addresses"."longitude" is null
      ) or (
        "client_delivery_addresses"."latitude" is not null
        and "client_delivery_addresses"."longitude" is not null
        and "client_delivery_addresses"."latitude" between -90 and 90
        and "client_delivery_addresses"."longitude" between -180 and 180
      ))
);
--> statement-breakpoint
ALTER TABLE "client_delivery_addresses" ADD CONSTRAINT "client_delivery_addresses_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
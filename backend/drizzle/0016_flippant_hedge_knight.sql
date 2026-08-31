ALTER TABLE "online_orders" DROP CONSTRAINT "online_orders_owner_check";--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "guest_device_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "online_orders_guest_device_hash_idx" ON "online_orders" USING btree ("guest_device_hash") WHERE "online_orders"."guest_device_hash" is not null;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_guest_device_hash_length_check" CHECK ("online_orders"."guest_device_hash" is null or length("online_orders"."guest_device_hash") = 64);--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_owner_check" CHECK ((
        "online_orders"."client_id" is not null
        and "online_orders"."guest_name" is null
        and "online_orders"."guest_email" is null
        and "online_orders"."guest_phone" is null
        and "online_orders"."guest_session_hash" is null
        and "online_orders"."guest_device_hash" is null
      ) or (
        "online_orders"."client_id" is null
        and "online_orders"."guest_name" is not null
        and length(btrim("online_orders"."guest_name")) > 0
        and "online_orders"."guest_email" is not null
        and length(btrim("online_orders"."guest_email")) > 0
        and "online_orders"."guest_phone" is not null
        and length(btrim("online_orders"."guest_phone")) > 0
        and "online_orders"."guest_session_hash" is not null
        and length("online_orders"."guest_session_hash") = 64
      ));
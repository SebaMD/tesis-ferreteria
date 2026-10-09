CREATE TABLE "guest_order_access_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guest_order_access_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guest_order_access_tokens_hash_length_check" CHECK (length("guest_order_access_tokens"."token_hash") = 64),
	CONSTRAINT "guest_order_access_tokens_expiration_check" CHECK ("guest_order_access_tokens"."expires_at" > "guest_order_access_tokens"."created_at")
);
--> statement-breakpoint
DROP INDEX "online_orders_client_checkout_key_unique";--> statement-breakpoint
DROP INDEX "online_orders_pending_client_unique";--> statement-breakpoint
ALTER TABLE "inventory_movements" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "online_order_id" integer;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "guest_name" varchar(240);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "guest_email" varchar(254);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "guest_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "guest_session_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "guest_order_access_tokens" ADD CONSTRAINT "guest_order_access_tokens_order_id_online_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."online_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_order_access_tokens_order_id_idx" ON "guest_order_access_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_order_access_tokens_hash_unique" ON "guest_order_access_tokens" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_online_order_id_online_orders_id_fk" FOREIGN KEY ("online_order_id") REFERENCES "public"."online_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_online_order_product_exit_unique" ON "inventory_movements" USING btree ("online_order_id","product_id","movement_type") WHERE "inventory_movements"."online_order_id" is not null and "inventory_movements"."movement_type" = 'EXIT';--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_guest_checkout_key_unique" ON "online_orders" USING btree ("guest_session_hash","checkout_key") WHERE "online_orders"."guest_session_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_pending_guest_session_unique" ON "online_orders" USING btree ("guest_session_hash") WHERE "online_orders"."guest_session_hash" is not null and "online_orders"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_client_checkout_key_unique" ON "online_orders" USING btree ("client_id","checkout_key") WHERE "online_orders"."client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "online_orders_pending_client_unique" ON "online_orders" USING btree ("client_id") WHERE "online_orders"."client_id" is not null and "online_orders"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_or_online_order_check" CHECK ("inventory_movements"."user_id" is not null or (
        "inventory_movements"."online_order_id" is not null and "inventory_movements"."movement_type" = 'EXIT'
      ));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_online_order_exit_check" CHECK ("inventory_movements"."online_order_id" is null or "inventory_movements"."movement_type" = 'EXIT');--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_owner_check" CHECK ((
        "online_orders"."client_id" is not null
        and "online_orders"."guest_name" is null
        and "online_orders"."guest_email" is null
        and "online_orders"."guest_phone" is null
        and "online_orders"."guest_session_hash" is null
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
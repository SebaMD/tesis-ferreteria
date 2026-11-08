DROP INDEX "online_orders_pending_client_unique";--> statement-breakpoint
DROP INDEX "online_orders_pending_guest_session_unique";--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "checkout_request_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "online_payments" ADD COLUMN "next_reconciliation_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX "online_payments_next_reconciliation_idx" ON "online_payments" USING btree ("next_reconciliation_at");--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_checkout_request_hash_check" CHECK ("online_orders"."checkout_request_hash" is null or "online_orders"."checkout_request_hash" ~ '^[a-f0-9]{64}$');

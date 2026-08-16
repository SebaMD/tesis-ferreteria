ALTER TABLE "sale_cancellation_request_items" DROP CONSTRAINT "sale_cancellation_request_items_sale_id_sales_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" DROP CONSTRAINT "sale_cancellation_request_items_sale_detail_fk";
--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" DROP COLUMN "sale_id";
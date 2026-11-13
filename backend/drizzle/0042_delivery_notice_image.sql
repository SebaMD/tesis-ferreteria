ALTER TABLE "catalog_presentation" ADD COLUMN "delivery_image_path" varchar(500);--> statement-breakpoint
ALTER TABLE "catalog_presentation" ADD COLUMN "delivery_image_revision" integer DEFAULT 0 NOT NULL;

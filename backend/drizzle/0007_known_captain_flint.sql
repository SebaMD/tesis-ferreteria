ALTER TABLE "products" ADD COLUMN "barcode" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_unique" ON "products" USING btree ("barcode");
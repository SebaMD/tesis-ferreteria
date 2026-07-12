ALTER TABLE "users" ADD COLUMN "work_shift" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shift_start_time" varchar(5);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shift_end_time" varchar(5);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shift_note" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "products_category_name_unique" ON "products" USING btree ("category_id",lower("name"));
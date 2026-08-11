CREATE TABLE "sale_cancellation_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sale_cancellation_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sale_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"admin_response" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD CONSTRAINT "sale_cancellation_requests_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD CONSTRAINT "sale_cancellation_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD CONSTRAINT "sale_cancellation_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sale_cancellation_requests_sale_id_idx" ON "sale_cancellation_requests" USING btree ("sale_id");
--> statement-breakpoint
CREATE INDEX "sale_cancellation_requests_requested_by_idx" ON "sale_cancellation_requests" USING btree ("requested_by");
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_cancellation_requests_pending_sale_unique" ON "sale_cancellation_requests" USING btree ("sale_id") WHERE "sale_cancellation_requests"."status" = 'PENDING';

CREATE TABLE "sale_cancellation_request_items" (
	"request_id" integer NOT NULL,
	"sale_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"requested_quantity" integer NOT NULL,
	CONSTRAINT "sale_cancellation_request_items_request_id_product_id_pk" PRIMARY KEY("request_id","product_id"),
	CONSTRAINT "sale_cancellation_request_items_quantity_positive" CHECK ("sale_cancellation_request_items"."requested_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "sale_details" ADD COLUMN "returned_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD COLUMN "reversed_by" integer;--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD COLUMN "reversed_at" timestamp;--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" ADD CONSTRAINT "sale_cancellation_request_items_request_id_sale_cancellation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sale_cancellation_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" ADD CONSTRAINT "sale_cancellation_request_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" ADD CONSTRAINT "sale_cancellation_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_cancellation_request_items" ADD CONSTRAINT "sale_cancellation_request_items_sale_detail_fk" FOREIGN KEY ("sale_id","product_id") REFERENCES "public"."sale_details"("sale_id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD CONSTRAINT "sale_cancellation_requests_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_cancellation_requests_reversed_by_idx" ON "sale_cancellation_requests" USING btree ("reversed_by");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_status_check" CHECK ("sales"."status" in ('ACTIVE', 'PARTIALLY_RETURNED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "sale_details" ADD CONSTRAINT "sale_details_returned_quantity_non_negative" CHECK ("sale_details"."returned_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "sale_details" ADD CONSTRAINT "sale_details_returned_quantity_not_above_sold" CHECK ("sale_details"."returned_quantity" <= "sale_details"."quantity");--> statement-breakpoint
ALTER TABLE "sale_cancellation_requests" ADD CONSTRAINT "sale_cancellation_requests_status_check" CHECK ("sale_cancellation_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED'));--> statement-breakpoint
WITH "current_approved_requests" AS (
	SELECT
		"sales"."id" AS "sale_id",
		CASE
			WHEN "sales"."status" = 'CANCELLED'
				AND (
					"latest_movement"."reason" IS NULL
					OR "latest_movement"."reason" = 'Cancelación aprobada de venta V-' || lpad("sales"."id"::text, 6, '0')
				)
			THEN (
				SELECT "request"."id"
				FROM "sale_cancellation_requests" AS "request"
				WHERE "request"."sale_id" = "sales"."id"
					AND "request"."status" = 'APPROVED'
				ORDER BY "request"."reviewed_at" DESC NULLS LAST, "request"."id" DESC
				LIMIT 1
			)
			ELSE NULL
		END AS "request_id"
	FROM "sales"
	LEFT JOIN LATERAL (
		SELECT "movement"."reason"
		FROM "inventory_movements" AS "movement"
		WHERE "movement"."movement_type" = 'ENTRY'
			AND EXISTS (
				SELECT 1
				FROM "sale_details" AS "detail"
				WHERE "detail"."sale_id" = "sales"."id"
					AND "detail"."product_id" = "movement"."product_id"
			)
			AND (
				"movement"."reason" = 'Cancelación de venta #' || "sales"."id"::text
				OR "movement"."reason" = 'Cancelación aprobada de venta V-' || lpad("sales"."id"::text, 6, '0')
			)
		ORDER BY "movement"."date" DESC, "movement"."id" DESC
		LIMIT 1
	) AS "latest_movement" ON true
)
UPDATE "sale_cancellation_requests" AS "request"
SET
	"status" = 'REVERSED',
	"updated_at" = now()
FROM "sales" AS "sale"
LEFT JOIN "current_approved_requests" AS "current_request"
	ON "current_request"."sale_id" = "sale"."id"
WHERE "request"."sale_id" = "sale"."id"
	AND "request"."status" = 'APPROVED'
	AND "request"."id" IS DISTINCT FROM "current_request"."request_id";--> statement-breakpoint
INSERT INTO "sale_cancellation_requests" (
	"sale_id",
	"requested_by",
	"reason",
	"status",
	"reviewed_by",
	"admin_response",
	"requested_at",
	"reviewed_at",
	"created_at",
	"updated_at"
)
SELECT
	"sale"."id",
	COALESCE(
		"latest_movement"."user_id",
		(
			SELECT "admin_user"."id"
			FROM "users" AS "admin_user"
			INNER JOIN "roles" AS "admin_role" ON "admin_role"."id" = "admin_user"."role_id"
			WHERE "admin_role"."name" = 'ADMIN' AND "admin_user"."status" = 'ACTIVE'
			ORDER BY "admin_user"."id"
			LIMIT 1
		),
		"sale"."user_id"
	),
	'Cancelación directa histórica migrada de V-' || lpad("sale"."id"::text, 6, '0'),
	'APPROVED',
	COALESCE(
		"latest_movement"."user_id",
		(
			SELECT "admin_user"."id"
			FROM "users" AS "admin_user"
			INNER JOIN "roles" AS "admin_role" ON "admin_role"."id" = "admin_user"."role_id"
			WHERE "admin_role"."name" = 'ADMIN' AND "admin_user"."status" = 'ACTIVE'
			ORDER BY "admin_user"."id"
			LIMIT 1
		),
		"sale"."user_id"
	),
	'Registro generado al migrar una cancelación directa existente',
	COALESCE("latest_movement"."date", "sale"."updated_at", "sale"."date"),
	COALESCE("latest_movement"."date", "sale"."updated_at", "sale"."date"),
	COALESCE("latest_movement"."date", "sale"."updated_at", "sale"."date"),
	COALESCE("latest_movement"."date", "sale"."updated_at", "sale"."date")
FROM "sales" AS "sale"
LEFT JOIN LATERAL (
	SELECT "movement"."user_id", "movement"."date"
	FROM "inventory_movements" AS "movement"
	WHERE "movement"."movement_type" = 'ENTRY'
		AND EXISTS (
			SELECT 1
			FROM "sale_details" AS "detail"
			WHERE "detail"."sale_id" = "sale"."id"
				AND "detail"."product_id" = "movement"."product_id"
		)
		AND "movement"."reason" = 'Cancelación de venta #' || "sale"."id"::text
	ORDER BY "movement"."date" DESC, "movement"."id" DESC
	LIMIT 1
) AS "latest_movement" ON true
WHERE "sale"."status" = 'CANCELLED'
	AND NOT EXISTS (
		SELECT 1
		FROM "sale_cancellation_requests" AS "approved_request"
		WHERE "approved_request"."sale_id" = "sale"."id"
			AND "approved_request"."status" = 'APPROVED'
	);--> statement-breakpoint
INSERT INTO "sale_cancellation_request_items" (
	"request_id",
	"sale_id",
	"product_id",
	"requested_quantity"
)
SELECT
	"request"."id",
	"request"."sale_id",
	"detail"."product_id",
	"detail"."quantity"
FROM "sale_cancellation_requests" AS "request"
INNER JOIN "sale_details" AS "detail" ON "detail"."sale_id" = "request"."sale_id"
ON CONFLICT ("request_id", "product_id") DO NOTHING;--> statement-breakpoint
UPDATE "sale_details" AS "detail"
SET
	"returned_quantity" = CASE
		WHEN "sale"."status" = 'CANCELLED' THEN "detail"."quantity"
		ELSE 0
	END,
	"updated_at" = now()
FROM "sales" AS "sale"
WHERE "sale"."id" = "detail"."sale_id";

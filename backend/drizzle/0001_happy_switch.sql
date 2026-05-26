ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE varchar(50);--> statement-breakpoint
UPDATE "users"
SET "status" = CASE
	WHEN "status" = 'aprobado' THEN 'ACTIVE'
	WHEN "status" = 'pendiente' THEN 'INACTIVE'
	WHEN "status" = 'rechazado' THEN 'INACTIVE'
	ELSE "status"
END;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
UPDATE "sales"
SET "status" = CASE
	WHEN "status" = 'cancelada' THEN 'CANCELLED'
	ELSE 'ACTIVE'
END;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
DROP TYPE "public"."account_status";

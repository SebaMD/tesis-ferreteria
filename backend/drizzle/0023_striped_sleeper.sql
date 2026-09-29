CREATE TABLE "catalog_presentation" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"title" varchar(120) NOT NULL,
	"main_text" varchar(220) NOT NULL,
	"secondary_text" varchar(600) NOT NULL,
	"image_path" varchar(500),
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_presentation_singleton_check" CHECK ("catalog_presentation"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "catalog_presentation" ("id", "title", "main_text", "secondary_text")
VALUES (
	1,
	'Catálogo Ferretería FYF',
	'Encuentra materiales y herramientas para tu próximo proyecto',
	'Consulta precios y disponibilidad para comprar de forma segura mediante Webpay Plus.'
);--> statement-breakpoint
ALTER TABLE "customer_notice" ADD COLUMN "image_path" varchar(500);--> statement-breakpoint
ALTER TABLE "catalog_presentation" ADD CONSTRAINT "catalog_presentation_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

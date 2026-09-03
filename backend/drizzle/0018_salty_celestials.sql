CREATE TABLE "client_product_favorites" (
	"client_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_product_favorites_client_id_product_id_pk" PRIMARY KEY("client_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" varchar(100);--> statement-breakpoint
ALTER TABLE "client_product_favorites" ADD CONSTRAINT "client_product_favorites_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_product_favorites" ADD CONSTRAINT "client_product_favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
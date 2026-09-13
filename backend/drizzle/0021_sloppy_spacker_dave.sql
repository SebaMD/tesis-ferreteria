CREATE TABLE "customer_notice" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"title" varchar(120) DEFAULT '' NOT NULL,
	"message" varchar(1000) DEFAULT '' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_notice_singleton_check" CHECK ("customer_notice"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "email_verification_challenges" DROP CONSTRAINT "email_verification_purpose_check";--> statement-breakpoint
ALTER TABLE "email_verification_challenges" DROP CONSTRAINT "email_verification_owner_check";--> statement-breakpoint
UPDATE "users"
SET "email_verified_at" = now()
WHERE "email_verified_at" IS NULL
  AND "role_id" IN (
    SELECT "id" FROM "roles"
    WHERE "name" IN ('ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE')
  );--> statement-breakpoint
ALTER TABLE "customer_notice" ADD CONSTRAINT "customer_notice_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_purpose_check" CHECK ("email_verification_challenges"."purpose" in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'GUEST_CHECKOUT', 'INTERNAL_USER_REGISTRATION'));--> statement-breakpoint
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_owner_check" CHECK ((
        "email_verification_challenges"."purpose" in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'INTERNAL_USER_REGISTRATION')
        and "email_verification_challenges"."user_id" is not null
        and "email_verification_challenges"."guest_session_hash" is null
      ) or (
        "email_verification_challenges"."purpose" = 'GUEST_CHECKOUT'
        and "email_verification_challenges"."user_id" is null
        and "email_verification_challenges"."guest_session_hash" is not null
        and length("email_verification_challenges"."guest_session_hash") = 64
      ));

ALTER TABLE "email_verification_challenges" DROP CONSTRAINT "email_verification_purpose_check";--> statement-breakpoint
ALTER TABLE "email_verification_challenges" DROP CONSTRAINT "email_verification_owner_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "self_deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_version_check" CHECK ("users"."auth_version" >= 1);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_self_deactivation_check" CHECK ("users"."self_deactivated_at" is null or "users"."status" = 'INACTIVE');--> statement-breakpoint
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_purpose_check" CHECK ("email_verification_challenges"."purpose" in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'GUEST_CHECKOUT', 'INTERNAL_USER_REGISTRATION', 'CLIENT_REACTIVATION'));--> statement-breakpoint
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_owner_check" CHECK ((
        "email_verification_challenges"."purpose" in ('CLIENT_REGISTRATION', 'CLIENT_EMAIL_CHANGE', 'INTERNAL_USER_REGISTRATION', 'CLIENT_REACTIVATION')
        and "email_verification_challenges"."user_id" is not null
        and "email_verification_challenges"."guest_session_hash" is null
      ) or (
        "email_verification_challenges"."purpose" = 'GUEST_CHECKOUT'
        and "email_verification_challenges"."user_id" is null
        and "email_verification_challenges"."guest_session_hash" is not null
        and length("email_verification_challenges"."guest_session_hash") = 64
      ));
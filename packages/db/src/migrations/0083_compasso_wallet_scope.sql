ALTER TYPE "billing"."owner_type" ADD VALUE 'family';--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "consumer_app" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."credit_reservations" ADD COLUMN "consumer_app" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_reservations" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_reservations" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "billing"."customers" ADD CONSTRAINT "customers_subject_kind" CHECK ("billing"."customers"."subject_type" in ('user', 'organization'));
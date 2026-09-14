ALTER TABLE "billing"."subscriptions" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "billing"."subscriptions"
SET "confirmed_at" = COALESCE("updated_at", "created_at", now())
WHERE "status" IN ('active', 'trialing');

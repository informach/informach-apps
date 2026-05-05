ALTER TABLE "billing"."subscriptions" ADD COLUMN "next_credit_grant_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "pending_product_id" text;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "pending_price_id" text;--> statement-breakpoint
CREATE INDEX "subscriptions_next_grant_idx" ON "billing"."subscriptions" USING btree ("next_credit_grant_at") WHERE "billing"."subscriptions"."next_credit_grant_at" IS NOT NULL;
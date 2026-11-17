CREATE TABLE "billing"."legacy_checkout_resolutions" (
	"provider_session_id" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"checkout_intent_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_checkout_resolutions" ADD CONSTRAINT "legacy_checkout_resolutions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_checkout_resolutions" ADD CONSTRAINT "legacy_checkout_resolutions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_checkout_resolution_customer_idx" ON "billing"."legacy_checkout_resolutions" USING btree ("customer_id");
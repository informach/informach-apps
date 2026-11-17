CREATE TABLE "billing"."legacy_contract_observations" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"status" "billing"."subscription_status" NOT NULL,
	"provider_price_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_observations" ADD CONSTRAINT "legacy_contract_observations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;